#!/usr/bin/env python3
"""
Robotic Park Lab — nodo de navegación con obstáculos (generado por el configurador web).

Se coloca entre el supervisor y los drivers de Robotic Park, sin modificarlos:

    supervisor --(<robot>/nav_goal)--> navegacion.py --(<robot>/target_pose)--> driver

Para cada robot con una estrategia distinta de «direct», recibe el objetivo en
<robot>/nav_goal, calcula la ruta (A*, RRT) o la fuerza (campos de potencial) y va
publicando en <robot>/target_pose un punto intermedio a poca distancia por delante
(«zanahoria»), que el controlador de posición del driver persigue. Al llegar publica
el objetivo exacto y deja de intervenir. Si llega swarm/order = formation_run, land o
end, cancela la navegación para no interferir con la ley de formación.

Publica además /obstacles (MarkerArray) y <robot>/nav_path (Path) para RViz.

DÓNDE EDITAR (busca «NAVEGACION:» en este fichero y en los drivers)
  - footprint() / sdf()        geometría de los obstáculos y distancia a ellos
  - astar(), rrt()             planificadores globales (estrategias astar, rrt, hybrid)
  - apf_force()                campos de potencial (estrategia apf)
  - robot_repulsion()          evitación entre robots (apf, hybrid)
  - Navegacion.on_goal()       qué se hace al recibir un objetivo (planificar)
  - Navegacion.step()          qué consigna se envía en cada ciclo (10 Hz)
Para añadir una estrategia: dale un nombre en navegacion.json (robots[].strategy), trátala en
on_goal() y step(), y añádela a STRATEGIES en configurador/navegacion.js (texto de ayuda y vista
previa). En los drivers, el objetivo llega al callback marcado con «NAVEGACION:».

Uso:  python3 navegacion.py navegacion.json
Solo necesita ROS 2 Humble (rclpy, geometry_msgs, nav_msgs, visualization_msgs).
Las funciones de geometría y planificación son las mismas que usa la vista previa
del configurador (configurador/navegacion.js).
"""
import heapq
import json
import math
import sys

M32 = 0xFFFFFFFF
SQRT2 = math.sqrt(2.0)
DEFAULTS = dict(margin=0.15, d0=0.6, eta=0.15, etaRobot=0.2, res=0.05, bound=3.0)
RADIUS = dict(air=0.08, ground=0.07)   # radio del robot: Crazyflie con hélices, Khepera IV
GROUND_BAND = (0.0, 0.12)


# ---------------------------------------------------------------------- geometría
def height(o):
    return float(o['sz']) if o['shape'] == 'box' else float(o['h']) if o['shape'] == 'cylinder' else 2 * float(o['r'])


def center_z(o):
    return height(o) / 2 if o.get('ground') else float(o['z'])


def z_range(o):
    z, h = center_z(o), height(o) / 2
    return z - h, z + h


# NAVEGACION: geometría de obstáculos
def footprint(o, zlo, zhi, infl):
    a, b = z_range(o)
    if b < zlo - infl or a > zhi + infl:
        return None
    if o['shape'] == 'box':
        y = float(o.get('yaw', 0) or 0) * math.pi / 180
        return dict(t='rect', x=float(o['x']), y=float(o['y']), hx=float(o['sx']) / 2, hy=float(o['sy']) / 2,
                    c=math.cos(y), s=math.sin(y), infl=infl)
    if o['shape'] == 'cylinder':
        return dict(t='circ', x=float(o['x']), y=float(o['y']), r=float(o['r']), infl=infl)
    zc, r = center_z(o), float(o['r'])
    dz = zlo - zc if zc < zlo else (zc - zhi if zc > zhi else 0.0)
    rr = 0.0 if dz >= r else math.sqrt(r * r - dz * dz)
    return dict(t='circ', x=float(o['x']), y=float(o['y']), r=rr, infl=max(0.0, infl - (dz - r)) if dz >= r else infl)


def sdf(f, x, y):
    if f['t'] == 'circ':
        return math.hypot(x - f['x'], y - f['y']) - f['r'] - f['infl']
    dx, dy = x - f['x'], y - f['y']
    lx = abs(f['c'] * dx + f['s'] * dy) - f['hx']
    ly = abs(-f['s'] * dx + f['c'] * dy) - f['hy']
    out = math.hypot(max(lx, 0.0), max(ly, 0.0))
    inn = min(max(lx, ly), 0.0)
    return out + inn - f['infl']


