/* Página interactiva: control de altitud por eventos con umbral relativo (JA 2021) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t;
  IP.page();
  const GAINS = { kp: 15000, ki: 3500, kd: 9000, nd: 20 };

  /* Portada: dron recorriendo el cuadrado de 1 m con los descensos; destellos en cada evento */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -40, el: 25, radius: 1.3, target: [0, 0, 0.6], autoRotate: IP.reducedMotion() ? 0 : 8 });
    const sim = ALT.simulate({ trigger: 'relative', c0: 0.01, a: 0.015, l: 20, noise: 0.006, gains: GAINS, ref: ALT.profile });
    const pos = (t) => {           // cuadrado de 1 m recorrido en 20 s a partir de t = 4 s
      const s = ((t - 4) / 20 % 1 + 1) % 1, side = Math.floor(s * 4), f = s * 4 - side;
      const C = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], a = C[side], b = C[(side + 1) % 4];
      return t < 4 ? [-0.5, -0.5] : [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    };
    let t = 0, flashes = [];
    IP.animate(cv.parentElement, (dt) => {
      t = (t + dt) % 30;
      const k = Math.min(sim.t.length - 1, Math.round(t / 0.01)), xy = pos(t), p = [xy[0], xy[1], sim.z[k]];
      if (sim.evT.some(e => Math.abs(e - t) < dt / 2 + 0.005)) flashes.push({ p: p.slice(), a: 1 });
      sc.begin();
      const sq = [[-0.5, -0.5, 1], [0.5, -0.5, 1], [0.5, 0.5, 1], [-0.5, 0.5, 1]];
      sc.polyline(sq, { color: 'rgba(200,230,215,0.35)', width: 1, closed: true, dash: [4, 4] });
      const g = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * 2 * Math.PI; g.push([0.9 * Math.cos(a), 0.9 * Math.sin(a), 0]); }
      sc.poly(g, { fill: 'rgba(200,230,215,0.08)', stroke: 'rgba(200,230,215,0.25)' });
      sc.line([p[0], p[1], 0], p, { color: 'rgba(240,163,95,0.5)', width: 1, dash: [3, 3] });
      flashes = flashes.filter(f => (f.a -= dt * 1.5) > 0);
      flashes.forEach(f => sc.point(f.p, { r: 14 * (1 - f.a) + 3, color: `rgba(240,163,95,${f.a * 0.8})` }));
      sc.drone(p, { color: '#6aa8ec', size: 0.09, alpha: 0.35 });
      sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'bat', label: T('Batería y\ncomunicaciones', 'Battery and\ncommunications'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>Un nano-dron de 27 g tiene poca batería y un canal de radio limitado. Ejecutar el control a 100 Hz consume ambos aunque el dron esté quieto.</p>', '<p>A 27 g nano-drone has a small battery and a limited radio link. Running the controller at 100 Hz consumes both even while hovering.</p>') },
      { id: 'model', label: T('Modelo\nNewton-Euler', 'Newton-Euler\nmodel'), kind: 'theory', x: 520, y: 75, mx: 310, my: 60, text: T('<p>Dinámica de 6 GDL del Crazyflie: empuje \\(F_i = C_T\\omega_i^2\\), momentos de los cuatro rotores e inercias. La altitud se controla con un PID en cascada a 100 Hz sobre el control de actitud a 500 Hz.</p>', '<p>6-DOF Crazyflie dynamics: thrust \\(F_i = C_T\\omega_i^2\\), rotor moments and inertias. Altitude is controlled by a 100 Hz PID cascaded over the 500 Hz attitude loop.</p>') },
      { id: 'pid', label: T('PID discreto\nperiodo T_k', 'Discrete PID\nperiod T_k'), kind: 'method', x: 890, y: 75, mx: 110, my: 170, href: '#umbral', text: T('<p>El PID usa el tiempo real \\(T_k\\) transcurrido desde el último evento en los términos integral y derivativo, para seguir siendo correcto con muestreo irregular.</p>', '<p>The PID uses the actual time \\(T_k\\) since the last event in its integral and derivative terms, so it stays correct under irregular sampling.</p>') },
      { id: 'sod', label: T('Send-on-delta\numbral fijo', 'Send-on-delta\nfixed threshold'), kind: 'method', x: 150, y: 260, mx: 310, my: 170, href: '#umbral', text: T('<p>Se dispara cuando la medida cambia más de \\(c_0 = 1\\) cm. Problema: el ruido del sensor genera muchos eventos innecesarios junto a la referencia.</p>', '<p>Triggers when the measurement changes by more than \\(c_0 = 1\\) cm. Problem: sensor noise generates many useless events near the reference.</p>') },
      { id: 'rel', label: T('Umbral relativo\n+ ruido c_n(t)', 'Relative threshold\n+ noise c_n(t)'), kind: 'method', x: 520, y: 260, mx: 110, my: 280, href: '#umbral', text: T('<p>\\(c_0 + a|p-p_{ref}| + c_n(t)\\): más permisivo lejos de la referencia y adaptado al nivel de ruido estimado en una ventana de 20 muestras.</p>', '<p>\\(c_0 + a|p-p_{ref}| + c_n(t)\\): more permissive far from the reference and adapted to the noise level estimated over a 20-sample window.</p>') },
      { id: 'sim', label: T('Simulación\n30 s', 'Simulation\n30 s'), kind: 'method', x: 890, y: 260, mx: 310, my: 280, href: '#simulador', text: T('<p>Trayectoria cuadrada de 1 m a 1 m de altura con dos descensos del 20 %, ruido blanco en la medida, en Simulink.</p>', '<p>1 m square trajectory at 1 m height with two 20% drops and white measurement noise, in Simulink.</p>') },
      { id: 'res', label: T('−93 % eventos\nIAE −3,3 %', '−93% events\nIAE −3.3%'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, href: '#resultados', text: T('<p>207 ejecuciones frente a 3000, con mejor IAE que el periódico y un intervalo máximo entre acciones de 1,25 s.</p>', '<p>207 executions vs 3000, better IAE than periodic and a maximum interval between actions of 1.25 s.</p>') }
    ],
    edges: [{ from: 'bat', to: 'sod', label: T('motiva', 'motivates') }, { from: 'model', to: 'pid' }, { from: 'sod', to: 'rel', label: T('ruido', 'noise') }, { from: 'pid', to: 'rel', bend: -0.1 }, { from: 'rel', to: 'sim' }, { from: 'sim', to: 'res' }, { from: 'model', to: 'sim', bend: 0.25 }]
  }, { panel: $('#cmapPanel'), initial: 'rel' });

  /* Simulador */
  const pz = new IP.Plot($('#pz'), { height: 250, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  const pth = new IP.Plot($('#pth'), { height: 170, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', ylabel: 'm' });
  const ctl = IP.controls($('#ctl'), [
    { id: 'show', type: 'select', label: T('Caso a detallar', 'Case to inspect'), value: 'relative', options: [{ value: 'periodic', label: T('1 · Periódico 100 Hz', '1 · Periodic 100 Hz') }, { value: 'fixed', label: T('2 · Umbral fijo', '2 · Fixed threshold') }, { value: 'relative', label: T('3 · Umbral relativo', '3 · Relative threshold') }] },
    { id: 'c0', label: T('Umbral constante', 'Constant threshold'), sym: 'c₀', min: 0.002, max: 0.05, step: 0.001, value: 0.01, unit: 'm', digits: 3 },
    { id: 'a', label: T('Peso de la distancia a la referencia', 'Weight of distance to reference'), sym: 'a', min: 0, max: 0.1, step: 0.005, value: 0.015, digits: 3 },
    { id: 'l', label: T('Ventana de ruido', 'Noise window'), sym: 'l', min: 2, max: 60, step: 1, value: 20, digits: 0, unit: T('muestras', 'samples') },
    { id: 'noise', label: T('Ruido de la medida (σ)', 'Measurement noise (σ)'), min: 0, max: 0.012, step: 0.0005, value: 0.006, unit: 'm', digits: 4 },
    { id: 'zoom', type: 'select', label: T('Ventana del zoom', 'Zoom window'), value: 'tr', options: [{ value: 'tr', label: T('Transitorio (0–2 s)', 'Transient (0–2 s)') }, { value: 'ss', label: T('Estacionario (14–16 s)', 'Steady state (14–16 s)') }] }
  ], IP.debounce(run, 50));
  function run() {
    const v = ctl.values, base = { gains: GAINS, ref: ALT.profile, noise: v.noise, seed: 7, c0: v.c0, a: v.a, l: Math.round(v.l) };
    const R = { periodic: ALT.simulate(Object.assign({}, base, { trigger: 'periodic' })), fixed: ALT.simulate(Object.assign({}, base, { trigger: 'fixed' })), relative: ALT.simulate(Object.assign({}, base, { trigger: 'relative' })) };
    const sub = (a) => a.filter((_, i) => i % 3 === 0);
    pz.setSeries([
      { name: T('referencia', 'reference'), color: '--muted', x: R.periodic.t, y: R.periodic.ref, step: true, width: 1.2, dash: [4, 4] },
      { name: T('periódico', 'periodic'), color: '--s5', x: sub(R.periodic.t), y: sub(R.periodic.z), width: 1.8, unit: 'm' },
      { name: T('umbral fijo', 'fixed thr.'), color: '--s2', x: sub(R.fixed.t), y: sub(R.fixed.z), width: 1.8, unit: 'm' },
      { name: T('umbral relativo', 'relative thr.'), color: '--s1', x: sub(R.relative.t), y: sub(R.relative.z), width: 2.2, unit: 'm' },
      { name: T('eventos (caso elegido)', 'events (chosen case)'), color: '--s3', x: R[v.show].evT, y: R[v.show].evT.map(() => -0.05), points: true, r: 1.5, notip: true }
    ]);
    const S = R[v.show], [a, b] = v.zoom === 'tr' ? [0, 2] : [14, 16];
    const idx = S.t.map((t, i) => (t >= a && t <= b ? i : -1)).filter(i => i >= 0);
    pth.opts.xlim = [a, b];
    pth.setSeries([
      { name: '|p(t_k) − p(t)|', color: '--s3', x: idx.map(i => S.t[i]), y: idx.map(i => S.diff[i]), width: 1.4 },
      { name: T('umbral', 'threshold'), color: '--s2', x: idx.map(i => S.t[i]), y: idx.map(i => S.thr[i]), width: 2 }
    ]);
    const c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`, m = (k) => R[k].metrics;
    const red = (k) => fmt(100 * (1 - m(k).events / m('periodic').events), 1) + ' %';
    $('#ro').innerHTML =
      c(T('Muestras · periódico', 'Samples · periodic'), String(m('periodic').events)) + c(T('Muestras · fijo', 'Samples · fixed'), `${m('fixed').events} (−${red('fixed')})`) +
      c(T('Muestras · relativo', 'Samples · relative'), `${m('relative').events} (−${red('relative')})`, 'hl') +
      c('IAE ' + T('periódico', 'periodic'), fmt(m('periodic').iae, 3)) + c(T('IAE fijo', 'IAE fixed'), fmt(m('fixed').iae, 3)) + c(T('IAE relativo', 'IAE relative'), fmt(m('relative').iae, 3), 'hl') +
      c(T('Máx. entre acciones', 'Max. gap'), fmt(m('relative').maxGap, 2) + ' s');
  }
  run();

  IP.quiz($('#quizBox'), [
    { q: T('¿Por qué el umbral fijo (caso 2) genera tantos eventos con el dron ya estabilizado?', 'Why does the fixed threshold (case 2) produce so many events once the drone is stabilised?'), options: [T('Porque la referencia cambia', 'Because the reference changes'), T('Porque el ruido de la medida supera a menudo 1 cm de variación', 'Because measurement noise often exceeds a 1 cm variation'), T('Porque el PID es inestable', 'Because the PID is unstable')], answer: 1,
      explain: T('Cerca de la referencia la medida sólo varía por el ruido; con un umbral constante pequeño, el ruido basta para disparar. El término c_n(t) lo evita.', 'Near the reference the measurement only varies because of noise; with a small constant threshold, noise is enough to trigger. The c_n(t) term prevents this.') },
    { q: T('¿Qué hace el término a·|p − p_ref|?', 'What does the term a·|p − p_ref| do?'), options: [T('Endurece el umbral lejos de la referencia', 'Tightens the threshold far from the reference'), T('Relaja el umbral cuando el dron está lejos de la referencia', 'Relaxes the threshold when the drone is far from the reference'), T('Estima el ruido', 'Estimates the noise')], answer: 1,
      explain: T('Lejos de la referencia los cambios grandes son normales y no hace falta reaccionar a cada centímetro; cerca de ella el umbral vuelve a ser fino.', 'Far from the reference large changes are normal and there is no need to react to every centimetre; near it the threshold becomes tight again.') },
    { q: T('¿Por qué el PID usa T_k, el tiempo desde el último evento?', 'Why does the PID use T_k, the time since the last event?'), options: [T('Para que integral y derivada sean correctas con muestreo irregular', 'So that integral and derivative remain correct under irregular sampling'), T('Para ahorrar memoria', 'To save memory'), T('Porque T_k es siempre 10 ms', 'Because T_k is always 10 ms')], answer: 0,
      explain: T('Entre eventos pueden pasar hasta 1,25 s; integrar o derivar con 10 ms fijos daría resultados erróneos.', 'Up to 1.25 s can elapse between events; integrating or differentiating with a fixed 10 ms would be wrong.') }
  ]);
})();
