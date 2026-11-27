/* ============================================================
   Robotic Park Lab — Configurador: obstáculos y navegación
   ------------------------------------------------------------
   Funciones puras (navegador: window.RPNav; Node/gjs: module).
   Las mismas reglas están en navegacion.py, el nodo ROS 2 que
   se descarga con el experimento: lo que se ve en la vista
   previa es lo que hará el nodo (salvo el modelo del robot).

   Obstáculo: { shape: 'box'|'cylinder'|'sphere', x, y, z, ground,
                sx, sy, sz (caja), r, h (cilindro), r (esfera), yaw (º, caja) }
   (x, y, z) es el centro; con ground=true, z se calcula para que
   el obstáculo se apoye en el suelo.

   Las funciones están marcadas con «NAVEGACION:», igual que en
   navegacion.py y en los callbacks de objetivo de los drivers.

   Estrategias de navegación de cada agente:
     direct  línea recta (lo que hace el driver sin ayuda)
     astar   planificación global A* en rejilla + suavizado
     rrt     planificación por muestreo RRT + atajos
     apf     campos de potencial (reactiva, en línea)
     hybrid  ruta A* + repulsión de los otros robots
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPNav = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STRATEGIES = {
    direct: {
      label: ['Directa (línea recta)', 'Direct (straight line)'],
      short: ['El driver va en línea recta al objetivo. No ve los obstáculos.', 'The driver flies straight to the target. It does not see obstacles.'],
      help: ['Es el comportamiento normal de Robotic Park: el controlador de posición persigue el punto objetivo. Es la más rápida y no necesita ningún nodo extra, pero si hay un obstáculo en medio el robot choca. Úsala con el espacio despejado o como referencia para comparar.',
        'Robotic Park\'s default behaviour: the position controller chases the target point. Fastest and needs no extra node, but if an obstacle is in the way the robot hits it. Use it in free space or as a baseline.'],
      online: false, planner: false,
    },
    astar: {
      label: ['Planificada: A* en rejilla', 'Planned: grid A*'],
      short: ['Calcula el camino más corto que esquiva los obstáculos y lo sigue.', 'Computes the shortest obstacle-free path and follows it.'],
      help: ['Planificador global: divide el plano en celdas de 5 cm, marca como ocupadas las que están a menos de la distancia de seguridad de un obstáculo y busca con A* el camino más corto; después elimina los zigzags uniendo puntos que se ven entre sí. Es completo (si hay camino, lo encuentra) y repetible, pero no tiene en cuenta a los otros robots.',
        'Global planner: splits the floor into 5 cm cells, marks those closer than the safety distance to an obstacle as occupied and searches the shortest path with A*; then removes zigzags by joining mutually visible points. Complete (finds a path if one exists) and repeatable, but ignores other robots.'],
      online: true, planner: true,
    },
    rrt: {
      label: ['Planificada: RRT (muestreo)', 'Planned: RRT (sampling)'],
      short: ['Explora el espacio con un árbol de puntos aleatorios hasta llegar.', 'Explores space with a tree of random points until it arrives.'],
      help: ['Planificador por muestreo (Rapidly-exploring Random Tree): hace crecer un árbol desde la salida lanzando puntos al azar y uniendo el más cercano si el tramo está libre; cuando ve el objetivo, recorta el camino con atajos. Escala bien a espacios grandes o 3D, pero el camino no es el más corto. Aquí la semilla es fija: la misma configuración da siempre el mismo camino.',
        'Sampling-based planner (Rapidly-exploring Random Tree): grows a tree from the start by throwing random points and linking the nearest node when the segment is free; once it sees the goal it shortens the path with shortcuts. Scales well to large or 3D spaces but the path is not the shortest. The seed is fixed here: the same configuration always gives the same path.'],
      online: true, planner: true,
    },
    apf: {
      label: ['Reactiva: campos de potencial', 'Reactive: potential fields'],
      short: ['El objetivo atrae y los obstáculos y robots repelen, en tiempo real.', 'The goal attracts; obstacles and robots repel, in real time.'],
      help: ['No planifica: en cada instante suma una fuerza de atracción hacia el objetivo y fuerzas de repulsión de los obstáculos y de los demás robots cercanos (alcance d₀), y avanza en esa dirección. Reacciona a robots en movimiento, pero puede quedarse atrapada en mínimos locales (por ejemplo, frente a una pared perpendicular); el nodo incluye un escape que rodea el obstáculo siguiendo su contorno. Cuando se cruzan varios robots oscilan y llegan tarde: el tiempo estimado se duplica.',
        'No planning: at every instant it adds an attraction towards the goal and repulsions from obstacles and nearby robots (range d₀), and moves that way. It reacts to moving robots but can get stuck in local minima (e.g. facing a perpendicular wall); the node includes an escape that follows the obstacle contour. With several robots crossing they oscillate and arrive late: the estimated time is doubled.'],
      online: true, planner: false,
    },
    hybrid: {
      label: ['Híbrida: A* + evitación de robots', 'Hybrid: A* + robot avoidance'],
      short: ['Sigue la ruta A* y se aparta de los robots que se cruzan.', 'Follows the A* route and steps aside from crossing robots.'],
      help: ['Combina las dos ideas: la ruta global se calcula con A* (evita los obstáculos fijos sin mínimos locales) y, mientras la sigue, añade la repulsión de los robots cercanos para no chocar con ellos. Para que dos robots que se encuentran de frente no se bloqueen, ambos se desvían hacia su derecha. Es la opción recomendada cuando varios robots cruzan una zona con obstáculos.',
        'Combines both ideas: the global route comes from A* (avoids fixed obstacles without local minima) and, while following it, adds repulsion from nearby robots to avoid them. So that two robots meeting head-on do not block each other, both veer to their right. Recommended when several robots cross an area with obstacles.'],
      online: true, planner: true,
    },
  };

  const SHAPES = {
    box: { label: ['Caja', 'Box'] },
    cylinder: { label: ['Cilindro', 'Cylinder'] },
    sphere: { label: ['Esfera', 'Sphere'] },
  };

  const DEFAULTS = { margin: 0.15, d0: 0.6, eta: 0.15, etaRobot: 0.2, res: 0.05, bound: 3.0 };
  const RADIUS = { air: 0.08, ground: 0.07 };     // radio del robot (Crazyflie con hélices, Khepera IV)
  const GROUND_BAND = [0.0, 0.12];               // altura que ocupa un Khepera IV

  // ------------------------------------------------------------------ geometría
  function height(o) { return o.shape === 'box' ? +o.sz : o.shape === 'cylinder' ? +o.h : 2 * +o.r; }
  function centerZ(o) { return o.ground ? height(o) / 2 : +o.z; }
  function zRange(o) { const z = centerZ(o), h = height(o) / 2; return [z - h, z + h]; }

  /**
   * Huella 2D del obstáculo para un robot que se mueve entre las alturas [zlo, zhi].
   * Devuelve null si el obstáculo queda por encima o por debajo (más el inflado).
   */
  function footprint(o, zlo, zhi, infl) {
    const [a, b] = zRange(o);
    if (b < zlo - infl || a > zhi + infl) return null;
    if (o.shape === 'box') {
      const y = (+o.yaw || 0) * Math.PI / 180;
      return { t: 'rect', x: +o.x, y: +o.y, hx: +o.sx / 2, hy: +o.sy / 2, c: Math.cos(y), s: Math.sin(y), infl };
    }
    if (o.shape === 'cylinder') return { t: 'circ', x: +o.x, y: +o.y, r: +o.r, infl };
    // esfera: la sección más ancha dentro de la banda
    const zc = centerZ(o), r = +o.r;
    const dz = zc < zlo ? zlo - zc : zc > zhi ? zc - zhi : 0;
    const rr = dz >= r ? 0 : Math.sqrt(r * r - dz * dz);
    return { t: 'circ', x: +o.x, y: +o.y, r: rr, infl: dz >= r ? Math.max(0, infl - (dz - r)) : infl };
  }
  /** Distancia con signo del punto (x, y) a la huella inflada (negativa dentro). */
  function sdf(f, x, y) {
    if (f.t === 'circ') return Math.hypot(x - f.x, y - f.y) - f.r - f.infl;
    const dx = x - f.x, dy = y - f.y;
    const lx = Math.abs(f.c * dx + f.s * dy) - f.hx, ly = Math.abs(-f.s * dx + f.c * dy) - f.hy;
    const out = Math.hypot(Math.max(lx, 0), Math.max(ly, 0)), inn = Math.min(Math.max(lx, ly), 0);
    return out + inn - f.infl;
  }
  function minSdf(F, x, y) { let m = Infinity; for (const f of F) { const d = sdf(f, x, y); if (d < m) m = d; } return m; }
  function grad(F, x, y) {
    let best = null, m = Infinity;
    for (const f of F) { const d = sdf(f, x, y); if (d < m) { m = d; best = f; } }
    if (!best) return [0, 0, Infinity];
    const h = 1e-3;
    const gx = (sdf(best, x + h, y) - sdf(best, x - h, y)) / (2 * h), gy = (sdf(best, x, y + h) - sdf(best, x, y - h)) / (2 * h);
    const n = Math.hypot(gx, gy) || 1;
    return [gx / n, gy / n, m];
  }
  function segFree(F, a, b, step = 0.02) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i <= n; i++) { const t = i / n; if (minSdf(F, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) <= 0) return false; }
    return true;
  }
  /** Huellas de todos los obstáculos para un robot (aéreo o terrestre) entre dos alturas. */
  function footprints(obstacles, air, z0, z1, margin) {
    const infl = (air ? RADIUS.air : RADIUS.ground) + margin;
    const [lo, hi] = air ? [Math.min(z0, z1), Math.max(z0, z1)] : GROUND_BAND;
    return (obstacles || []).map(o => footprint(o, lo, hi, infl)).filter(Boolean);
  }

  // ------------------------------------------------------------------ A*
  function bounds(a, b, bound) {
    return [Math.min(-bound, a[0] - 0.5, b[0] - 0.5), Math.max(bound, a[0] + 0.5, b[0] + 0.5),
      Math.min(-bound, a[1] - 0.5, b[1] - 0.5), Math.max(bound, a[1] + 0.5, b[1] + 0.5)];
  }
  /** Une los puntos que se ven entre sí (string pulling). */
  function prune(F, P) {
    if (P.length <= 2) return P;
    const out = [P[0]]; let i = 0;
    while (i < P.length - 1) {
      let j = P.length - 1;
      while (j > i + 1 && !segFree(F, P[i], P[j])) j--;
      out.push(P[j]); i = j;
    }
    return out;
  }
  // NAVEGACION: planificador A* en rejilla
  function astar(F, a, b, o = {}) {
    const res = o.res || DEFAULTS.res, [x0, x1, y0, y1] = bounds(a, b, o.bound || DEFAULTS.bound);
    if (segFree(F, a, b)) return [a.slice(0, 2), b.slice(0, 2)];
    const W = Math.ceil((x1 - x0) / res) + 1, H = Math.ceil((y1 - y0) / res) + 1, N = W * H;
    const free = new Uint8Array(N);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) free[j * W + i] = minSdf(F, x0 + i * res, y0 + j * res) > 0 ? 1 : 0;
    const cell = (p) => [Math.min(W - 1, Math.max(0, Math.round((p[0] - x0) / res))), Math.min(H - 1, Math.max(0, Math.round((p[1] - y0) / res)))];
    const [si, sj] = cell(a), [gi, gj] = cell(b);
    const s = sj * W + si, g = gj * W + gi;
    free[s] = 1; free[g] = 1;      // la salida y la meta exactas ya se validan aparte
    const gs = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const h = (k) => { const dx = Math.abs(k % W - gi), dy = Math.abs(Math.floor(k / W) - gj); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    // montículo binario (f, desempate por g mayor) para que JS y Python exploren igual
    const heap = [];
    const less = (p, q) => p[0] < q[0] || (p[0] === q[0] && (p[1] > q[1] || (p[1] === q[1] && p[2] < q[2])));
    const push = (it) => { heap.push(it); let k = heap.length - 1; while (k) { const pp = (k - 1) >> 1; if (less(heap[k], heap[pp])) { [heap[k], heap[pp]] = [heap[pp], heap[k]]; k = pp; } else break; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === k) break; [heap[k], heap[m]] = [heap[m], heap[k]]; k = m; } } return top; };
    gs[s] = 0; push([h(s), 0, s]);
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    while (heap.length) {
      const [, gk, k] = pop();
      if (closed[k]) continue; closed[k] = 1;
      if (k === g) break;
      const ci = k % W, cj = Math.floor(k / W);
      for (const [di, dj, c] of nb) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const q = nj * W + ni;
        if (!free[q] || closed[q]) continue;
        if (di && dj && (!free[cj * W + ni] || !free[nj * W + ci])) continue;   // sin cortar esquinas
        const ng = gk + c;
        if (ng < gs[q]) { gs[q] = ng; prev[q] = k; push([ng + h(q), ng, q]); }
      }
    }
    if (prev[g] < 0 && g !== s) return null;
    const P = [];
    for (let k = g; k >= 0; k = prev[k]) { P.push([x0 + (k % W) * res, y0 + Math.floor(k / W) * res]); if (k === s) break; }
    P.reverse(); P[0] = a.slice(0, 2); P[P.length - 1] = b.slice(0, 2);
    return prune(F, P);
  }

  // ------------------------------------------------------------------ RRT
  /** mulberry32: generador pseudoaleatorio reproducible (igual en navegacion.py). */
  function rng(seed) {
    let t = seed >>> 0;
    return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  // NAVEGACION: planificador RRT
  function rrt(F, a, b, o = {}) {
    if (segFree(F, a, b)) return [a.slice(0, 2), b.slice(0, 2)];
    const [x0, x1, y0, y1] = bounds(a, b, o.bound || DEFAULTS.bound);
    const R = rng(o.seed || 1), step = 0.25;
    const nodes = [[a[0], a[1]]], par = [-1];
    for (let it = 0; it < 6000; it++) {
      const goal = R() < 0.1;
      const q = goal ? [b[0], b[1]] : [x0 + R() * (x1 - x0), y0 + R() * (y1 - y0)];
      let bi = 0, bd = Infinity;
      for (let k = 0; k < nodes.length; k++) { const d = (nodes[k][0] - q[0]) ** 2 + (nodes[k][1] - q[1]) ** 2; if (d < bd) { bd = d; bi = k; } }
      const n = nodes[bi], d = Math.sqrt(bd);
      if (d < 1e-9) continue;
      const nw = d <= step ? q : [n[0] + (q[0] - n[0]) * step / d, n[1] + (q[1] - n[1]) * step / d];
      if (!segFree(F, n, nw)) continue;
      nodes.push(nw); par.push(bi);
      if (segFree(F, nw, b)) {
        const P = [[b[0], b[1]]];
        for (let k = nodes.length - 1; k >= 0; k = par[k]) P.push(nodes[k]);
        P.reverse();
        return prune(F, P);
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ planificación de un tramo
  /** Ruta 3D de a a b (xy planificado; z interpolada por longitud de arco). null = sin camino. */
  function planLeg(strategy, obstacles, air, a, b, o = {}) {
    // si el robot empieza (o acaba) dentro del margen de seguridad, se reintenta con menos margen
    const m = o.margin ?? DEFAULTS.margin;
    for (const mg of [m, m / 2, 0]) { const P = planLegM(strategy, obstacles, air, a, b, o, mg); if (P) return P; }
    return null;
  }
  function interpZ(P, z0, z1) {
    const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const tot = L[L.length - 1] || 1;
    return P.map((p, i) => [p[0], p[1], z0 + (z1 - z0) * L[i] / tot]);
  }
  function planLegM(strategy, obstacles, air, a, b, o, mg) {
    const plan2 = (z0, z1, A, B) => {
      const F = footprints(obstacles, air, z0, z1, mg);
      if (strategy === 'rrt') return rrt(F, A, B, o);
      if (strategy === 'astar' || strategy === 'hybrid') return astar(F, A, B, o);
      return [A.slice(0, 2), B.slice(0, 2)];
    };
    // 1) toda la banda de alturas entre la salida y la meta
    let P = plan2(a[2], b[2], a, b);
    if (P) return interpZ(P, a[2], b[2]);
    if (!air || Math.abs(a[2] - b[2]) < 0.05) return null;
    // 2) dron: cambiar primero de altura en la vertical de la salida y planificar a la altura final
    const vert = (p, z) => minSdf(footprints(obstacles, true, p[2], z, mg), p[0], p[1]) > 0;
    if (vert(a, b[2])) { P = plan2(b[2], b[2], a, b); if (P) return [[a[0], a[1], a[2]]].concat(P.map(p => [p[0], p[1], b[2]])); }
    // 3) planificar a la altura inicial y cambiar de altura al final
    if (vert(b, a[2])) { P = plan2(a[2], a[2], a, b); if (P) return P.map(p => [p[0], p[1], a[2]]).concat([[b[0], b[1], b[2]]]); }
    return null;
  }
  function pathLength(P) { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]); return s; }
  /** Punto de la ruta a distancia L por delante del punto de la ruta más cercano a p. */
  function carrot(P, p, L) {
    let best = 0, bd = Infinity, bs = 0, acc = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const A = P[i], B = P[i + 1], dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], l2 = dx * dx + dy * dy + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy + (p[2] - A[2]) * dz) / l2)) : 0;
      const d = Math.hypot(A[0] + dx * t - p[0], A[1] + dy * t - p[1], A[2] + dz * t - p[2]), seg = Math.sqrt(l2);
      if (d < bd) { bd = d; best = i; bs = acc + t * seg; }
      acc += seg;
    }
    let s = bs + L; acc = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const A = P[i], B = P[i + 1], seg = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      if (acc + seg >= s) { const t = seg ? (s - acc) / seg : 0; return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; }
      acc += seg;
    }
    void best;
    return P[P.length - 1].slice();
  }

  /**
   * Zanahoria «visible»: la más lejana (hasta L) cuyo tramo recto desde p no entra en la zona
   * de seguridad (Fv). Al doblar una esquina evita que el robot la recorte contra el obstáculo.
   */
  function visibleCarrot(P, p, L, Fv) {
    for (let k = 0; k < 8; k++) { const c = carrot(P, p, L * (1 - k / 8)); if (!Fv || !Fv.length || segFree(Fv, p, c)) return c; }
    return carrot(P, p, 0.05);
  }
  /** Suma la repulsión r (escalada por L) a la zanahoria c solo en la medida en que no la meta en un obstáculo. */
  function addRepulsion(c, r, L, p, Fv) {
    for (const k of [1, 0.5, 0.25]) { const q = [c[0] + r[0] * L * k, c[1] + r[1] * L * k, c[2]]; if (!Fv || !Fv.length || segFree(Fv, p, q)) return q; }
    return c;
  }

  // ------------------------------------------------------------------ campos de potencial
  /** Fuerza (xy) de campos de potencial. others: posiciones de los demás robots [[x,y,z,air]]. */
  // NAVEGACION: campos de potencial
  function apfForce(p, goal, Fp, others, air, o = {}) {
    const d0 = o.d0 ?? DEFAULTS.d0, eta = o.eta ?? DEFAULTS.eta, etaR = o.etaRobot ?? DEFAULTS.etaRobot, margin = o.margin ?? DEFAULTS.margin;
    let ax = goal[0] - p[0], ay = goal[1] - p[1];
    const da = Math.hypot(ax, ay); if (da > 1) { ax /= da; ay /= da; }
    let fx = 0, fy = 0;
    if (Fp && Fp.length) {
      const [nx, ny, d] = grad(Fp, p[0], p[1]);
      // la repulsión se atenúa cerca de la meta: si no, una meta junto a un obstáculo sería inalcanzable
      if (d < d0) { const dd = Math.max(d, 0.02), k = eta * (1 / dd - 1 / d0) * Math.min(1, da / d0); fx += k * nx; fy += k * ny; }
    }
    const rr = robotRepulsion(p, others, air, d0, etaR, margin, Math.hypot(goal[0] - p[0], goal[1] - p[1])); fx += rr[0]; fy += rr[1];
    return { att: [ax, ay], rep: [fx, fy] };
  }
  /** dg: distancia a la meta propia; la repulsión se atenúa al llegar (si no, un robot aparcado al lado la impediría). */
  // NAVEGACION: evitación entre robots
  function robotRepulsion(p, others, air, d0, etaR, margin, dg = Infinity) {
    let fx = 0, fy = 0;
    const r = air ? RADIUS.air : RADIUS.ground, fade = Math.min(1, dg / d0);
    for (const q of others || []) {
      if (Math.abs(q[2] - p[2]) > 0.35) continue;      // a distinta altura no se estorban
      const dx = p[0] - q[0], dy = p[1] - q[1], dc = Math.hypot(dx, dy);
      if (dc < 1e-6) continue;
      const d = dc - 2 * r - margin;
      // repulsión + «regla de la derecha» (componente lateral): en un encuentro de frente los dos
      // robots se desvían hacia su derecha y se cruzan en lugar de bloquearse
      if (d < d0) { const dd = Math.max(d, 0.02), k = etaR * (1 / dd - 1 / d0) * fade; fx += k * (dx + 0.5 * dy) / dc; fy += k * (dy - 0.5 * dx) / dc; }
    }
    return [fx, fy];
  }
  /** Dirección «hacia fuera» del estorbo: la repulsión total o, si es nula, la normal del obstáculo. */
  function escapeNormal(Fp, p, rep) {
    const n = Math.hypot(rep[0], rep[1]);
    if (n > 1e-6) return [rep[0] / n, rep[1] / n];
    const g = grad(Fp, p[0], p[1]);
    return [g[0], g[1]];
  }
  const clampVec = (v, m) => { const n = Math.hypot(v[0], v[1]); return n > m ? [v[0] * m / n, v[1] * m / n] : v; };

  // ------------------------------------------------------------------ simulación de la vista previa
  /**
   * Simula a la vez a todos los robots (modelo cinemático: punto con velocidad máxima),
   * cada uno recorriendo sus tramos con su estrategia.
   *   agents: [{ air, strategy, start:[x,y,z], legs:[[x,y,z], ...] }]
   * Devuelve por agente: { traj: [[x,y,z]...], paths: [ruta planificada por tramo], len, ok, stuck, fail }
   */
  // NAVEGACION: simulación de la vista previa
  function simulate(agents, obstacles, o = {}) {
    const dt = 0.05, v = 0.4, tMax = o.tMax || 150, every = 5;
    const st = agents.map((a) => ({
      p: a.start.slice(), leg: 0, path: null, paths: [], legLen: [0], traj: [a.start.slice()], len: 0, ok: true, stuck: false, fail: [],
      hist: [], escape: 0, side: 1, done: !a.legs.length,
    }));
    const strat = (i) => (agents[i].legStrat && agents[i].legStrat[st[i].leg]) || agents[i].strategy;
    const plan = (i) => {
      const a = agents[i], s = st[i], goal = a.legs[s.leg], S = strat(i);
      if (S === 'apf' || S === 'direct') { s.path = [s.p.slice(), goal.slice()]; s.paths.push(s.path); return; }
      const P = planLeg(S, obstacles, a.air, s.p, goal, Object.assign({ seed: 1 + i * 7919 + s.leg * 104729 }, o));
      if (!P) { s.fail.push(s.leg); s.path = [s.p.slice(), goal.slice()]; } else s.path = P;
      s.paths.push(s.path);
    };
    st.forEach((s, i) => { if (!s.done) plan(i); });
    let t = 0, step = 0;
    const close = new Map();     // pareja de robots -> {d, t} distancia mínima si se acercan demasiado
    while (t < tMax && st.some(s => !s.done)) {
      const pos = st.map((s, i) => [s.p[0], s.p[1], s.p[2], agents[i].air]);
      st.forEach((s, i) => {
        if (s.done) return;
        const a = agents[i], goal = a.legs[s.leg], L = 0.35, S = strat(i);
        const others = pos.filter((_, j) => j !== i);
        let dir;
        if (S === 'apf') {
          const Fp = footprints(obstacles, a.air, Math.min(s.p[2], goal[2]), Math.max(s.p[2], goal[2]), o.margin ?? DEFAULTS.margin);
          const { att, rep } = apfForce(s.p, goal, Fp, others, a.air, o);
          let f = [att[0] + rep[0], att[1] + rep[1]];
          if (s.escape > 0) {
            // escape: seguir el contorno del obstáculo más cercano hasta ver el objetivo
            s.escape -= dt;
            const n = escapeNormal(Fp, s.p, rep), tg = [-s.side * n[1], s.side * n[0]];
            f = [0.9 * tg[0] + 0.3 * att[0] + 0.3 * rep[0], 0.9 * tg[1] + 0.3 * att[1] + 0.3 * rep[1]];
            const rr = robotRepulsion(s.p, others, a.air, o.d0 ?? DEFAULTS.d0, o.etaRobot ?? DEFAULTS.etaRobot, o.margin ?? DEFAULTS.margin);
            if (segFree(Fp, s.p, goal) && Math.hypot(rr[0], rr[1]) < 0.05) s.escape = 0;
          }
          dir = clampVec(f, 1);
        } else {
          const Fv = S === 'direct' ? null : footprints(obstacles, a.air, Math.min(s.p[2], goal[2]), Math.max(s.p[2], goal[2]), (o.margin ?? DEFAULTS.margin) / 2);
          let c = S === 'direct' ? carrot(s.path, s.p, L) : visibleCarrot(s.path, s.p, L, Fv);
          if (S === 'hybrid') {
            const r = clampVec(robotRepulsion(s.p, others, a.air, o.d0 ?? DEFAULTS.d0, o.etaRobot ?? DEFAULTS.etaRobot, o.margin ?? DEFAULTS.margin, Math.hypot(goal[0] - s.p[0], goal[1] - s.p[1])), 1);
            c = addRepulsion(c, r, L, s.p, Fv);
          }
          dir = clampVec([(c[0] - s.p[0]) / L, (c[1] - s.p[1]) / L], 1);
        }
        const dz = Math.max(-v * dt, Math.min(v * dt, goal[2] - s.p[2]));
        const nx = s.p[0] + dir[0] * v * dt, ny = s.p[1] + dir[1] * v * dt;
        const dl = Math.hypot(nx - s.p[0], ny - s.p[1], dz); s.len += dl; s.legLen[s.leg] += dl;
        s.p = [nx, ny, s.p[2] + dz];
        // atrapado (solo campos de potencial): poco avance en 3 s lejos de la meta
        s.hist.push(s.p.slice()); if (s.hist.length > 60) s.hist.shift();
        const far = Math.hypot(goal[0] - s.p[0], goal[1] - s.p[1]) > 0.1;
        if (S === 'apf' && s.hist.length === 60 && far && s.escape <= 0 && Math.hypot(s.p[0] - s.hist[0][0], s.p[1] - s.hist[0][1]) < 0.05) {
          s.escape = 8; s.stuck = true; s.hist.length = 0;
          const Fs = footprints(obstacles, a.air, Math.min(s.p[2], goal[2]), Math.max(s.p[2], goal[2]), o.margin ?? DEFAULTS.margin);
          const others2 = st.map((q, j) => [q.p[0], q.p[1], q.p[2], agents[j].air]).filter((_, j) => j !== i);
          const n = escapeNormal(Fs, s.p, apfForce(s.p, goal, Fs, others2, a.air, o).rep), g = [goal[0] - s.p[0], goal[1] - s.p[1]];
          s.side = (-n[1] * g[0] + n[0] * g[1]) >= 0 ? 1 : -1;      // el sentido del contorno que más se acerca a la meta
        }
        // misma tolerancia que el nodo (8 cm dron, 5 cm Khepera); la z la ajusta el controlador del driver
        if (Math.hypot(goal[0] - s.p[0], goal[1] - s.p[1]) < (a.air ? 0.08 : 0.05) && Math.abs(goal[2] - s.p[2]) < 0.05) {
          s.p = goal.slice(); s.leg++; s.legLen.push(0); s.hist.length = 0; s.escape = 0;
          if (s.leg >= a.legs.length) s.done = true; else plan(i);
        }
      });
      step++; t += dt;
      for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
        const A = st[i].p, B = st[j].p;
        if (Math.abs(A[2] - B[2]) > 0.35) continue;
        const d = Math.hypot(A[0] - B[0], A[1] - B[1]), lim = (agents[i].air ? RADIUS.air : RADIUS.ground) + (agents[j].air ? RADIUS.air : RADIUS.ground) + 0.08;
        const k = i + ',' + j;
        if (d < lim && (!close.has(k) || d < close.get(k).d)) close.set(k, { i, j, d, t });
      }
      if (step % every === 0) st.forEach(s => s.traj.push(s.p.slice()));
    }
    st.forEach(s => { s.traj.push(s.p.slice()); if (!s.done) s.ok = false; });
    const res = st.map((s, i) => ({ traj: s.traj, paths: s.paths, legLen: s.legLen, len: s.len, ok: s.ok, stuck: s.stuck, fail: s.fail, legsDone: s.leg, strategy: agents[i].strategy }));
    res.close = [...close.values()];
    return res;
  }

  /** ¿El segmento a-b (3D) atraviesa algún obstáculo? Devuelve el índice o -1. */
  function hits(obstacles, air, a, b, margin = 0) {
    const infl = (air ? RADIUS.air : RADIUS.ground) + margin;
    for (let k = 0; k < (obstacles || []).length; k++) {
      const o = obstacles[k];
      const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.02));
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        const z = air ? [p[2], p[2]] : GROUND_BAND, f = footprint(o, z[0], z[1], infl);
        if (f && sdf(f, p[0], p[1]) <= 0) return k;
      }
    }
    return -1;
  }
  /** ¿El punto p está dentro (inflado) de algún obstáculo? Índice o -1. */
  function inside(obstacles, air, p, margin = 0) { return hits(obstacles, air, p, p, margin); }

  return { STRATEGIES, SHAPES, DEFAULTS, RADIUS, visibleCarrot, addRepulsion, height, centerZ, zRange, footprint, footprints, sdf, segFree, astar, rrt, rng, planLeg, pathLength, carrot, apfForce, simulate, hits, inside };
});