def min_sdf(F, x, y):
    m = math.inf
    for f in F:
        d = sdf(f, x, y)
        if d < m:
            m = d
    return m


def grad(F, x, y):
    best, m = None, math.inf
    for f in F:
        d = sdf(f, x, y)
        if d < m:
            m, best = d, f
    if best is None:
        return 0.0, 0.0, math.inf
    h = 1e-3
    gx = (sdf(best, x + h, y) - sdf(best, x - h, y)) / (2 * h)
    gy = (sdf(best, x, y + h) - sdf(best, x, y - h)) / (2 * h)
    n = math.hypot(gx, gy) or 1.0
    return gx / n, gy / n, m


def seg_free(F, a, b, step=0.02):
    L = math.hypot(b[0] - a[0], b[1] - a[1])
    n = max(1, math.ceil(L / step))
    for i in range(n + 1):
        t = i / n
        if min_sdf(F, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) <= 0:
            return False
    return True


def footprints(obstacles, air, z0, z1, margin):
    infl = (RADIUS['air'] if air else RADIUS['ground']) + margin
    lo, hi = (min(z0, z1), max(z0, z1)) if air else GROUND_BAND
    return [f for f in (footprint(o, lo, hi, infl) for o in obstacles) if f]


# ---------------------------------------------------------------------- A*
def bounds(a, b, bound):
    return (min(-bound, a[0] - 0.5, b[0] - 0.5), max(bound, a[0] + 0.5, b[0] + 0.5),
            min(-bound, a[1] - 0.5, b[1] - 0.5), max(bound, a[1] + 0.5, b[1] + 0.5))


def prune(F, P):
    if len(P) <= 2:
        return P
    out, i = [P[0]], 0
    while i < len(P) - 1:
        j = len(P) - 1
        while j > i + 1 and not seg_free(F, P[i], P[j]):
            j -= 1
        out.append(P[j])
        i = j
    return out


