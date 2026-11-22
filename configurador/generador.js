/* ============================================================
   Robotic Park Lab — Configurador de experimentos (generador)
   ------------------------------------------------------------
   Funciones puras: a partir de un objeto de configuración
   (cfg) generan los ficheros que espera el paquete
   roboticpark_config del repositorio RoboticPark (rama
   humble-dev):

     resources/<exp>.yaml         experiencia (Operation, Architecture,
                                  CPU_Monitoring, Interface, Data_Logging,
                                  Robots, Supervisor, Other)
     resources/<exp>_topics.yaml  guion de órdenes del supervisor
                                  (mars_supervisor_pkg/supervisor_node)
     worlds/<exp>.wbt             mundo de Webots (robots virtuales)
     rviz/<exp>.rviz              configuración de RViz
     install.sh, run.sh, README.md, experimento.json

   Esquema y valores tomados de:
     roboticpark_config/launch/experience.launch.py
     roboticpark_config/scripts/generate_{experience_yaml,formation_assets}.py
     uned_crazyflie_driver/{driver_config,multi_agent_config,webots_driver}.py
     uned_kheperaiv_webots/khepera_driver.py
     mars_supervisor_pkg/supervisor_node.py
   Sin dependencias: funciona en el navegador (window.RPGen) y en Node.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPGen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.0.0';
  const pad2 = (n) => String(n).padStart(2, '0');
  const fx = (v, d = 3) => {
    const s = Number(v).toFixed(d);
    return s === '-0.' + '0'.repeat(d) ? (0).toFixed(d) : s;
  };
  const deg = Math.PI / 180;

  // ------------------------------------------------------------------
  //  YAML mínimo (estilo de los ficheros del laboratorio)
  // ------------------------------------------------------------------
  const RESERVED = /^(true|false|yes|no|on|off|null|~|True|False|Yes|No|On|Off|Null|NULL|TRUE|FALSE)$/;
  function yamlScalar(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'number') {
      if (!isFinite(v)) return '0.0';
      return Number.isInteger(v) && !v.__float ? String(v) : String(v);
    }
    if (v instanceof Float) return v.toString();
    const s = String(v);
    if (s === '') return "''";
    if (RESERVED.test(s) || /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) ||
      /^[\s\-?:,\[\]{}#&*!|>'"%@`]/.test(s) || /: |\s#|[\n\t]/.test(s) || /\s$/.test(s) ||
      /^\d+\.\d+\.\d+\.\d+$/.test(s)) {
      return "'" + s.replace(/'/g, "''") + "'";
    }
    return s;
  }
  /** Número que siempre se escribe con decimales (0.10, 1.0…). */
  class Float {
    constructor(v, d = 2) { this.v = Number(v); this.d = d; }
    toString() { return fx(this.v, this.d); }
  }
  const F = (v, d = 2) => new Float(v, d);

  function toYAML(obj, indent = 0) {
    const sp = ' '.repeat(indent);
    let out = '';
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('#')) { out += sp + '# ' + v + '\n'; continue; }
      if (v !== null && typeof v === 'object' && !(v instanceof Float) && !Array.isArray(v)) {
        out += `${sp}${k}:\n` + toYAML(v, indent + 2);
        if (indent === 0) out += '\n';
      } else if (Array.isArray(v)) {
        if (!v.length) { out += `${sp}${k}: []\n`; continue; }
        out += `${sp}${k}:\n`;
        v.forEach((it) => {
          if (Array.isArray(it)) out += `${sp}- [${it.map(yamlScalar).join(', ')}]\n`;
          else out += `${sp}- ${yamlScalar(it)}\n`;
        });
      } else {
        const sv = yamlScalar(v);
        out += sv === '' ? `${sp}${k}:\n` : `${sp}${k}: ${sv}\n`;
      }
    }
    return out;
  }

  // ------------------------------------------------------------------
  //  Catálogos (lo que entienden los drivers del laboratorio)
  // ------------------------------------------------------------------
  const KINDS = {
    crazyflie: { prefix: 'dron', label: ['Crazyflie 2.1', 'Crazyflie 2.1'], air: true, proto: 'Crazyflie' },
    khepera: { prefix: 'khepera', label: ['Khepera IV', 'Khepera IV'], air: false, proto: 'Khepera4' },
  };
  // Formas objetivo y restricción de superficie que acepta multi_agent_config.py
  const SHAPES = {
    ring: { label: ['Anillo (polígono regular)', 'Ring (regular polygon)'], surface: null },
    line: { label: ['Línea', 'Line'], surface: null },
    grid: { label: ['Rejilla plana', 'Planar grid'], surface: null },
    sphere: { label: ['Cúpula esférica', 'Spherical dome'], surface: 'sphere' },
    cone: { label: ['Cono', 'Cone'], surface: 'cone' },
    ellipsoid: { label: ['Elipsoide', 'Ellipsoid'], surface: 'ellipsoid' },
    custom: { label: ['Posiciones a mano', 'Manual positions'], surface: null },
  };
  // Leyes de control de formación (task.controller.type)
  const LAWS = {
    gradient: { label: ['Gradiente de distancias (base)', 'Distance gradient (baseline)'], shapes: null },
    ML1: { label: ['RF+C: gradiente + término de Lagrange', 'RF+C: gradient + Lagrange term'], shapes: ['sphere', 'cone'] },
    ML2: { label: ['PRF: formación proyectada en la superficie', 'PRF: projected rigid formation'], shapes: ['sphere', 'cone'] },
    ML3: { label: ['ML en la salida (proyección esférica)', 'ML at the output (spherical projection)'], shapes: ['sphere'] },
  };
  const ORDERS = {
    take_off: { label: ['Despegar', 'Take off'], air: true },
    land: { label: ['Aterrizar', 'Land'], air: true },
    formation_run: { label: ['Iniciar formación', 'Start formation'] },
    formation_stop: { label: ['Detener formación', 'Stop formation'] },
    reconfiguration: { label: ['Reconfiguración (ganancia)', 'Reconfiguration (gain)'], air: true },
    disconnect: { label: ['Simular desconexión', 'Simulate disconnection'], air: true },
    led: { label: ['LED (anillo)', 'LED ring'], air: true, arg: true },
    ellipsoid: { label: ['Cambiar elipsoide a-b-c', 'Change ellipsoid a-b-c'], arg: true },
    remove: { label: ['Eliminar vecino', 'Remove neighbour'], arg: true },
    add: { label: ['Añadir vecino_distancia', 'Add neighbour_distance'], arg: true },
    custom: { label: ['Texto libre', 'Free text'], arg: true },
  };

  // ------------------------------------------------------------------
  //  Configuración por defecto y plantillas de partida
  // ------------------------------------------------------------------
  function defaultConfig() {
    return {
      version: 1,
      name: 'MiExperimento',
      description: '',
      robots: [],
      fleet: { crazyflie: 5, khepera: 0, layout: 'circle', spacing: 0.6, radius: 1.0, type: 'virtual' },
      lowlevel: {
        cfController: 'pid', khController: 'ipc', protocol: 'Continuous', co: 0.01, ai: 0.0,
        comm: 'Continuous', commCo: 0.01, commAi: 0.0, poseT: 100, path: false, twist: false, motors: false,
        positioning: 'Intern',
      },
      task: {
        mode: 'distance',          // none | distance | herding | triangulated
        shape: 'sphere', R: 1.0, cx: 0.0, cy: 0.0, cz: 0.6, a: 0.5, c: 1.4, ea: 1.2, eb: 0.8, ec: 0.8,
        height: 1.0, spacing: 0.7, groundShape: 'ring', groundR: 0.6,
        topology: 'delaunay', k: 3, constraint: true,
        law: 'gradient', output: 'v', gain: 0.25, upper: 0.3, period: 0.2,
        protocol: 'Continuous', co: 0.01, ai: 0.0,
        targets: [], leaders: [1, 2], meshGain: 4.0, uncertainty: false,
      },
      env: { tool: 'Webots', world: 'lab', rviz: true, rqt: false, cpu: true, log: false, logAll: false, vicon: 'auto' },
      commands: null,            // null => secuencia automática
      ws: '~/roboticpark_ws',
    };
  }

  const PRESETS = {
    dome: {
      label: ['Cúpula con multiplicadores de Lagrange (ECC 2026)', 'Lagrange-multiplier dome (ECC 2026)'],
      apply(c) {
        c.name = 'CupulaLagrange_N08'; c.fleet = { crazyflie: 8, khepera: 0, layout: 'circle', spacing: 0.6, radius: 1.0, type: 'virtual' };
        Object.assign(c.task, { mode: 'distance', shape: 'sphere', R: 1.0, cz: 0.6, topology: 'delaunay', constraint: true, law: 'ML2', output: 'v', gain: 0.25, upper: 0.3, period: 0.2 });
      },
    },
    ring: {
      label: ['Anillo de drones con control por eventos', 'Drone ring with event-based control'],
      apply(c) {
        c.name = 'AnilloEventos_N06'; c.fleet = { crazyflie: 6, khepera: 0, layout: 'grid', spacing: 0.6, radius: 1.0, type: 'virtual' };
        Object.assign(c.task, { mode: 'distance', shape: 'ring', R: 1.0, height: 1.0, topology: 'knn', k: 3, constraint: false, law: 'gradient', output: 'v', gain: 0.1, protocol: 'EventBased', co: 0.02 });
        c.lowlevel.comm = 'EventBased';
      },
    },
    hybrid: {
      label: ['Flota híbrida: drones + Khepera IV', 'Hybrid fleet: drones + Khepera IV'],
      apply(c) {
        c.name = 'FlotaHibrida'; c.fleet = { crazyflie: 4, khepera: 3, layout: 'circle', spacing: 0.6, radius: 1.2, type: 'virtual' };
        Object.assign(c.task, { mode: 'distance', shape: 'ring', R: 0.9, height: 1.0, groundShape: 'ring', groundR: 0.5, topology: 'knn', k: 4, constraint: false, law: 'gradient', output: 'v', gain: 0.1 });
      },
    },
    herding: {
      label: ['Pastoreo: drones guían a un Khepera (IROS)', 'Herding: drones steer a Khepera (IROS)'],
      apply(c) {
        c.name = 'Pastoreo_N05'; c.fleet = { crazyflie: 5, khepera: 1, layout: 'circle', spacing: 0.6, radius: 1.0, type: 'virtual' };
        Object.assign(c.task, { mode: 'herding', R: 1.0, height: 0.88 });
      },
    },
    shield: {
      label: ['Formación triangulada con líderes (escudo)', 'Leader-based triangulated formation (shield)'],
      apply(c) {
        // Malla de referencia de AdaptiveFormation_N12 (roboticpark_config/scripts/generate_experience_yaml.py)
        c.name = 'Escudo_N12'; c.fleet = { crazyflie: 12, khepera: 0, layout: 'below', spacing: 0.5, radius: 1.0, type: 'virtual' };
        Object.assign(c.task, {
          mode: 'triangulated', shape: 'custom', leaders: [1, 2], meshGain: 4.0,
          targets: [[0.9, 0, 1.1], [1.299, 0.75, 0.35], [0.45, 0.7794, 1.1], [-0.45, 0.7794, 1.1], [-0.9, 0, 1.1], [-0.45, -0.7794, 1.1],
            [0.45, -0.7794, 1.1], [0, 1.5, 0.35], [-1.299, 0.75, 0.35], [-1.299, -0.75, 0.35], [0, -1.5, 0.35], [1.299, -0.75, 0.35]],
        });
      },
    },
    teleop: {
      label: ['Un Crazyflie sin formación (puntos de paso)', 'Single Crazyflie, no formation (waypoints)'],
      apply(c) {
        c.name = 'CrazyflieIndividual'; c.fleet = { crazyflie: 1, khepera: 0, layout: 'grid', spacing: 0.6, radius: 1.0, type: 'virtual' };
        c.task.mode = 'none';
        c.commands = [
          { delay: 8, trigger: 'time', target: 'swarm', kind: 'order', value: 'take_off' },
          { delay: 6, trigger: 'time', target: 'dron01', kind: 'goal', value: [0.5, 0.5, 1.0] },
          { delay: 6, trigger: 'time', target: 'dron01', kind: 'goal', value: [-0.5, 0.5, 1.2] },
          { delay: 6, trigger: 'time', target: 'dron01', kind: 'goal', value: [-0.5, -0.5, 1.0] },
          { delay: 6, trigger: 'time', target: 'dron01', kind: 'goal', value: [0.0, 0.0, 1.0] },
          { delay: 5, trigger: 'time', target: 'swarm', kind: 'order', value: 'land' },
        ];
      },
    },
  };

  // ------------------------------------------------------------------
  //  Geometría
  // ------------------------------------------------------------------
  function ringPts(n, R, cx, cy, z, phase = 0) {
    return Array.from({ length: n }, (_, k) => {
      const a = phase + 2 * Math.PI * k / Math.max(1, n);
      return [cx + R * Math.cos(a), cy + R * Math.sin(a), z];
    });
  }
  function gridPts(n, s, cx, cy, z) {
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      pts.push([cx + (c - (cols - 1) / 2) * s, cy + (r - (rows - 1) / 2) * s, z]);
    }
    return pts;
  }
  function linePts(n, s, cx, cy, z) {
    return Array.from({ length: n }, (_, i) => [cx + (i - (n - 1) / 2) * s, cy, z]);
  }
  /** Puntos casi uniformes sobre la semiesfera superior (espiral de Fibonacci), con uno en el polo. */
  function hemiPts(n, R, cx, cy, cz, sx = 1, sy = 1, sz = 1) {
    if (n <= 0) return [];
    const pts = [[cx, cy, cz + R * sz]];
    const m = n - 1, ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < m; i++) {
      // cotas de altura: desde ~0.1R hasta ~0.85R (evita el ecuador y el polo)
      const t = m === 1 ? 0.5 : i / (m - 1);
      const zz = 0.85 - 0.75 * t;
      const r = Math.sqrt(1 - zz * zz), a = i * ga;
      pts.push([cx + R * sx * r * Math.cos(a), cy + R * sy * r * Math.sin(a), cz + R * sz * zz]);
    }
    return pts;
  }
  /** Cono de radio a en z=oz y vértice en oz+c (convención de multi_agent_pkg.Cone). */
  function conePts(n, a, c, cx, cy, cz) {
    if (n <= 0) return [];
    const pts = [[cx, cy, cz + c * 0.95]];
    const rest = n - 1; if (!rest) return pts;
    const rings = rest <= 6 ? 1 : 2;
    let left = rest;
    for (let r = 0; r < rings; r++) {
      const cnt = r === rings - 1 ? left : Math.round(rest * 0.6);
      left -= cnt;
      const h = rings === 1 ? 0.35 : (r === 0 ? 0.15 : 0.55);   // fracción de altura
      const rad = a * (1 - h);
      ringPts(cnt, rad, cx, cy, cz + c * h, r * Math.PI / Math.max(1, cnt)).forEach(p => pts.push(p));
    }
    return pts;
  }

  /** Triangulación de Delaunay 2D (Bowyer-Watson) sobre la proyección xy. Devuelve triángulos [i,j,k]. */
  function delaunay(points) {
    const n = points.length;
    if (n < 3) return [];
    const P = points.map(p => [p[0] + 1e-7 * Math.sin(p[2] * 13.1 + p[0]), p[1] + 1e-7 * Math.cos(p[2] * 7.3 + p[1])]);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    P.forEach(([x, y]) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); });
    const d = Math.max(maxX - minX, maxY - minY, 1e-3) * 20, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    const V = P.concat([[mx - d, my - d], [mx + d, my - d], [mx, my + d]]);
    let tris = [[n, n + 1, n + 2]];
    const circ = (t) => {
      const [a, b, c] = t.map(i => V[i]);
      const D = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
      if (Math.abs(D) < 1e-14) return { x: 0, y: 0, r2: Infinity };
      const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / D;
      const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / D;
      return { x: ux, y: uy, r2: (a[0] - ux) ** 2 + (a[1] - uy) ** 2 };
    };
    for (let i = 0; i < n; i++) {
      const [x, y] = V[i];
      const bad = [], keep = [];
      tris.forEach(t => { const c = circ(t); ((x - c.x) ** 2 + (y - c.y) ** 2 < c.r2 - 1e-12 ? bad : keep).push(t); });
      const edges = new Map();
      bad.forEach(t => [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]].forEach(([a, b]) => {
        const k = a < b ? a + ',' + b : b + ',' + a; edges.set(k, (edges.get(k) || 0) + 1);
      }));
      tris = keep;
      edges.forEach((cnt, k) => { if (cnt === 1) { const [a, b] = k.split(',').map(Number); tris.push([a, b, i]); } });
    }
    return tris.filter(t => t.every(i => i < n)).map(t => t.slice().sort((a, b) => a - b));
  }
  function edgesFromTris(tris) {
    const s = new Set();
    tris.forEach(([a, b, c]) => [[a, b], [b, c], [a, c]].forEach(([i, j]) => s.add(Math.min(i, j) + ',' + Math.max(i, j))));
    return [...s].map(k => k.split(',').map(Number));
  }
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  function topologyEdges(T, topo, k) {
    const n = T.length, E = new Set();
    const add = (i, j) => { if (i !== j) E.add(Math.min(i, j) + ',' + Math.max(i, j)); };
    if (n < 2) return [];
    if (topo === 'complete') for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) add(i, j);
    else if (topo === 'ring') for (let i = 0; i < n; i++) add(i, (i + 1) % n);
    else if (topo === 'knn') {
      for (let i = 0; i < n; i++) {
        T.map((p, j) => [j, dist(T[i], p)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1])
          .slice(0, Math.max(1, k)).forEach(([j]) => add(i, j));
      }
    } else {
      const tris = delaunay(T);
      if (!tris.length) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) add(i, j);
      edgesFromTris(tris).forEach(([i, j]) => add(i, j));
    }
    return [...E].map(s => s.split(',').map(Number));
  }

  // ------------------------------------------------------------------
  //  Robots: nombres, posiciones iniciales y objetivos
  // ------------------------------------------------------------------
  /** Rellena cfg.robots a partir de cfg.fleet conservando lo editado a mano (por índice y tipo). */
  function syncRobots(cfg) {
    const old = cfg.robots || [];
    const out = [];
    const f = cfg.fleet;
    const counts = { crazyflie: Math.max(0, f.crazyflie | 0), khepera: Math.max(0, f.khepera | 0) };
    const total = counts.crazyflie + counts.khepera;
    let starts;
    if (cfg.task && cfg.task.mode === 'herding' && counts.khepera > 0) {
      // Pastoreo: drones en anillo y la «oveja» (primer Khepera) en el centro
      starts = ringPts(counts.crazyflie, Math.max(f.radius, 0.6), 0, 0, 0)
        .concat(Array.from({ length: counts.khepera }, (_, i) => i === 0 ? [0, 0, 0] : [-1.8, -1.2 + 0.4 * i, 0]));
    } else if (f.layout === 'circle') starts = ringPts(total, f.radius, 0, 0, 0);
    else if (f.layout === 'line') starts = linePts(total, f.spacing, 0, 0, 0);
    else starts = gridPts(total, f.spacing, 0, 0, 0);
    let g = 0;
    ['crazyflie', 'khepera'].forEach(kind => {
      const prev = old.filter(r => r.kind === kind);
      for (let i = 0; i < counts[kind]; i++) {
        const p = prev[i] && prev[i].manual ? prev[i] : null;
        const base = {
          kind, idx: i + 1, name: KINDS[kind].prefix + pad2(i + 1),
          type: p ? p.type : (prev[i] ? prev[i].type : f.type),
          x: p ? p.x : +starts[g][0].toFixed(3), y: p ? p.y : +starts[g][1].toFixed(3),
          yaw: 0, manual: !!p,
          uri: prev[i] && prev[i].uri ? prev[i].uri : 'radio://0/80/2M/E7E7E7E7' + pad2(i + 1),
          ip: prev[i] && prev[i].ip ? prev[i].ip : '192.168.0.' + (20 + i + 1),
        };
        out.push(base); g++;
      }
    });
    cfg.robots = out;
    if (f.layout === 'below' && cfg.task && cfg.task.mode !== 'none' && cfg.task.mode !== 'herding') {
      // Cada robot empieza justo debajo de su punto de la formación (sin cruces al despegar)
      const T = targets(cfg);
      out.forEach((r, i) => { if (!r.manual && T[i]) { r.x = +T[i][0].toFixed(3); r.y = +T[i][1].toFixed(3); } });
    }
    return cfg;
  }

  /** Posiciones objetivo de la formación (mismo orden que cfg.robots). */
  function targets(cfg) {
    const t = cfg.task, R = cfg.robots;
    const air = R.filter(r => KINDS[r.kind].air), gnd = R.filter(r => !KINDS[r.kind].air);
    const nA = air.length, nG = gnd.length;
    let A = [], G = [];
    if (t.mode === 'herding') {
      A = ringPts(nA, t.R, 0, 0, t.height);
      G = gnd.map((_, i) => i === 0 ? [0, 0, 0] : [0.4 * i, 0.4 * i, 0]);
    } else if (t.shape === 'custom') {
      return R.map((r, i) => (t.targets && t.targets[i]) ? t.targets[i].slice(0, 3).map(Number) : [r.x, r.y, KINDS[r.kind].air ? 1.0 : 0]);
    } else {
      switch (t.shape) {
        case 'ring': A = ringPts(nA, t.R, t.cx, t.cy, t.height); break;
        case 'line': A = linePts(nA, t.spacing, t.cx, t.cy, t.height); break;
        case 'grid': A = gridPts(nA, t.spacing, t.cx, t.cy, t.height); break;
        case 'sphere': A = hemiPts(nA, t.R, t.cx, t.cy, t.cz); break;
        case 'cone': A = conePts(nA, t.a, t.c, t.cx, t.cy, t.cz); break;
        case 'ellipsoid': A = hemiPts(nA, 1, t.cx, t.cy, t.cz, t.ea, t.eb, t.ec); break;
        default: A = ringPts(nA, t.R, t.cx, t.cy, t.height);
      }
      if (t.groundShape === 'line') G = linePts(nG, t.spacing, t.cx, t.cy, 0);
      else if (t.groundShape === 'grid') G = gridPts(nG, t.spacing, t.cx, t.cy, 0);
      else G = ringPts(nG, t.groundR, t.cx, t.cy, 0, Math.PI / Math.max(1, nG));
    }
    // Cada robot va al hueco que minimiza la suma de distancias al cuadrado desde su posición
    // inicial: las trayectorias rectas no se cruzan (en el orden fijo i -> i dos drones podían
    // chocar de camino a la formación).
    A = assignNearest(air, A); G = assignNearest(gnd, G);
    let ia = 0, ig = 0;
    return R.map(r => KINDS[r.kind].air ? A[ia++] : G[ig++]);
  }

  /** Reordena los puntos P para que el robot k vaya a P'[k] con coste mínimo (algoritmo húngaro). */
  function assignNearest(robots, P) {
    const n = Math.min(robots.length, P.length);
    if (n < 2) return P;
    const cost = (i, j) => (robots[i].x - P[j][0]) ** 2 + (robots[i].y - P[j][1]) ** 2;
    const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
    const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i; let j0 = 0;
      const minv = new Array(n + 1).fill(Infinity), used = new Array(n + 1).fill(false);
      do {
        used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
        for (let j = 1; j <= n; j++) {
          if (used[j]) continue;
          const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= n; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const out = P.slice();
    for (let j = 1; j <= n; j++) out[p[j] - 1] = P[j - 1];
    return out;
  }

  /** Aristas de la formación entre robots (índices en cfg.robots). */
  function formationEdges(cfg, T) {
    const t = cfg.task;
    if (t.mode === 'none') return [];
    if (t.mode === 'herding') {
      const air = cfg.robots.map((r, i) => [r, i]).filter(([r]) => KINDS[r.kind].air).map(([, i]) => i);
      return air.map((i, k) => [i, air[(k + 1) % air.length]]).filter(([i, j]) => i !== j);
    }
    if (t.mode === 'triangulated') return edgesFromTris(delaunay(T));
    return topologyEdges(T, t.topology, t.k);
  }

  function surfaceToken(cfg) {
    const t = cfg.task, sh = SHAPES[t.shape];
    if (!t.constraint || !sh || !sh.surface) return null;
    if (sh.surface === 'sphere') return `sphere_${fx(t.R, 2)}-${fx(t.cx, 2)}-${fx(t.cy, 2)}-${fx(t.cz, 2)}`;
    if (sh.surface === 'cone') return `cone_${fx(t.a, 2)}-${fx(t.c, 2)}-${fx(t.cx, 2)}-${fx(t.cy, 2)}-${fx(t.cz, 2)}`;
    if (sh.surface === 'ellipsoid') return `ellipsoid_${fx(t.cx, 2)}-${fx(t.cy, 2)}-${fx(t.cz, 2)}_${fx(t.ea, 2)}-${fx(t.eb, 2)}-${fx(t.ec, 2)}`;
    return null;
  }

  function experimentMode(cfg) {
    const types = new Set(cfg.robots.map(r => r.type));
    if (types.size === 1 && types.has('physical')) return 'physical';
    if (!types.has('physical') && !types.has('digital_twin')) return 'virtual';
    return 'hybrid';
  }
  const safeName = (s) => (String(s || 'Experimento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'Experimento');

  // ------------------------------------------------------------------
  //  Secuencia de órdenes
  // ------------------------------------------------------------------
  function defaultCommands(cfg) {
    const T = targets(cfg), R = cfg.robots, t = cfg.task;
    const hasAir = R.some(r => KINDS[r.kind].air);
    const cmds = [];
    if (hasAir) cmds.push({ delay: 10, trigger: 'time', target: 'swarm', kind: 'order', value: 'take_off' });
    if (t.mode === 'herding') {
      const sheep = R.find(r => !KINDS[r.kind].air);
      if (sheep) cmds.push({ delay: 1, trigger: 'time', target: sheep.name, kind: 'goal', value: [-1.0, 0.0, 0.0] });
    } else if (t.mode !== 'none') {
      R.forEach((r, i) => {
        if (t.mode === 'triangulated' && !(t.leaders || []).includes(i + 1)) return;
        cmds.push({ delay: i === 0 ? (hasAir ? 5 : 3) : 1, trigger: 'time', target: r.name, kind: 'goal', value: T[i].map(v => +v.toFixed(2)) });
      });
    }
    if (t.mode !== 'none') {
      cmds.push({ delay: 4, trigger: 'time', target: 'swarm', kind: 'order', value: 'formation_run' });
      cmds.push({ delay: 30, trigger: 'time', target: 'swarm', kind: 'order', value: 'formation_stop' });
    } else if (hasAir) {
      cmds.push({ delay: 15, trigger: 'time', target: 'swarm', kind: 'order', value: 'land' });
      return cmds;
    }
    if (hasAir) cmds.push({ delay: 5, trigger: 'time', target: 'swarm', kind: 'order', value: 'land' });
    return cmds;
  }
  const commandsOf = (cfg) => (cfg.commands && cfg.commands.length ? cfg.commands : defaultCommands(cfg));

  // ------------------------------------------------------------------
  //  Validación
  // ------------------------------------------------------------------
  function validate(cfg, L = 'es') {
    const tt = (es, en) => (L === 'en' ? en : es);
    const E = [], W = [];
    const R = cfg.robots, t = cfg.task;
    const nA = R.filter(r => KINDS[r.kind].air).length, nG = R.length - nA;
    if (!R.length) E.push(tt('Añade al menos un robot.', 'Add at least one robot.'));
    if (R.length > 30) W.push(tt('Más de 30 robots: Webots puede ir lento en tiempo real.', 'More than 30 robots: Webots may not keep real time.'));
    if (t.mode === 'herding') {
      if (nA < 3) E.push(tt('El pastoreo necesita al menos 3 drones pastores.', 'Herding needs at least 3 herder drones.'));
      if (nG < 1) E.push(tt('El pastoreo necesita un Khepera IV como «oveja».', 'Herding needs one Khepera IV as the "sheep".'));
      if (nG > 1) W.push(tt('Solo el primer Khepera actúa de oveja; el resto queda sin tarea.', 'Only the first Khepera acts as the sheep; the rest have no task.'));
    }
    if (t.mode === 'triangulated') {
      if (nG) E.push(tt('La formación triangulada con líderes es solo para drones: quita los Khepera.', 'The leader-based triangulated formation is drones-only: remove the Kheperas.'));
      if (nA < 4) E.push(tt('La formación triangulada necesita al menos 4 drones.', 'The triangulated formation needs at least 4 drones.'));
      const ld = (t.leaders || []).filter(i => i >= 1 && i <= nA);
      if (new Set(ld).size !== 2) E.push(tt('Elige exactamente dos líderes distintos.', 'Choose exactly two different leaders.'));
    }
    if (t.mode === 'distance') {
      const law = LAWS[t.law];
      if (law && law.shapes && !law.shapes.includes(t.shape)) E.push(tt(`La ley ${t.law} solo funciona con: ${law.shapes.join(', ')}.`, `Law ${t.law} only works with: ${law.shapes.join(', ')}.`));
      if (law && law.shapes && !t.constraint) E.push(tt('Las leyes con multiplicadores de Lagrange necesitan activar la restricción de superficie.', 'Lagrange-multiplier laws need the surface constraint enabled.'));
      if (R.length < 2) E.push(tt('Una formación necesita al menos 2 robots.', 'A formation needs at least 2 robots.'));
      const T = targets(cfg), Ed = formationEdges(cfg, T);
      const dim3 = nA > 0 && new Set(T.filter(Boolean).map(p => p[2].toFixed(2))).size > 1;
      // con restricción de superficie cada dron pierde un grado de libertad: basta rigidez «sobre la superficie» (2n-3)
      const onSurface = !!surfaceToken(cfg) && !nG;
      const need = dim3 && !onSurface ? 3 * R.length - 6 : 2 * R.length - 3;
      const where = onSurface ? tt('sobre la superficie', 'on the surface') : (dim3 ? '3D' : '2D');
      if (R.length >= 3 && Ed.length < need) W.push(tt(`La topología tiene ${Ed.length} aristas; una formación rígida ${where === '3D' || where === '2D' ? 'en ' + where : where} necesita al menos ${need}. Prueba «Delaunay», más vecinos o «todos con todos».`, `The topology has ${Ed.length} edges; a rigid formation ${where === '3D' || where === '2D' ? 'in ' + where : where} needs at least ${need}. Try "Delaunay", more neighbours or "all-to-all".`));
      if (nG && nA && t.shape !== 'ring' && t.shape !== 'grid' && t.shape !== 'line') W.push(tt('Los Khepera se colocan en el suelo (z = 0); la restricción de superficie solo afecta a los drones.', 'Kheperas stay on the floor (z = 0); the surface constraint only affects drones.'));
      T.forEach((p, i) => { if (p && KINDS[R[i].kind].air && (p[2] < 0.6 || p[2] > 3.0)) W.push(tt(`${R[i].name}: objetivo a z = ${p[2].toFixed(2)} m; el driver lo limita a [0,6, 3,0] m.`, `${R[i].name}: target at z = ${p[2].toFixed(2)} m; the driver clamps it to [0.6, 3.0] m.`)); });
      for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
        if (T[i] && T[j] && dist(T[i], T[j]) < 0.25) { W.push(tt(`${R[i].name} y ${R[j].name} quedan a menos de 25 cm en la formación.`, `${R[i].name} and ${R[j].name} are closer than 25 cm in the formation.`)); i = T.length; break; }
      }
    }
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      if (Math.hypot(R[i].x - R[j].x, R[i].y - R[j].y) < 0.2) { E.push(tt(`${R[i].name} y ${R[j].name} empiezan a menos de 20 cm.`, `${R[i].name} and ${R[j].name} start closer than 20 cm.`)); i = R.length; break; }
    }
    R.forEach(r => { if (Math.abs(r.x) > 2.8 || Math.abs(r.y) > 2.8) W.push(tt(`${r.name} empieza fuera de la zona central del laboratorio (±2,8 m).`, `${r.name} starts outside the central lab area (±2.8 m).`)); });
    if (R.some(r => r.kind === 'khepera' && r.type !== 'virtual')) W.push(tt('Khepera IV reales: experience.launch.py no lanza su driver; run.sh lo arranca aparte con uned_kheperaiv_driver.', 'Real Khepera IV: experience.launch.py does not start their driver; run.sh starts it separately with uned_kheperaiv_driver.'));
    if (cfg.env.tool === 'Gazebo') E.push(tt('Con Gazebo, experience.launch.py abre el mundo pero no crea los robots; usa Webots para simular la flota.', 'With Gazebo, experience.launch.py opens the world but does not spawn robots; use Webots to simulate the fleet.'));
    const cmds = commandsOf(cfg), names = new Set(R.map(r => r.name).concat(['swarm']));
    cmds.forEach((c, i) => {
      if (!names.has(c.target)) E.push(tt(`Orden ${i + 1}: el destino «${c.target}» no existe.`, `Command ${i + 1}: target "${c.target}" does not exist.`));
      if (c.trigger === 'ready' && !R.some(r => r.name === 'dron01')) E.push(tt(`Orden ${i + 1}: «esperar a ready» necesita un dron01 (es quien lo publica).`, `Command ${i + 1}: "wait for ready" needs a dron01 (it publishes it).`));
      if (c.kind === 'goal' && (!Array.isArray(c.value) || c.value.length !== 3 || c.value.some(v => !isFinite(v)))) E.push(tt(`Orden ${i + 1}: la posición debe tener x, y, z numéricos.`, `Command ${i + 1}: the position needs numeric x, y, z.`));
      if (c.kind === 'order' && /\s/.test(String(c.value))) E.push(tt(`Orden ${i + 1}: la orden no puede contener espacios.`, `Command ${i + 1}: the order cannot contain spaces.`));
    });
    return { errors: E, warnings: [...new Set(W)] };
  }

  // ------------------------------------------------------------------
  //  Fichero de experiencia
  // ------------------------------------------------------------------
  const thr = (co, ai) => ({ type: 'Constant', co: F(co, 3), ai: F(ai, 3) });

  function robotBlock(cfg, r, i, T, Ed) {
    const L = cfg.lowlevel, t = cfg.task;
    const air = KINDS[r.kind].air;
    const z0 = air ? (t.mode === 'triangulated' ? T[i][2] : 1.0) : 0.0;
    const pose = t.mode === 'triangulated' ? T[i] : [r.x, r.y, z0];
    const neigh = Ed.filter(([a, b]) => a === i || b === i).map(([a, b]) => (a === i ? b : a));
    const name = r.name;
    let task;
    if (t.mode === 'none') {
      task = { enable: false, T: 100, Onboard: false, controller: { type: 'gradient', protocol: 'Continuous', period: F(0.2), upperLimit: F(0.3), lowerLimit: F(-0.3), gain: F(0.1), threshold: thr(0.01, 0) }, role: 'consensus', type: 'distance', relationship: '' };
    } else if (t.mode === 'herding') {
      const isSheep = !air && cfg.robots.filter(q => !KINDS[q.kind].air)[0] === r;
      if (air) {
        const chord = neigh.length ? dist(T[i], T[neigh[0]]) : 1;
        task = { enable: true, T: 100, Onboard: false, controller: { type: 'affine_p', protocol: 'Continuous', period: F(0.2), upperLimit: F(0.3), lowerLimit: F(-0.3), gain: F(0.1), threshold: thr(0.01, 0) }, role: 'herder', type: 'herding', relationship: neigh.map(j => `${cfg.robots[j].name}_${fx(chord, 4)}`).concat(['khepera_1.0']).join(', ') };
      } else {
        const herders = cfg.robots.filter(q => KINDS[q.kind].air).map(q => q.name + '_1.0').join(', ');
        task = isSheep
          ? { enable: true, T: 100, Onboard: true, controller: { type: 'reactive', protocol: 'Continuous', period: F(0.05), upperLimit: F(0.1), lowerLimit: F(-0.1), gain: F(0.2), threshold: thr(0.01, 0) }, role: 'herd', type: 'reactive', relationship: herders }
          : { enable: false, T: 100, Onboard: false, controller: { type: 'gradient', protocol: 'Continuous', period: F(0.2), upperLimit: F(0.1), lowerLimit: F(-0.1), gain: F(0.1), threshold: thr(0.01, 0) }, role: 'consensus', type: 'distance', relationship: '' };
      }
    } else if (t.mode === 'triangulated') {
      task = { enable: true, T: 100, Onboard: false, controller: { type: 'affine_p', protocol: 'Continuous', period: F(0.2), upperLimit: F(0.3), lowerLimit: F(-0.3), gain: F(0.1), threshold: thr(0.01, 0) }, role: (t.leaders || []).includes(i + 1) ? 'leader' : 'follower', type: 'triangulated_formation', relationship: '' };
    } else {
      const rel = neigh.map(j => `${cfg.robots[j].name}_${fx(dist(T[i], T[j]), 5)}`);
      const sf = air ? surfaceToken(cfg) : null;
      if (sf) rel.push(sf);
      const law = t.law + (t.law === 'ML3' ? '' : '_' + t.output);
      task = {
        enable: true, T: 100, Onboard: true,
        controller: { type: law, protocol: t.protocol, period: F(t.period, 2), upperLimit: F(t.upper, 2), lowerLimit: F(-t.upper, 2), gain: F(t.gain, 3), threshold: thr(t.co, t.ai) },
        role: 'consensus', type: 'distance', relationship: rel.join(', '),
      };
    }
    const common = {
      local_pose: { enable: true, path: !!L.path, T: L.poseT | 0 },
      local_twist: { enable: !!L.twist, T: 20 },
    };
    if (air) {
      return Object.assign({
        type: r.type, name, control_mode: 'HighLevel', positioning: r.type === 'virtual' ? 'Intern' : L.positioning,
        pose: pose.map(v => fx(v, 2)).join(', '), uri: r.uri,
        controller: { type: L.cfController, enable: true, protocol: L.protocol, period: F(0.01), threshold: thr(L.co, L.ai) },
        communication: { type: L.comm, threshold: thr(L.commCo, L.commAi) },
      }, common, {
        data_attitude: { enable: false, T: 20 }, data_rate: { enable: false, T: 20 },
        data_motor: { enable: !!L.motors, T: 50 }, data: { enable: false, T: 20 },
        mars_data: { enable: true, T: 50 }, task,
      });
    }
    return Object.assign({
      type: r.type, name, positioning: r.type === 'virtual' ? 'Intern' : L.positioning,
      pose: pose.map(v => fx(v, 2)).join(' '), control_mode: 'HighLevel', agent_ip: r.ip, port_number: 50000,
      controller: { type: L.khController, enable: true, protocol: L.protocol, period: F(0.01), threshold: thr(L.co, L.ai) },
      communication: { type: L.comm, threshold: thr(L.commCo, L.commAi) },
    }, common, { data: { enable: false, T: 20 }, mars_data: { enable: true, T: 50 }, task });
  }

  function logTopics(cfg, Ed) {
    const R = cfg.robots, out = ['/swarm/order', '/swarm/status'];
    if (cfg.env.cpu) out.push('/ros2_cpu', '/cpu_stats', '/webots_bin_cpu', '/driver_cpu', '/rviz2_cpu');
    R.forEach((r, i) => {
      const n = '/' + r.name;
      out.push(n + '/local_pose', n + '/local_pose_gt', n + '/target_pose', n + '/goal_pose');
      if (cfg.task.mode !== 'none') {
        out.push(n + '/global_error');
        Ed.filter(([a, b]) => a === i || b === i).forEach(([a, b]) => { const j = a === i ? b : a; out.push(`${n}/${R[j].name}/error`); });
      }
    });
    if (cfg.task.mode === 'triangulated') out.push('/formation_error', '/formation_scale');
    return [...new Set(out)].join(' ');
  }

  function buildExperience(cfg) {
    const name = safeName(cfg.name), T = targets(cfg), Ed = formationEdges(cfg, T);
    const t = cfg.task, mode = experimentMode(cfg);
    let arch = { mode: 'distributed', node: { executable: 'none', name: 'none', pkg: 'none' } };
    if (t.mode === 'herding') arch = { mode: 'centralized', node: { executable: 'affine_formation_node', name: 'formation_controller', pkg: 'multi_agent_pkg' } };
    if (t.mode === 'triangulated') arch = { mode: 'centralized', node: { executable: 'triangulated_formation_node', name: 'formation_controller', pkg: 'multi_agent_pkg' } };
    const robots = {};
    cfg.robots.forEach((r, i) => { robots['Robot' + pad2(i + 1)] = robotBlock(cfg, r, i, T, Ed); });
    const doc = {
      Operation: { mode, tool: cfg.env.tool, world: name + '.wbt' },
      Experience: { type: t.mode === 'none' ? 'test' : (t.mode === 'herding' ? 'herding' : 'formation') },
      Architecture: arch,
      CPU_Monitoring: { enable: !!cfg.env.cpu, node: { executable: 'measure_process', name: 'benchmark', pkg: 'measure_process_ros2_pkg' }, processes: 'webots-bin, driver, ros2, swarm_driver, rviz2' },
      Interface: {
        enable: !!(cfg.env.rviz || cfg.env.rqt),
        rviz2: { enable: !!cfg.env.rviz, node: { executable: 'rviz2', name: 'rviz2', pkg: 'rviz2' }, file: name + '.rviz' },
        rqt: { enable: !!cfg.env.rqt, node: { executable: 'rqt_gui', name: 'interface', pkg: 'rqt_gui' }, file: 'default.perspective' },
        own: { enable: false, node: { name: null, pkg: null }, file: null },
      },
      Data_Logging: { enable: !!cfg.env.log, all: !!cfg.env.logAll, name: 'date', topics: logTopics(cfg, Ed) },
      Robots: robots,
      Supervisor: { enable: true, node: { executable: 'supervisor_node', name: 'supervisor', pkg: 'mars_supervisor_pkg', file: name + '_topics.yaml' } },
      Other: { Agent00: { enable: false } },
    };
    if (t.mode === 'triangulated') {
      doc.Mesh = { triangles: delaunay(T).map(tr => tr.map(k => k + 1)) };
      doc.Formation = { control_gain: F(t.meshGain, 1), uncertainty_enable: !!t.uncertainty };
    }
    const head = `# Robotic Park — ${cfg.description ? cfg.description.replace(/\n/g, ' ') + '. ' : ''}Agentes: ${cfg.robots.length}\n` +
      `# Generado con el configurador web de Robotic Park Lab (v${VERSION}).\n` +
      `# Lanzar:  ros2 launch roboticpark_config experience.launch.py config_file:=${name}.yaml\n\n`;
    return head + toYAML(doc);
  }

  function buildTopics(cfg) {
    const cmds = commandsOf(cfg).slice();
    const last = cmds[cmds.length - 1];
    if (!last || !(last.target === 'swarm' && last.value === 'end')) cmds.push({ delay: 10, trigger: 'time', target: 'swarm', kind: 'order', value: 'end' });
    const topicOf = (c) => c.kind === 'goal' ? (c.target === 'swarm' ? 'swarm/goal_pose' : c.target + '/target_pose') : (c.target === 'swarm' ? 'swarm/order' : c.target + '/order');
    const pubs = [];
    cmds.forEach(c => { const tp = topicOf(c), ty = c.kind === 'goal' ? 'PoseStamped' : 'String'; if (!pubs.some(p => p.name === tp)) pubs.push({ name: tp, type: ty }); });
    const doc = { config: { publisher: {}, subscription: { topic00: { name: 'swarm/status', type: 'String' } } } };
    pubs.forEach((p, i) => { doc.config.publisher['topic' + pad2(i)] = p; });
    cmds.forEach((c, i) => {
      const value = c.kind === 'goal' ? c.value.map(v => fx(v, 2)).join(' ') : String(c.value);
      doc['cmd' + pad2(i)] = {
        topic: topicOf(c), type: c.kind === 'goal' ? 'PoseStamped' : 'String', value,
        trigger: c.trigger === 'ready'
          ? { type: 'topic', name: 'swarm/status', value: 'ready' }
          : { type: 'time', name: 'swarm/status', value: F(c.delay, 1) },
      };
    });
    let txt = toYAML(doc).replace(/\n\n/g, '\n');
    return `# Guion de órdenes para mars_supervisor_pkg/supervisor_node.\n# Cada orden espera «trigger.value» segundos desde la anterior (type: time)\n# o a que llegue ese texto por swarm/status (type: topic).\n` + txt;
  }

  // ------------------------------------------------------------------
  //  Mundo de Webots (portado de generate_formation_assets.py)
  // ------------------------------------------------------------------
  const LED_RING = ['LED {', '  translation 0 0 0.001', '  children [', '    Shape {', '      appearance PBRAppearance {',
    '        baseColor 0.15 0.15 0.15', '        roughness 0.6', '        metalness 0', '      }', '      geometry Cylinder {',
    '        height 0.001', '        radius 0.017', '      }', '    }', '  ]', '  name "led_ring"', '  color [', '    0 1 0,',
    '    1 0 0,', '    0 0 1', '  ]', '}'].map(l => '    ' + l + '\n').join('');
  function buildWorld(cfg) {
    const R = cfg.robots.filter(r => r.type !== 'physical');
    const needK = R.some(r => r.kind === 'khepera');
    const P = 'https://raw.githubusercontent.com/cyberbotics/webots/R2025a/projects';
    let s = `#VRML_SIM R2025a utf8\n\nEXTERNPROTO "${P}/objects/backgrounds/protos/TexturedBackground.proto"\nEXTERNPROTO "${P}/objects/floors/protos/Floor.proto"\nEXTERNPROTO "${P}/objects/backgrounds/protos/TexturedBackgroundLight.proto"\nEXTERNPROTO "${P}/robots/bitcraze/crazyflie/protos/Crazyflie.proto"\n`;
    if (needK) s += `EXTERNPROTO "${P}/robots/k-team/khepera4/protos/Khepera4.proto"\n`;
    s += `EXTERNPROTO "${P}/appearances/protos/Parquetry.proto"\n\nWorldInfo {\n\tinfo [\n\t\t "Robotic Park World. ${String(cfg.description || safeName(cfg.name)).replace(/"/g, "'")}"\n\t]\n\tbasicTimeStep 20\n}\n`;
    s += `Viewpoint {\n\tfieldOfView 1\n\torientation 0.08257814004826021 0.7347446275807098 -0.6732987323821825 0.7219016991902246\n\tposition -6.686523789804856 3.246953734178069 5.0217815008034\n}\nTexturedBackground {\n}\nTexturedBackgroundLight {\n}\nDirectionalLight {\n\tambientIntensity 1\n\tdirection 6 -16 -10\n\tintensity 4\n}\n`;
    s += `Floor {\n\ttranslation -1 0 0\n\tsize 8 6\n\tappearance Parquetry {\n\t\ttype "chequered"\n\t\tIBLStrength 0\n\t}\n}\n`;
    if (cfg.env.world === 'lab') {
      s += `Solid {\n\trotation 0 0 1 3.14159\n\tchildren [\n\t\tCadShape {\n\t\t\turl [\n\t\t\t\t"meshes/RoboticPark.dae"\n\t\t\t]\n\t\t}\n\t]\n\tcontactMaterial ""\n\tboundingObject Mesh {\n\t\turl [\n\t\t\t"meshes/RoboticPark_new.dae"\n\t\t]\n\t}\n\tradarCrossSection 1\n}\n`;
    }
    let sup = false;
    R.forEach(r => {
      if (r.kind === 'crazyflie') {
        const supLine = sup ? '' : '  supervisor TRUE\n'; sup = true;
        // LED "led_ring": webots_driver.py lo usa al iniciar y el PROTO estándar no lo trae.
        // Disco fino bajo la placa (como el LED-ring deck real), sin boundingObject: no colisiona.
        s += `\nCrazyflie {\n\ttranslation ${fx(r.x)} ${fx(r.y)} 0.015\n\tname "${r.name}"\n\tcontroller "<extern>"\n${supLine}  extensionSlot [\n    InertialUnit {\n    }\n${LED_RING}  ]\n}\n`;
      } else {
        s += `\nKhepera4 {\n\ttranslation ${fx(r.x)} ${fx(r.y)} 0.015\n\tname "${r.name}"\n\tcontroller "<extern>"\n  turretSlot [\n    GPS {\n    }\n    InertialUnit {\n    }\n  ]\n}\n`;
      }
    });
    return s;
  }

  // ------------------------------------------------------------------
  //  RViz (bloques equivalentes a los de IROS_AffineFormation_N05.rviz)
  // ------------------------------------------------------------------
  function buildRviz(cfg) {
    const qos = (topic) => `      Topic:\n        Depth: 5\n        Durability Policy: Volatile\n        Filter size: 10\n        History Policy: Keep Last\n        Reliability Policy: Reliable\n        Value: ${topic}\n`;
    const model = (name, urdf, prefix) => `    - Alpha: 1\n      Class: rviz_default_plugins/RobotModel\n      Collision Enabled: false\n      Description File: ${urdf}\n      Description Source: File\n      Description Topic:\n        Depth: 5\n        Durability Policy: Volatile\n        History Policy: Keep Last\n        Reliability Policy: Reliable\n        Value: ''\n      Enabled: true\n      Links:\n        All Links Enabled: true\n        Expand Joint Details: false\n        Expand Link Details: false\n        Expand Tree: false\n        Link Tree Style: Links in Alphabetic Order\n        base_link:\n          Alpha: 1\n          Show Axes: false\n          Show Trail: false\n          Value: true\n      Mass Properties:\n        Inertia: false\n        Mass: false\n      Name: ${name}\n      TF Prefix: ${prefix}\n      Update Interval: 0\n      Value: true\n      Visual Enabled: true\n`;
    const pose = (name, topic, color) => `    - Alpha: 1\n      Axes Length: 1\n      Axes Radius: 0.1\n      Class: rviz_default_plugins/Pose\n      Color: ${color}\n      Enabled: true\n      Head Length: 0.1\n      Head Radius: 0.05\n      Name: ${name}\n      Shaft Length: 0.25\n      Shaft Radius: 0.02\n      Shape: Arrow\n` + qos(topic) + `      Value: true\n`;
    const path = (name, topic) => `    - Alpha: 1\n      Buffer Length: 1\n      Class: rviz_default_plugins/Path\n      Color: 255; 255; 25\n      Enabled: true\n      Head Diameter: 0.3\n      Head Length: 0.2\n      Length: 0.3\n      Line Style: Billboards\n      Line Width: 0.03\n      Name: ${name}\n      Offset:\n        X: 0\n        Y: 0\n        Z: 0\n      Pose Color: 255; 85; 255\n      Pose Style: None\n      Radius: 0.03\n      Shaft Diameter: 0.1\n      Shaft Length: 0.1\n` + qos(topic) + `      Value: true\n`;
    const marker = (name, topic) => `    - Class: rviz_default_plugins/Marker\n      Enabled: true\n      Name: ${name}\n      Namespaces:\n        {}\n` + qos(topic) + `      Value: true\n`;
    let d = `    - Alpha: 0.5\n      Cell Size: 1\n      Class: rviz_default_plugins/Grid\n      Color: 160; 160; 164\n      Enabled: true\n      Line Style:\n        Line Width: 0.03\n        Value: Lines\n      Name: Grid\n      Normal Cell Count: 0\n      Offset:\n        X: 0\n        Y: 0\n        Z: 0\n      Plane: XY\n      Plane Cell Count: 10\n      Reference Frame: <Fixed Frame>\n      Value: true\n`;
    d += model('RobotModel', 'src/uned_crazyflie_ros_pkg/uned_crazyflie_config/model/urdf/RoboticPark_simple.urdf', 'RoboticPark');
    const T = targets(cfg), Ed = formationEdges(cfg, T);
    cfg.robots.forEach((r, i) => {
      const air = KINDS[r.kind].air;
      d += model(r.name, air ? 'src/uned_crazyflie_ros_pkg/uned_crazyflie_config/model/urdf/crazyflie_simple.urdf' : 'src/uned_kheperaIV_ros_pkg/uned_kheperaiv_config/urdf/khepera_simple.urdf', r.name);
      d += pose(r.name + '-local_pose', '/' + r.name + '/local_pose', '25; 255; 0');
      d += pose(r.name + '-target_pose', '/' + r.name + '/target_pose', '255; 25; 0');
      if (cfg.lowlevel.path) d += path(r.name + '-path', '/' + r.name + '/path');
      if (cfg.task.mode === 'distance') Ed.filter(([a]) => a === i).forEach(([, b]) => { d += marker(r.name + '-' + cfg.robots[b].name, `/${r.name}/${cfg.robots[b].name}/marker`); });
    });
    return `Panels:\n  - Class: rviz_common/Displays\n    Help Height: 78\n    Name: Displays\n    Property Tree Widget:\n      Expanded: ~\n      Splitter Ratio: 0.5\n    Tree Height: 549\n  - Class: rviz_common/Views\n    Expanded:\n      - /Current View1\n    Name: Views\n    Splitter Ratio: 0.5\n  - Class: rviz_common/Time\n    Experimental: false\n    Name: Time\n    SyncMode: 0\n    SyncSource: ''\nVisualization Manager:\n  Class: ''\n  Displays:\n${d}  Enabled: true\n  Global Options:\n    Background Color: 80; 111; 93\n    Fixed Frame: map\n    Frame Rate: 30\n  Name: root\n  Tools:\n    - Class: rviz_default_plugins/Interact\n      Hide Inactive Objects: true\n    - Class: rviz_default_plugins/MoveCamera\n    - Class: rviz_default_plugins/Select\n    - Class: rviz_default_plugins/FocusCamera\n    - Class: rviz_default_plugins/Measure\n      Line color: 128; 128; 0\n    - Class: rviz_default_plugins/PublishPoint\n      Single click: true\n      Topic:\n        Depth: 5\n        Durability Policy: Volatile\n        History Policy: Keep Last\n        Reliability Policy: Reliable\n        Value: /clicked_point\n  Transformation:\n    Current:\n      Class: rviz_default_plugins/TF\n  Value: true\n  Views:\n    Current:\n      Class: rviz_default_plugins/Orbit\n      Distance: 6.5\n      Enable Stereo Rendering:\n        Stereo Eye Separation: 0.06\n        Stereo Focal Distance: 1\n        Swap Stereo Eyes: false\n        Value: false\n      Focal Point:\n        X: 0\n        Y: 0\n        Z: 0.6\n      Focal Shape Fixed Size: true\n      Focal Shape Size: 0.05\n      Invert Z Axis: false\n      Name: Current View\n      Near Clip Distance: 0.01\n      Pitch: 0.6\n      Target Frame: <Fixed Frame>\n      Value: Orbit (rviz)\n      Yaw: 0.8\n    Saved: ~\nWindow Geometry:\n  Displays:\n    collapsed: false\n  Height: 846\n  Hide Left Dock: false\n  Hide Right Dock: true\n  Width: 1200\n  X: 64\n  Y: 64\n`;
  }

  // ------------------------------------------------------------------
  //  Scripts y README
  // ------------------------------------------------------------------
  function buildInstall(cfg) {
    const name = safeName(cfg.name);
    return `#!/usr/bin/env bash
# Instala el experimento «${name}» en el paquete roboticpark_config de un
# espacio de trabajo ROS 2 con Robotic Park (rama humble-dev) ya instalado.
#   ./install.sh                  -> usa ${cfg.ws}
#   ./install.sh /ruta/al/ws      -> usa otro espacio de trabajo
set -euo pipefail
WS="\${1:-${cfg.ws.replace('~', '$HOME')}}"
PKG="$WS/src/RoboticPark/roboticpark_config"
HERE="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$PKG" ]; then
  echo "No encuentro $PKG"
  echo "Instala antes Robotic Park:"
  echo "  mkdir -p ~/roboticpark_ws/src && cd ~/roboticpark_ws/src"
  echo "  git clone -b humble-dev https://github.com/Robotic-Park-Lab/RoboticPark.git"
  echo "  cd RoboticPark && chmod +x install.sh && ./install.sh"
  exit 1
fi

for d in resources worlds rviz; do
  mkdir -p "$PKG/$d"
  cp -v "$HERE/roboticpark_config/$d/"* "$PKG/$d/"
done

source /opt/ros/humble/setup.bash
cd "$WS"
colcon build --symlink-install --packages-select roboticpark_config
echo
echo "Listo. Ejecuta ahora:  ./run.sh"
`;
  }

  function buildRun(cfg) {
    const name = safeName(cfg.name), R = cfg.robots;
    const realK = R.filter(r => r.kind === 'khepera' && r.type !== 'virtual');
    const real = R.some(r => r.type !== 'virtual');
    const useVicon = cfg.env.vicon === 'yes' || (cfg.env.vicon === 'auto' && real && (cfg.lowlevel.positioning === 'Vicon' || realK.length));
    let s = `#!/usr/bin/env bash
# Ejecuta el experimento «${name}» (${R.length} robots, modo ${experimentMode(cfg)}).
set -eo pipefail
WS="\${1:-${cfg.ws.replace('~', '$HOME')}}"
source /opt/ros/humble/setup.bash
source "$WS/install/setup.bash"
CONFIG="$(ros2 pkg prefix roboticpark_config)/share/roboticpark_config/resources/${name}.yaml"
PIDS=()
trap 'kill \${PIDS[@]} 2>/dev/null || true' EXIT
`;
    if (useVicon) s += `
# Sistema de posicionamiento Vicon (robots reales). Cambia la IP del PC de Vicon si es necesario.
ros2 launch vicon_receiver client.launch.py & PIDS+=($!)
sleep 2
`;
    if (realK.length) {
      s += `\n# Khepera IV reales: experience.launch.py no lanza su driver (bloque comentado en el launch).\n`;
      realK.forEach(r => { s += `ros2 run uned_kheperaiv_driver kheperaIV_client_driver --ros-args -r __node:=${r.name}_driver -p config:="$CONFIG" -p id:=${r.name} & PIDS+=($!)   # ${r.ip}\n`; });
    }
    if (real) s += `\n# Antes de lanzar: enciende los robots reales y comprueba la radio Crazyradio / la red de los Khepera.\n`;
    s += `\nros2 launch roboticpark_config experience.launch.py config_file:=${name}.yaml\n`;
    return s;
  }

  function summary(cfg, L) {
    const tt = (es, en) => (L === 'en' ? en : es);
    const R = cfg.robots, t = cfg.task;
    const cnt = (k, ty) => R.filter(r => r.kind === k && (!ty || r.type === ty)).length;
    const lines = [];
    lines.push(`- ${tt('Robots', 'Robots')}: ${cnt('crazyflie')} Crazyflie 2.1, ${cnt('khepera')} Khepera IV (${tt('virtuales', 'virtual')}: ${R.filter(r => r.type === 'virtual').length}, ${tt('reales', 'real')}: ${R.filter(r => r.type === 'physical').length}, ${tt('gemelo digital', 'digital twin')}: ${R.filter(r => r.type === 'digital_twin').length})`);
    lines.push(`- ${tt('Modo', 'Mode')}: ${experimentMode(cfg)} · ${tt('Simulador', 'Simulator')}: ${cfg.env.tool} (${cfg.env.world === 'lab' ? tt('laboratorio Robotic Park', 'Robotic Park lab') : tt('suelo vacío', 'empty floor')})`);
    if (t.mode === 'distance') lines.push(`- ${tt('Formación', 'Formation')}: ${SHAPES[t.shape].label[L === 'en' ? 1 : 0]}, ${tt('topología', 'topology')} ${t.topology}${t.topology === 'knn' ? ' (k=' + t.k + ')' : ''}, ${tt('ley', 'law')} ${t.law}${t.law === 'ML3' ? '' : '_' + t.output}, ${tt('ganancia', 'gain')} ${t.gain}, ${t.protocol}`);
    if (t.mode === 'herding') lines.push(`- ${tt('Tarea', 'Task')}: ${tt('pastoreo centralizado (multi_agent_pkg/affine_formation_node)', 'centralized herding (multi_agent_pkg/affine_formation_node)')}`);
    if (t.mode === 'triangulated') lines.push(`- ${tt('Tarea', 'Task')}: ${tt('formación triangulada con líderes', 'leader-based triangulated formation')} (${tt('líderes', 'leaders')}: ${(t.leaders || []).map(i => 'dron' + pad2(i)).join(', ')})`);
    if (t.mode === 'none') lines.push(`- ${tt('Tarea', 'Task')}: ${tt('sin formación (solo órdenes y puntos de paso)', 'no formation (orders and waypoints only)')}`);
    lines.push(`- ${tt('Control de bajo nivel', 'Low-level control')}: Crazyflie ${cfg.lowlevel.cfController}, Khepera ${cfg.lowlevel.khController}, ${cfg.lowlevel.protocol}; ${tt('comunicación', 'communication')} ${cfg.lowlevel.comm}`);
    return lines.join('\n');
  }

  function buildReadme(cfg, L = 'es') {
    const name = safeName(cfg.name), tt = (es, en) => (L === 'en' ? en : es);
    const cmds = commandsOf(cfg);
    let t = 0;
    const rows = cmds.map((c, i) => {
      if (c.trigger === 'time') t += Number(c.delay) || 0;
      const when = c.trigger === 'ready' ? tt('al recibir «ready»', 'on "ready"') : `+${c.delay} s (t≈${t.toFixed(0)} s)`;
      const v = c.kind === 'goal' ? `(${c.value.join(', ')})` : c.value;
      return `| ${i + 1} | ${when} | ${c.target} | ${c.kind === 'goal' ? tt('ir a', 'go to') : tt('orden', 'order')} | ${v} |`;
    }).join('\n');
    return `# ${name}

${cfg.description || tt('Experimento generado con el configurador web de Robotic Park Lab.', 'Experiment generated with the Robotic Park Lab web configurator.')}

${summary(cfg, L)}

## ${tt('Requisitos', 'Requirements')}

- Ubuntu 22.04 + ROS 2 Humble + Webots R2025a (\`sudo apt install ros-humble-webots-ros2-driver\`).
- ${tt('Robotic Park instalado (rama humble-dev)', 'Robotic Park installed (humble-dev branch)')}:
  \`\`\`bash
  mkdir -p ~/roboticpark_ws/src && cd ~/roboticpark_ws/src
  git clone -b humble-dev https://github.com/Robotic-Park-Lab/RoboticPark.git
  cd RoboticPark && chmod +x install.sh && ./install.sh
  \`\`\`

## ${tt('Uso', 'Usage')}

\`\`\`bash
chmod +x install.sh run.sh
./install.sh        # ${tt('copia los ficheros en roboticpark_config y recompila', 'copies the files into roboticpark_config and rebuilds')}
./run.sh            # ${tt('lanza Webots, los robots, RViz y el supervisor', 'launches Webots, the robots, RViz and the supervisor')}
\`\`\`

${tt('Equivale a', 'Equivalent to')} \`ros2 launch roboticpark_config experience.launch.py config_file:=${name}.yaml\`.

## ${tt('Ficheros', 'Files')}

| ${tt('Fichero', 'File')} | ${tt('Contenido', 'Contents')} |
|---|---|
| \`roboticpark_config/resources/${name}.yaml\` | ${tt('experiencia: modo, robots, controladores, formación, interfaz, registro', 'experience: mode, robots, controllers, formation, interface, logging')} |
| \`roboticpark_config/resources/${name}_topics.yaml\` | ${tt('guion de órdenes del supervisor (mars_supervisor_pkg)', 'supervisor command script (mars_supervisor_pkg)')} |
| \`roboticpark_config/worlds/${name}.wbt\` | ${tt('mundo de Webots con los robots virtuales', 'Webots world with the virtual robots')} |
| \`roboticpark_config/rviz/${name}.rviz\` | ${tt('vista de RViz', 'RViz view')} |
| \`experimento.json\` | ${tt('configuración para reabrirla en el configurador web', 'configuration to reopen it in the web configurator')} |

## ${tt('Secuencia de órdenes', 'Command sequence')}

| # | ${tt('Cuándo', 'When')} | ${tt('Destino', 'Target')} | ${tt('Tipo', 'Type')} | ${tt('Valor', 'Value')} |
|---|---|---|---|---|
${rows}
| ${cmds.length + 1} | +10 s | swarm | ${tt('orden', 'order')} | end |

${tt('Notas', 'Notes')}:
- ${tt('Al despegar, cada Crazyflie sube a 1,1 m sobre su posición inicial; el driver limita los objetivos a z ∈ [0,6, 3,0] m.', 'On take-off each Crazyflie climbs to 1.1 m above its start; the driver clamps targets to z ∈ [0.6, 3.0] m.')}
- ${tt('dron01 publica «ready» en swarm/status 4 s después de despegar.', 'dron01 publishes "ready" on swarm/status 4 s after take-off.')}
${cfg.env.log ? '- ' + tt('Registro activado: ros2 bag guarda una carpeta con la fecha y el supervisor copia allí la configuración.', 'Logging enabled: ros2 bag saves a dated folder and the supervisor copies the configuration into it.') + '\n' : ''}
${tt('Generado el', 'Generated on')} ${new Date().toISOString().slice(0, 10)} — https://robotic-park-lab.github.io/configurador/
`;
  }

  function build(cfg, L = 'es') {
    const name = safeName(cfg.name);
    const v = validate(cfg, L);
    const plain = JSON.parse(JSON.stringify(cfg));
    if (!plain.commands) plain.commands = null;
    const files = [
      { path: `roboticpark_config/resources/${name}.yaml`, content: buildExperience(cfg), lang: 'yaml' },
      { path: `roboticpark_config/resources/${name}_topics.yaml`, content: buildTopics(cfg), lang: 'yaml' },
      { path: `roboticpark_config/worlds/${name}.wbt`, content: buildWorld(cfg), lang: 'wbt' },
      { path: `roboticpark_config/rviz/${name}.rviz`, content: buildRviz(cfg), lang: 'yaml' },
      { path: 'install.sh', content: buildInstall(cfg), lang: 'sh', exec: true },
      { path: 'run.sh', content: buildRun(cfg), lang: 'sh', exec: true },
      { path: 'README.md', content: buildReadme(cfg, L), lang: 'md' },
      { path: 'experimento.json', content: JSON.stringify(Object.assign({ generator: 'robotic-park-configurador', generatorVersion: VERSION }, plain), null, 2), lang: 'json' },
    ];
    return { name, files, errors: v.errors, warnings: v.warnings };
  }

  return {
    VERSION, KINDS, SHAPES, LAWS, ORDERS, PRESETS,
    defaultConfig, syncRobots, targets, formationEdges, delaunay, surfaceToken,
    defaultCommands, commandsOf, validate, experimentMode, safeName,
    buildExperience, buildTopics, buildWorld, buildRviz, buildInstall, buildRun, buildReadme, build, toYAML,
  };
});
