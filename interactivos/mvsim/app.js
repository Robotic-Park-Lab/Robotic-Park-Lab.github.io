/* Página interactiva: MultiVehicle Simulator (MVSim), SoftwareX 2023 */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t;
  IP.page();
  const g = 9.81;

  /**
   * Robot diferencial con el modelo de fricción de MVSim (paso por rueda):
   *  1) velocidad del centro de la rueda en su marco local (v_x, v_y)
   *  2) F_y = −v_y W/(dt g) saturada a ±μW
   *  3) F_x del equilibrio de momentos imponiendo rodadura (ω* = v_x/R); si satura, se recalcula ω̇
   */
  class Diff {
    constructor(o = {}) {
      Object.assign(this, { m: 20, b: 0.22, R: 0.1, Iy: 0.005, mu: 0.8, tmax: 6, kp: 3, FR: 0 }, o);
      this.Iz = this.m * (0.5 ** 2 + 0.44 ** 2) / 12;
      this.x = o.x || 0; this.y = o.y || 0; this.th = o.th || 0; this.vx = 0; this.vy = 0; this.om = 0; this.w = [0, 0];
      this.F = [[0, 0], [0, 0]]; this.sat = [[false, false], [false, false]];
    }
    step(dt, vref, wref) {
      const c = Math.cos(this.th), s = Math.sin(this.th), W = this.m * g / 2, Fmax = this.mu * W;
      const wr = [(vref - wref * this.b) / this.R, (vref + wref * this.b) / this.R];   // [izquierda, derecha]
      let Fx = 0, Fy = 0, Mz = 0;
      for (let k = 0; k < 2; k++) {
        const ly = k === 0 ? this.b : -this.b;                     // posición lateral de la rueda (izq. +y)
        // v_W = v_V + ω × t_W, en el marco del vehículo
        const vbx = c * this.vx + s * this.vy, vby = -s * this.vx + c * this.vy;
        const wx = vbx - this.om * ly, wy = vby;
        let fy = -wy * W / (dt * g), sy = false; if (Math.abs(fy) > Fmax) { fy = Math.sign(fy) * Fmax; sy = true; }
        const tm = Math.max(-this.tmax, Math.min(this.tmax, this.kp * (wr[k] - this.w[k])));
        const wdStar = (wx / this.R - this.w[k]) / dt;
        let fx = (tm - wdStar * this.Iy) / this.R + this.FR, sx = false, wd = wdStar;
        if (Math.abs(fx) > Fmax) { fx = Math.sign(fx) * Fmax; sx = true; wd = (tm + this.R * this.FR - this.R * fx) / this.Iy; }
        this.w[k] += wd * dt;
        this.F[k] = [fx / Fmax, fy / Fmax]; this.sat[k] = [sx, sy];
        Fx += fx; Fy += fy; Mz += -ly * fx;
      }
      // fuerzas al marco global e integración del chasis
      const ax = (c * Fx - s * Fy) / this.m, ay = (s * Fx + c * Fy) / this.m;
      this.vx += ax * dt; this.vy += ay * dt; this.om += Mz / this.Iz * dt;
      this.x += this.vx * dt; this.y += this.vy * dt; this.th += this.om * dt;
      this.slip = this.sat[0][0] || this.sat[0][1] || this.sat[1][0] || this.sat[1][1];
    }
  }

  /* Portada: flota en un almacén */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -30, el: 40, radius: 3.6, target: [0, 0, 0], autoRotate: IP.reducedMotion() ? 0 : 5 });
    const R = (() => { let s = 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const bots = Array.from({ length: 14 }, (_, i) => Object.assign(new Diff({ x: (R() - 0.5) * 5, y: (R() - 0.5) * 5, th: R() * 6.28 }), { ph: R() * 6 }));
    const shelves = [[-1.8, -2.4, 1.6], [-1.8, 0, 1.6], [-1.8, 2.4, 1.6], [1.8, -1.2, 1.6], [1.8, 1.2, 1.6]];
    let t = 0;
    IP.animate(cv.parentElement, (dt) => {
      t += dt;
      for (let k = 0; k < 10; k++) bots.forEach(b => { const away = Math.hypot(b.x, b.y) > 2.9; b.step(0.002, 0.6, away ? 2 : 0.6 * Math.sin(0.7 * t + b.ph)); });
      sc.begin();
      sc.poly([[-3.2, -3.2, 0], [3.2, -3.2, 0], [3.2, 3.2, 0], [-3.2, 3.2, 0]], { fill: 'rgba(200,230,215,0.05)', stroke: 'rgba(200,230,215,0.3)', width: 1 });
      shelves.forEach(([x, y, l]) => sc.poly([[x - 0.15, y - l / 2, 0.35], [x + 0.15, y - l / 2, 0.35], [x + 0.15, y + l / 2, 0.35], [x - 0.15, y + l / 2, 0.35]], { fill: '#f0a35f', alpha: 0.35, stroke: '#f0a35f' }));
      bots.forEach(b => sc.rover([b.x, b.y, 0], b.th, { color: '#6aa8ec', size: 0.16 }));
      sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'need', label: T('Simular flotas\nes caro', 'Simulating fleets\nis expensive'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>Los simuladores 3D generalistas consumen mucha CPU por robot y modelan mal el contacto rueda-suelo en vehículos terrestres.</p>', '<p>General-purpose 3D simulators use a lot of CPU per robot and poorly model wheel–ground contact for ground vehicles.</p>') },
      { id: 'b2d', label: T('Física 2D\nBox2D', '2D physics\nBox2D'), kind: 'method', x: 520, y: 75, mx: 310, my: 60, text: T('<p>Las colisiones y el movimiento del chasis se resuelven en el plano, mucho más barato que un motor 3D completo.</p>', '<p>Collisions and chassis motion are solved in the plane, far cheaper than a full 3D engine.</p>') },
      { id: 'fric', label: T('Fricción\nrueda-suelo', 'Wheel–ground\nfriction'), kind: 'theory', x: 890, y: 75, mx: 110, my: 170, href: '#friccion', text: T('<p>Modelo jerárquico por rueda: fuerza lateral y longitudinal saturadas a \\(\\mu W\\), rodadura opcional de Ward–Iagnemma y terreno 3D por mapas de elevación.</p>', '<p>Hierarchical per-wheel model: lateral and longitudinal forces saturated at \\(\\mu W\\), optional Ward–Iagnemma rolling resistance and 3D terrain from elevation maps.</p>') },
      { id: 'gpu', label: T('Sensores\npor GPU', 'GPU\nsensors'), kind: 'method', x: 890, y: 260, mx: 310, my: 170, text: T('<p>Cámaras, RGBD y LiDAR 2D/3D con OpenGL: millones de puntos por segundo.</p>', '<p>Cameras, RGBD and 2D/3D LiDAR with OpenGL: millions of points per second.</p>') },
      { id: 'arch', label: T('ZeroMQ · Protobuf\nROS 1/2 · Python', 'ZeroMQ · Protobuf\nROS 1/2 · Python'), kind: 'method', x: 520, y: 260, mx: 110, my: 280, href: '#arquitectura', text: T('<p>Arquitectura modular cliente-servidor: el mismo mundo se controla desde ROS, desde Python o desde la línea de órdenes.</p>', '<p>Modular client–server architecture: the same world can be driven from ROS, Python or the command line.</p>') },
      { id: 'res', label: T('Menos CPU que\nGazebo y Webots', 'Less CPU than\nGazebo and Webots'), kind: 'result', x: 150, y: 260, mx: 310, my: 280, href: '#escala', text: T('<p>En la comparación con N robots diferenciales con LiDAR, MVSim mantiene un consumo mucho menor y casi plano.</p>', '<p>In the comparison with N differential robots with LiDAR, MVSim keeps a much lower and nearly flat usage.</p>') },
      { id: 'fut', label: T('SLAM, Nav2\ne integración continua', 'SLAM, Nav2\nand CI'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, text: T('<p>Trabajo futuro: conjuntos de datos sintéticos para SLAM, estimación de parámetros rueda-suelo, pruebas automáticas sin interfaz y Nav2.</p>', '<p>Future work: synthetic SLAM datasets, wheel–ground parameter estimation, headless automated tests and Nav2.</p>') }
    ],
    edges: [{ from: 'need', to: 'b2d' }, { from: 'b2d', to: 'fric' }, { from: 'fric', to: 'gpu', bend: 0.1 }, { from: 'gpu', to: 'arch' }, { from: 'arch', to: 'res' }, { from: 'res', to: 'fut', bend: 0.1 }]
  }, { panel: $('#cmapPanel'), initial: 'fric' });

  /* Fricción */
  const MAN = {
    turn: { label: T('Giro brusco', 'Sharp turn'), f: (t) => [t < 0.3 ? 0 : 1.6, t > 2 && t < 3.6 ? 3.2 : 0] },
    start: { label: T('Arranque y frenada', 'Launch and brake'), f: (t) => [t > 0.3 && t < 3 ? 2.2 : 0, 0] },
    slalom: { label: 'Slalom', f: (t) => [t < 0.3 ? 0 : 1.3, 2.6 * Math.sin(1.8 * (t - 0.3))] }
  };
  const sc = new IP.Scene3D($('#cv'), { az: -90, el: 62, radius: 3.4, target: [2.6, 0.6, 0] });
  const pw = new IP.Plot($('#pw'), { height: 200, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  let man = 'turn';
  IP.seg($('#manSeg'), Object.keys(MAN).map(k => ({ value: k, label: MAN[k].label })), man, (v) => { man = v; reset(); });
  const ctl = IP.controls($('#ctl'), [
    { id: 'mu', label: T('Coeficiente de fricción', 'Friction coefficient'), sym: 'μ', min: 0.05, max: 1, step: 0.01, value: 0.35, digits: 2, hint: T('Hielo ≈ 0,1 · hierba ≈ 0,35 · asfalto seco ≈ 0,8', 'Ice ≈ 0.1 · grass ≈ 0.35 · dry asphalt ≈ 0.8') },
    { id: 'm', label: T('Masa del robot', 'Robot mass'), sym: 'm', unit: 'kg', min: 5, max: 60, step: 1, value: 20, digits: 0 },
    { id: 'tmax', label: T('Par máximo del motor', 'Max motor torque'), sym: 'τ_max', unit: 'N·m', min: 1, max: 15, step: 0.5, value: 6, digits: 1 }
  ], () => reset());
  $('#run').addEventListener('click', () => reset());
  let S;
  function reset() {
    const v = ctl.values;
    S = { r: new Diff({ mu: v.mu, m: v.m, tmax: v.tmax }), ideal: { x: 0, y: 0, th: 0 }, t: 0, trail: [], ghost: [], h: { t: [], rw: [], vx: [] }, slipT: 0 };
  }
  reset();
  const DT = 0.002, TEND = 6;
  IP.animate($('#friccion'), (dt) => {
    const steps = Math.round(Math.min(0.05, dt) / DT);
    for (let k = 0; k < steps && S.t < TEND; k++) {
      const [vr, wr] = MAN[man].f(S.t); S.r.step(DT, vr, wr);
      S.ideal.x += vr * Math.cos(S.ideal.th) * DT; S.ideal.y += vr * Math.sin(S.ideal.th) * DT; S.ideal.th += wr * DT;
      S.t += DT; if (S.r.slip) S.slipT += DT;
      if (Math.round(S.t / DT) % 10 === 0) {
        S.trail.push([S.r.x, S.r.y, S.r.slip]); S.ghost.push([S.ideal.x, S.ideal.y]);
        const c = Math.cos(S.r.th), s = Math.sin(S.r.th);
        S.h.t.push(S.t); S.h.rw.push(S.r.w[0] * S.r.R); S.h.vx.push(c * S.r.vx + s * S.r.vy - S.r.om * S.r.b);
      }
    }
    if (S.t >= TEND + 1.5) reset(); else if (S.t >= TEND) S.t += dt;
    sc.begin();
    for (let k = -2; k <= 8; k++) { sc.line([k, -3, 0], [k, 3, 0], { color: '--grid', width: 0.8 }); }
    for (let k = -3; k <= 3; k++) { sc.line([-2, k, 0], [8, k, 0], { color: '--grid', width: 0.8 }); }
    if (S.ghost.length > 1) sc.polyline(S.ghost.map(p => [p[0], p[1], 0.01]), { color: '--muted', width: 1.6, dash: [5, 4] });
    for (let k = 1; k < S.trail.length; k++) sc.line([S.trail[k - 1][0], S.trail[k - 1][1], 0.01], [S.trail[k][0], S.trail[k][1], 0.01], { color: S.trail[k][2] ? '--danger' : '--s1', width: 2.6 });
    const r = S.r, c = Math.cos(r.th), s = Math.sin(r.th);
    sc.rover([r.x, r.y, 0], r.th, { color: r.slip ? '--danger' : '--s3', size: 0.28 });
    [r.b, -r.b].forEach((ly, k) => { const p = [r.x - s * ly, r.y + c * ly, 0.02], F = r.F[k]; sc.line(p, [p[0] + 0.5 * (c * F[0] - s * F[1]), p[1] + 0.5 * (s * F[0] + c * F[1]), 0.02], { color: r.sat[k][0] || r.sat[k][1] ? '--danger' : '--ok', width: 3 }); });
    sc.draw(dt);
    const bar = (lab, f, sat) => `<span>${lab}</span><div class="wbar"><i class="${sat ? 'sat' : ''}" style="left:${f < 0 ? 50 + 50 * f : 50}%;width:${50 * Math.abs(f)}%"></i></div>`;
    $('#wb').innerHTML = bar(T('Izq. F_x/F_max', 'Left F_x/F_max'), r.F[0][0], r.sat[0][0]) + bar(T('Izq. F_y/F_max', 'Left F_y/F_max'), r.F[0][1], r.sat[0][1]) + bar(T('Der. F_x/F_max', 'Right F_x/F_max'), r.F[1][0], r.sat[1][0]) + bar(T('Der. F_y/F_max', 'Right F_y/F_max'), r.F[1][1], r.sat[1][1]);
    const dev = Math.hypot(r.x - S.ideal.x, r.y - S.ideal.y), cc = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    $('#ro').innerHTML = cc('F_max', fmt(r.mu * r.m * g / 2, 1) + ' N') + cc(T('Tiempo deslizando', 'Time slipping'), (S.slipT < 0.005 ? '0' : fmt(S.slipT, 2)) + ' s', S.slipT > 0.1 ? 'bad' : 'good') + cc(T('Desvío frente al ideal', 'Deviation from ideal'), fmt(dev, 2) + ' m', 'hl') + cc(T('Velocidad', 'Speed'), fmt(Math.hypot(r.vx, r.vy), 2) + ' m/s');
    pw.opts.xlim = [0, TEND];
    pw.setSeries([{ name: 'R·ω', color: '--s2', x: S.h.t, y: S.h.rw, width: 2 }, { name: 'v_x', color: '--s1', x: S.h.t, y: S.h.vx, width: 2, dash: [5, 3] }]);
  }).start();

  /* Escalabilidad */
  const scs = new IP.Scene3D($('#cvs'), { az: -30, el: 50, radius: 5.2, target: [0, 0, 0] });
  const ps = new IP.Plot($('#pscale'), { height: 180, xlabel: 'N', xname: 'N', legend: false });
  const ctls = IP.controls($('#ctls'), [{ id: 'N', label: T('Número de robots', 'Number of robots'), sym: 'N', min: 1, max: 400, step: 1, value: 40, digits: 0 }], () => { fleet(); acc = 0; cnt = 0; });
  let fl = [], meas = new Map();
  function fleet() {
    const N = Math.round(ctls.values.N); let s = 3; const R = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    while (fl.length < N) fl.push(Object.assign(new Diff({ x: (R() - 0.5) * 7, y: (R() - 0.5) * 7, th: R() * 6.28, mu: 0.6 }), { ph: R() * 6 }));
    fl.length = N;
  }
  fleet();
  // medida inicial para varios N (bloque corto al cargar)
  (function premeasure() {
    const tmp = Array.from({ length: 400 }, (_, i) => new Diff({ x: (i % 20) * 0.4 - 4, y: Math.floor(i / 20) * 0.4 - 4, mu: 0.6 }));
    [1, 25, 50, 100, 200, 300, 400].forEach(N => { const sub = tmp.slice(0, N), t0 = performance.now(); let reps = 0; while (performance.now() - t0 < 12) { sub.forEach(b => b.step(0.004, 0.8, 0.3)); reps++; } meas.set(N, (performance.now() - t0) * 1000 / reps); });
  })();
  let tt = 0, acc = 0, cnt = 0;
  IP.animate($('#escala'), (dt) => {
    tt += dt; const N = fl.length, t0 = performance.now(), nsteps = 8;
    for (let k = 0; k < nsteps; k++) fl.forEach(b => { const away = Math.hypot(b.x, b.y) > 4; b.step(0.004, 0.8, away ? 2 : 0.8 * Math.sin(0.6 * tt + b.ph)); });
    acc += performance.now() - t0; cnt += nsteps;     // el reloj del navegador tiene poca resolución: se acumula
    if (acc > 25) { const v = acc * 1000 / cnt, prev = meas.get(N); meas.set(N, prev ? 0.6 * prev + 0.4 * v : v); acc = 0; cnt = 0; }
    scs.begin();
    scs.poly([[-4.5, -4.5, 0], [4.5, -4.5, 0], [4.5, 4.5, 0], [-4.5, 4.5, 0]], { fill: '--surface-2', alpha: 0.5, stroke: '--border' });
    fl.forEach(b => scs.rover([b.x, b.y, 0], b.th, { color: '--s1', size: 0.18 }));
    scs.draw(dt);
    const pts = [...meas.entries()].sort((a, b) => a[0] - b[0]);
    ps.overlays = { markers: pts.map(([n, v]) => ({ x: n, y: v, color: '--s1', scale: true })) };
    ps.opts.xlim = [0, 400];
    ps.setSeries([{ name: 'μs', color: '--s1', x: pts.map(p => p[0]), y: pts.map(p => p[1]), width: 1.4 }]);
    const cur = meas.get(N), cc = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    $('#ros').innerHTML = cc(T('Robots', 'Robots'), String(N)) + cc(T('Tiempo por paso', 'Time per step'), cur ? fmt(cur, 0) + ' µs' : '…', 'hl') + cc(T('Por robot y paso', 'Per robot per step'), cur ? fmt(cur / N, 2) + ' µs' : '…') + cc(T('Pasos/s posibles', 'Possible steps/s'), cur ? fmt(1e6 / cur, 0) : '…');
  }).start();

  IP.quiz($('#quizBox'), [
    { q: T('¿Cuándo derrapa lateralmente una rueda en el modelo de MVSim?', 'When does a wheel skid sideways in MVSim\'s model?'), options: [T('Cuando la fuerza lateral necesaria para anular v_y supera μW', 'When the lateral force needed to cancel v_y exceeds μW'), T('Siempre que gira', 'Whenever it turns'), T('Cuando el motor satura', 'When the motor saturates')], answer: 0, explain: T('F_y = −v_y W/(dt g) se satura a ±F_max; entonces la velocidad lateral no se anula del todo y el robot se desvía.', 'F_y = −v_y W/(dt g) is clamped to ±F_max; then the lateral velocity is not fully cancelled and the robot drifts.') },
    { q: T('En «Arranque y frenada» con μ bajo, ¿qué muestra la gráfica R·ω frente a v_x?', 'In "Launch and brake" with low μ, what does the R·ω vs v_x plot show?'), options: [T('La rueda gira más rápido de lo que avanza el robot: patina', 'The wheel spins faster than the robot advances: it spins out'), T('Que ambas coinciden siempre', 'That both always match'), T('Que el robot va marcha atrás', 'That the robot reverses')], answer: 0, explain: T('Al saturar F_x = ±F_max, el resto del par acelera la propia rueda (ω̇ se recalcula) y aparece deslizamiento longitudinal.', 'When F_x saturates at ±F_max, the remaining torque accelerates the wheel itself (ω̇ is recomputed) and longitudinal slip appears.') },
    { q: T('¿Por qué MVSim es tan ligero?', 'Why is MVSim so lightweight?'), options: [T('Resuelve el chasis en 2D con Box2D y añade sólo el modelo de fricción necesario para vehículos terrestres', 'It solves the chassis in 2D with Box2D and adds only the friction model needed for ground vehicles'), T('Porque no simula sensores', 'Because it does not simulate sensors'), T('Porque sólo admite un robot', 'Because it only supports one robot')], answer: 0, explain: T('Los sensores sí se simulan (por GPU); la clave está en no resolver un sistema multicuerpo 3D completo.', 'Sensors are simulated (on the GPU); the key is not solving a full 3D multibody system.') }
  ]);
})();