# NAVEGACION: planificador A* en rejilla
def astar(F, a, b, res=DEFAULTS['res'], bound=DEFAULTS['bound']):
    if seg_free(F, a, b):
        return [list(a[:2]), list(b[:2])]
    x0, x1, y0, y1 = bounds(a, b, bound)
    W, H = math.ceil((x1 - x0) / res) + 1, math.ceil((y1 - y0) / res) + 1
    free = bytearray(W * H)
    for j in range(H):
        for i in range(W):
            free[j * W + i] = 1 if min_sdf(F, x0 + i * res, y0 + j * res) > 0 else 0

    def cell(p):
        return (min(W - 1, max(0, int(math.floor((p[0] - x0) / res + 0.5)))),
                min(H - 1, max(0, int(math.floor((p[1] - y0) / res + 0.5)))))
    si, sj = cell(a)
    gi, gj = cell(b)
    s, g = sj * W + si, gj * W + gi
    free[s] = free[g] = 1
    gs = [math.inf] * (W * H)
    prev = [-1] * (W * H)
    closed = bytearray(W * H)

    def hh(k):
        dx, dy = abs(k % W - gi), abs(k // W - gj)
        return (dx + dy) + (SQRT2 - 2) * min(dx, dy)
    gs[s] = 0.0
    heap = [(hh(s), -0.0, s)]
    nb = ((1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0),
          (1, 1, SQRT2), (1, -1, SQRT2), (-1, 1, SQRT2), (-1, -1, SQRT2))
    while heap:
        _, ngk, k = heapq.heappop(heap)
        gk = -ngk
        if closed[k]:
            continue
        closed[k] = 1
        if k == g:
            break
        ci, cj = k % W, k // W
        for di, dj, c in nb:
            ni, nj = ci + di, cj + dj
            if ni < 0 or nj < 0 or ni >= W or nj >= H:
                continue
            q = nj * W + ni
            if not free[q] or closed[q]:
                continue
            if di and dj and (not free[cj * W + ni] or not free[nj * W + ci]):
                continue
            ng = gk + c
            if ng < gs[q]:
                gs[q] = ng
                prev[q] = k
                heapq.heappush(heap, (ng + hh(q), -ng, q))
    if prev[g] < 0 and g != s:
        return None
    P, k = [], g
    while k >= 0:
        P.append([x0 + (k % W) * res, y0 + (k // W) * res])
        if k == s:
            break
        k = prev[k]
    P.reverse()
    P[0], P[-1] = list(a[:2]), list(b[:2])
    return prune(F, P)


# ---------------------------------------------------------------------- RRT
def rng(seed):
    """mulberry32, idéntico al de la vista previa (navegacion.js)."""
    st = [seed & M32]

    def nxt():
        st[0] = (st[0] + 0x6D2B79F5) & M32
        t = st[0]
        r = ((t ^ (t >> 15)) * (1 | t)) & M32
        r = ((r + (((r ^ (r >> 7)) * (61 | r)) & M32)) & M32) ^ r
        return ((r ^ (r >> 14)) & M32) / 4294967296.0
    return nxt


# NAVEGACION: planificador RRT
def rrt(F, a, b, seed=1, bound=DEFAULTS['bound']):
    if seg_free(F, a, b):
        return [list(a[:2]), list(b[:2])]
    x0, x1, y0, y1 = bounds(a, b, bound)
    R, step = rng(seed), 0.25
    nodes, par = [[a[0], a[1]]], [-1]
    for _ in range(6000):
        goal = R() < 0.1
        q = [b[0], b[1]] if goal else [x0 + R() * (x1 - x0), y0 + R() * (y1 - y0)]
        bi, bd = 0, math.inf
        for k, n in enumerate(nodes):
            d = (n[0] - q[0]) ** 2 + (n[1] - q[1]) ** 2
            if d < bd:
                bd, bi = d, k
        n, d = nodes[bi], math.sqrt(bd)
        if d < 1e-9:
            continue
        nw = q if d <= step else [n[0] + (q[0] - n[0]) * step / d, n[1] + (q[1] - n[1]) * step / d]
        if not seg_free(F, n, nw):
            continue
        nodes.append(nw)
        par.append(bi)
        if seg_free(F, nw, b):
            P, k = [[b[0], b[1]]], len(nodes) - 1
            while k >= 0:
                P.append(nodes[k])
                k = par[k]
            P.reverse()
            return prune(F, P)
    return None


def interp_z(P, z0, z1):
    L = [0.0]
    for i in range(1, len(P)):
        L.append(L[-1] + math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]))
    tot = L[-1] or 1.0
    return [[q[0], q[1], z0 + (z1 - z0) * L[i] / tot] for i, q in enumerate(P)]


def plan_leg_m(strategy, obstacles, air, a, b, p, seed, mg):
    def plan2(z0, z1, A, B):
        F = footprints(obstacles, air, z0, z1, mg)
        if strategy == 'rrt':
            return rrt(F, A, B, seed, p['bound'])
        if strategy in ('astar', 'hybrid'):
            return astar(F, A, B, p['res'], p['bound'])
        return [list(A[:2]), list(B[:2])]
    P = plan2(a[2], b[2], a, b)
    if P:
        return interp_z(P, a[2], b[2])
    if not air or abs(a[2] - b[2]) < 0.05:
        return None

    def vert(q, z):
        return min_sdf(footprints(obstacles, True, q[2], z, mg), q[0], q[1]) > 0
    if vert(a, b[2]):
        P = plan2(b[2], b[2], a, b)
        if P:
            return [[a[0], a[1], a[2]]] + [[q[0], q[1], b[2]] for q in P]
    if vert(b, a[2]):
        P = plan2(a[2], a[2], a, b)
        if P:
            return [[q[0], q[1], a[2]] for q in P] + [[b[0], b[1], b[2]]]
    return None


def plan_leg(strategy, obstacles, air, a, b, p, seed):
    m = p['margin']
    for mg in (m, m / 2, 0.0):
        P = plan_leg_m(strategy, obstacles, air, a, b, p, seed, mg)
        if P:
            return P
    return None


def carrot(P, p, L):
    bd, bs, acc = math.inf, 0.0, 0.0
    for i in range(len(P) - 1):
        A, B = P[i], P[i + 1]
        dx, dy, dz = B[0] - A[0], B[1] - A[1], B[2] - A[2]
        l2 = dx * dx + dy * dy + dz * dz
        t = max(0.0, min(1.0, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy + (p[2] - A[2]) * dz) / l2)) if l2 else 0.0
        d = math.hypot(A[0] + dx * t - p[0], A[1] + dy * t - p[1], A[2] + dz * t - p[2])
        seg = math.sqrt(l2)
        if d < bd:
            bd, bs = d, acc + t * seg
        acc += seg
    s, acc = bs + L, 0.0
    for i in range(len(P) - 1):
        A, B = P[i], P[i + 1]
        seg = math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2])
        if acc + seg >= s:
            t = (s - acc) / seg if seg else 0.0
            return [A[k] + (B[k] - A[k]) * t for k in range(3)]
        acc += seg
    return list(P[-1])


def visible_carrot(P, p, L, Fv):
    """Zanahoria más lejana (hasta L) cuyo tramo desde p no entra en la zona de seguridad Fv."""
    for k in range(8):
        c = carrot(P, p, L * (1 - k / 8))
        if not Fv or seg_free(Fv, p, c):
            return c
    return carrot(P, p, 0.05)


def add_repulsion(c, r, L, p, Fv):
    """Suma la repulsión r a la zanahoria solo en la medida en que no la meta en un obstáculo."""
    for k in (1.0, 0.5, 0.25):
        q = [c[0] + r[0] * L * k, c[1] + r[1] * L * k, c[2]]
        if not Fv or seg_free(Fv, p, q):
            return q
    return c


# NAVEGACION: evitación entre robots
def robot_repulsion(p, others, air, p_, dg=math.inf):
    # dg: distancia a la meta propia; la repulsión se atenúa al llegar
    fx = fy = 0.0
    r = RADIUS['air'] if air else RADIUS['ground']
    fade = min(1.0, dg / p_['d0'])
    for q in others:
        if abs(q[2] - p[2]) > 0.35:
            continue
        dx, dy = p[0] - q[0], p[1] - q[1]
        dc = math.hypot(dx, dy)
        if dc < 1e-6:
            continue
        d = dc - 2 * r - p_['margin']
        if d < p_['d0']:
            dd = max(d, 0.02)
            k = p_['etaRobot'] * (1 / dd - 1 / p_['d0']) * fade
            # repulsión + «regla de la derecha»: en un encuentro de frente ambos se desvían a su derecha
            fx += k * (dx + 0.5 * dy) / dc
            fy += k * (dy - 0.5 * dx) / dc
    return fx, fy


# NAVEGACION: campos de potencial
def apf_force(p, goal, Fp, others, air, p_):
    ax, ay = goal[0] - p[0], goal[1] - p[1]
    da = math.hypot(ax, ay)
    if da > 1:
        ax, ay = ax / da, ay / da
    fx = fy = 0.0
    if Fp:
        nx, ny, d = grad(Fp, p[0], p[1])
        if d < p_['d0']:
            # la repulsión se atenúa cerca de la meta (si no, una meta junto a un obstáculo sería inalcanzable)
            dd = max(d, 0.02)
            k = p_['eta'] * (1 / dd - 1 / p_['d0']) * min(1.0, da / p_['d0'])
            fx, fy = k * nx, k * ny
    rx, ry = robot_repulsion(p, others, air, p_, math.hypot(goal[0] - p[0], goal[1] - p[1]))
    return (ax, ay), (fx + rx, fy + ry)


def escape_normal(Fp, p, rep):
    n = math.hypot(rep[0], rep[1])
    if n > 1e-6:
        return rep[0] / n, rep[1] / n
    gx, gy, _ = grad(Fp, p[0], p[1])
    return gx, gy


def clamp_vec(v, m):
    n = math.hypot(v[0], v[1])
    return (v[0] * m / n, v[1] * m / n) if n > m else v


# ---------------------------------------------------------------------- nodo ROS 2
def main():
    import rclpy
    import rclpy.executors
    from rclpy.node import Node
    from geometry_msgs.msg import PoseStamped
    from nav_msgs.msg import Path
    from std_msgs.msg import String
    from visualization_msgs.msg import Marker, MarkerArray

    cfg = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'navegacion.json'))
    P_ = dict(DEFAULTS)
    P_.update(cfg.get('params', {}))
    obstacles = cfg.get('obstacles', [])
    robots = cfg.get('robots', [])

    class Navegacion(Node):
        def __init__(self):
            super().__init__('navegacion')
            self.pose, self.state, self.pub, self.path_pub = {}, {}, {}, {}
            for r in robots:
                n = r['name']
                self.create_subscription(PoseStamped, n + '/local_pose', lambda m, n=n: self.on_pose(n, m), 10)
                if r['strategy'] != 'direct':
                    self.create_subscription(PoseStamped, n + '/nav_goal', lambda m, r=r: self.on_goal(r, m), 10)
                    self.pub[n] = self.create_publisher(PoseStamped, n + '/target_pose', 10)
                    self.path_pub[n] = self.create_publisher(Path, n + '/nav_path', 10)
                    self.state[n] = dict(active=False, legs=0)
            self.create_subscription(String, 'swarm/order', self.on_order, 10)
            self.mk = self.create_publisher(MarkerArray, 'obstacles', 10)
            self.create_timer(1.0 / float(P_.get('rate', 10)), self.step)
            self.create_timer(2.0, self.publish_obstacles)
            self.get_logger().info('Navegación: %d obstáculos, %d robots con estrategia propia'
                                   % (len(obstacles), len(self.state)))

        def on_pose(self, n, m):
            q = m.pose.position
            self.pose[n] = [q.x, q.y, q.z]

        def on_order(self, m):
            if m.data in ('formation_run', 'land', 'end'):
                for n, s in self.state.items():
                    if s['active']:
                        self.get_logger().info('%s: navegación cancelada por la orden %s' % (n, m.data))
                    s['active'] = False

        # NAVEGACION: llegada de un objetivo (planificación)
        def on_goal(self, r, m):
            n, s = r['name'], self.state[r['name']]
            q = m.pose.position
            goal = [q.x, q.y, q.z if r['air'] else 0.0]
            if n not in self.pose:
                self.get_logger().warn('%s: objetivo recibido sin local_pose; se envía directamente' % n)
                self.pub[n].publish(m)
                return
            start = list(self.pose[n])
            seed = 1 + r['index'] * 7919 + s['legs'] * 104729
            s['legs'] += 1
            path = None
            if r['strategy'] in ('astar', 'rrt', 'hybrid'):
                path = plan_leg(r['strategy'], obstacles, r['air'], start, goal, P_, seed)
                if path is None:
                    self.get_logger().error('%s: no hay camino libre hasta (%.2f, %.2f, %.2f); se envía directamente'
                                            % (n, goal[0], goal[1], goal[2]))
                    self.pub[n].publish(m)
                    s['active'] = False
                    return
            else:
                path = [start, goal]
            s.update(active=True, goal=goal, path=path, hist=[], escape=0.0, side=1, frame=m.header.frame_id or 'map')
            msg = Path()
            msg.header.frame_id = s['frame']
            msg.header.stamp = self.get_clock().now().to_msg()
            for p in path:
                ps = PoseStamped()
                ps.header = msg.header
                ps.pose.position.x, ps.pose.position.y, ps.pose.position.z = p
                ps.pose.orientation.w = 1.0
                msg.poses.append(ps)
            self.path_pub[n].publish(msg)
            self.get_logger().info('%s -> (%.2f, %.2f, %.2f) con %s: %d puntos de ruta'
                                   % (n, goal[0], goal[1], goal[2], r['strategy'], len(path)))

        # NAVEGACION: consigna enviada al driver en cada ciclo
        def step(self):
            dt = 1.0 / float(P_.get('rate', 10))
            for r in robots:
                n = r['name']
                s = self.state.get(n)
                if not s or not s['active'] or n not in self.pose:
                    continue
                p, goal, air = self.pose[n], s['goal'], r['air']
                L = float(P_.get('lookahead_air' if air else 'lookahead_ground', 0.35 if air else 0.12))
                tol = float(P_.get('tol_air' if air else 'tol_ground', 0.08 if air else 0.05))
                if math.hypot(goal[0] - p[0], goal[1] - p[1]) < tol:
                    self.send(n, goal, s['frame'])
                    s['active'] = False
                    self.get_logger().info('%s: objetivo alcanzado' % n)
                    continue
                others = [self.pose[o['name']] for o in robots if o['name'] != n and o['name'] in self.pose]
                if r['strategy'] == 'apf':
                    Fp = footprints(obstacles, air, min(p[2], goal[2]), max(p[2], goal[2]), P_['margin'])
                    att, rep = apf_force(p, goal, Fp, others, air, P_)
                    f = (att[0] + rep[0], att[1] + rep[1])
                    if s['escape'] > 0:
                        # escape: seguir el contorno del obstáculo más cercano hasta ver el objetivo
                        s['escape'] -= dt
                        nx, ny = escape_normal(Fp, p, rep)
                        tg = (-s['side'] * ny, s['side'] * nx)
                        f = (0.9 * tg[0] + 0.3 * att[0] + 0.3 * rep[0], 0.9 * tg[1] + 0.3 * att[1] + 0.3 * rep[1])
                        rrx, rry = robot_repulsion(p, others, air, P_)
                        if seg_free(Fp, p, goal) and math.hypot(rrx, rry) < 0.05:
                            s['escape'] = 0.0
                    f = clamp_vec(f, 1.0)
                    dz = max(-0.3, min(0.3, goal[2] - p[2]))
                    c = [p[0] + f[0] * L, p[1] + f[1] * L, p[2] + dz if air else 0.0]
                    s['hist'].append(list(p))
                    win = int(3.0 / dt)
                    if len(s['hist']) > win:
                        s['hist'].pop(0)
                    if (len(s['hist']) == win and s['escape'] <= 0
                            and math.hypot(p[0] - s['hist'][0][0], p[1] - s['hist'][0][1]) < 0.05):
                        g = (goal[0] - p[0], goal[1] - p[1])
                        nx, ny = escape_normal(Fp, p, rep)
                        s['side'] = 1 if (-ny * g[0] + nx * g[1]) >= 0 else -1
                        s['escape'], s['hist'] = 8.0, []
                        self.get_logger().info('%s: mínimo local, escape lateral' % n)
                else:
                    Fv = footprints(obstacles, air, min(p[2], goal[2]), max(p[2], goal[2]), P_['margin'] / 2)
                    c = visible_carrot(s['path'], p, L, Fv)
                    if r['strategy'] == 'hybrid':
                        rr = clamp_vec(robot_repulsion(p, others, air, P_, math.hypot(goal[0] - p[0], goal[1] - p[1])), 1.0)
                        c = add_repulsion(c, rr, L, p, Fv)
                    if not air:
                        c[2] = 0.0
                self.send(n, c, s['frame'])

        def send(self, n, c, frame):
            m = PoseStamped()
            m.header.frame_id = frame
            m.header.stamp = self.get_clock().now().to_msg()
            m.pose.position.x, m.pose.position.y, m.pose.position.z = float(c[0]), float(c[1]), float(c[2])
            m.pose.orientation.w = 1.0
            self.pub[n].publish(m)

        def publish_obstacles(self):
            arr = MarkerArray()
            for i, o in enumerate(obstacles):
                mk = Marker()
                mk.header.frame_id = 'map'
                mk.header.stamp = self.get_clock().now().to_msg()
                mk.ns, mk.id, mk.action = 'obstacles', i, Marker.ADD
                mk.pose.position.x, mk.pose.position.y, mk.pose.position.z = float(o['x']), float(o['y']), center_z(o)
                if o['shape'] == 'box':
                    yaw = float(o.get('yaw', 0) or 0) * math.pi / 360
                    mk.type = Marker.CUBE
                    mk.pose.orientation.z, mk.pose.orientation.w = math.sin(yaw), math.cos(yaw)
                    mk.scale.x, mk.scale.y, mk.scale.z = float(o['sx']), float(o['sy']), float(o['sz'])
                elif o['shape'] == 'cylinder':
                    mk.type = Marker.CYLINDER
                    mk.pose.orientation.w = 1.0
                    mk.scale.x = mk.scale.y = 2 * float(o['r'])
                    mk.scale.z = float(o['h'])
                else:
                    mk.type = Marker.SPHERE
                    mk.pose.orientation.w = 1.0
                    mk.scale.x = mk.scale.y = mk.scale.z = 2 * float(o['r'])
                mk.color.r, mk.color.g, mk.color.b, mk.color.a = 0.85, 0.45, 0.15, 0.6
                arr.markers.append(mk)
            self.mk.publish(arr)

    rclpy.init()
    node = Navegacion()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, rclpy.executors.ExternalShutdownException):
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
