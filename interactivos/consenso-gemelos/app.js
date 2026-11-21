/* Página interactiva: Formation by consensus with twins-in-the-loop (ROBOT 2022) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t, V = MA.v;
  IP.page();

  // Formación de ejemplo (mismo grafo que el artículo): 0 KH1, 1 KH2, 2 KH3 (virtuales), 3 CF1, 4 CF2, 5 CF3 (reales)
  const GOAL = [[0.5, 0.4, 0], [0, -0.3, 0], [-0.5, 0.4, 0], [0.3, 0.3, 0.7], [-0.1, -0.1, 0.9], [-0.2, 0.5, 0.6]];
  const NAMES = ['KH1', 'KH2', 'KH3', 'CF1', 'CF2', 'CF3'];
  const EDGES = [[0, 1], [1, 2], [0, 3], [1, 4], [3, 4], [3, 5], [4, 5]];
  const REL = EDGES.map(([i, j]) => [i, j, V.sub(GOAL[j], GOAL[i])]);
  function swarm(Ti, seed) {
    const R = MA.rng(seed);
    const agents = GOAL.map((g, i) => ({ type: i < 3 ? 'kh' : 'cf', real: i >= 3, name: NAMES[i], p: i < 3 ? [g[0] + (R.u() - 0.5) * 1.4, g[1] + (R.u() - 0.5) * 1.4, 0] : [(R.u() - 0.5) * 1.6, (R.u() - 0.5) * 1.6, 0.4] }));
    return new MA.Swarm({ agents, rel: REL, law: 'consensus', mu: 1.2, Ti, fc: 10, sampling: { mode: 'periodic', f: 10 }, tau: 0.35, vmax: 0.5, noise: 0.002, seed });
  }
  const colorOf = (i) => (i < 3 ? '--s2' : '--s1');

  /* Portada */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -40, el: 24, radius: 1.2, target: [0, 0, 0.35], autoRotate: IP.reducedMotion() ? 0 : 8 });
    let seed = 3, sw = swarm(3, seed);
    IP.animate(cv.parentElement, (dt) => {
      if (sw.t < 12) sw.advance(dt); else sw = swarm(3, ++seed);
      sc.begin();
      for (let k = -4; k <= 4; k++) { sc.line([k * 0.25, -1, 0], [k * 0.25, 1, 0], { color: 'rgba(106,168,236,0.18)', width: 0.8 }); sc.line([-1, k * 0.25, 0], [1, k * 0.25, 0], { color: 'rgba(106,168,236,0.18)', width: 0.8 }); }
      MA.draw(sc, sw, { colorOf: (i) => (i < 3 ? '#f0a35f' : '#6aa8ec'), size: 0.08 });
      sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'gap', label: T('Brecha simulación\n↔ realidad', 'Simulation ↔\nreality gap'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>Los algoritmos de enjambre se validan casi siempre sólo en simulación: faltan robots, espacio y presupuesto para probarlos con muchos agentes reales.</p>', '<p>Swarm algorithms are almost always validated only in simulation: robots, space and budget are lacking to test them with many real agents.</p>') },
      { id: 'twin', label: T('Gemelos digitales\nen Gazebo', 'Digital twins\nin Gazebo'), kind: 'method', x: 520, y: 75, mx: 310, my: 60, href: '#realidad-mixta', text: T('<p>Khepera IV modelados en SDF dentro de una réplica virtual del recinto de Robotic Park.</p>', '<p>Khepera IV modelled in SDF inside a virtual replica of the Robotic Park arena.</p>') },
      { id: 'tr', label: T('Traductor de\nodometría → Pose', 'Odometry →\nPose translator'), kind: 'method', x: 890, y: 75, mx: 110, my: 170, href: '#realidad-mixta', text: T('<p>Un nodo ROS 2 convierte la odometría absoluta de Gazebo al formato de Vicon: transparencia total entre agentes reales y virtuales.</p>', '<p>A ROS 2 node turns Gazebo\'s absolute odometry into the Vicon format: full transparency between real and virtual agents.</p>') },
      { id: 'cons', label: T('Consenso\nP / PI', 'Consensus\nP / PI'), kind: 'theory', x: 520, y: 260, mx: 310, my: 170, href: '#simulador', text: T('<p>Cada agente corrige su objetivo con el promedio de los errores de posición relativa con sus vecinos; el término integral elimina errores persistentes.</p>', '<p>Each agent corrects its target with the average of the relative position errors with its neighbours; the integral term removes persistent errors.</p>') },
      { id: 'het', label: T('Aire + tierra', 'Air + ground'), kind: 'theory', x: 150, y: 260, mx: 310, my: 280, text: T('<p>Dinámica Newton-Euler del cuadricóptero frente a la cinemática diferencial del Khepera: el mismo controlador para agentes muy distintos.</p>', '<p>Quadrotor Newton–Euler dynamics vs Khepera differential kinematics: the same controller for very different agents.</p>') },
      { id: 'res', label: T('PI T_i = 3 s:\nMSE −40,9 %', 'PI T_i = 3 s:\nMSE −40.9%'), kind: 'result', x: 890, y: 260, mx: 110, my: 280, href: '#simulador', text: T('<p>El P es el más rápido (menor IAE/ITAE); el PI con T_i = 3 s, el más preciso (menor MSE) y con ~30 % menos sobreoscilación.</p>', '<p>P is the fastest (lowest IAE/ITAE); PI with T_i = 3 s, the most accurate (lowest MSE) with ~30% less overshoot.</p>') },
      { id: 'fut', label: T('Leyes por tipo\nde agente', 'Per-agent-type\nlaws'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, text: T('<p>Trabajo futuro: leyes adaptadas a cada tipo de robot y evitación de colisiones.</p>', '<p>Future work: laws tailored to each robot type and collision avoidance.</p>') }
    ],
    edges: [{ from: 'gap', to: 'twin', label: T('solución', 'solution') }, { from: 'twin', to: 'tr' }, { from: 'tr', to: 'cons' }, { from: 'het', to: 'cons' }, { from: 'cons', to: 'res' }, { from: 'res', to: 'fut' }, { from: 'gap', to: 'het', bend: 0 }]
  }, { panel: $('#cmapPanel'), initial: 'tr' });

  /* Diagrama de realidad mixta */
  $('#mr').innerHTML = `<svg viewBox="0 0 760 230">
    <rect x="10" y="10" width="300" height="210" rx="14" fill="var(--primary-soft)" stroke="var(--primary)"/><text x="24" y="34">${T('Mundo real · Robotic Park', 'Real world · Robotic Park')}</text>
    <rect x="30" y="56" width="120" height="44" rx="9" fill="var(--surface)" stroke="var(--border)"/><text x="90" y="83" text-anchor="middle">3 × Crazyflie</text>
    <rect x="170" y="56" width="120" height="44" rx="9" fill="var(--surface)" stroke="var(--border)"/><text x="230" y="76" text-anchor="middle">Vicon Tracker</text><text class="s" x="230" y="92" text-anchor="middle">6 ${T('cámaras', 'cameras')} · 100 Hz</text>
    <rect x="450" y="10" width="300" height="210" rx="14" fill="var(--accent-soft)" stroke="var(--accent)"/><text x="464" y="34">${T('Mundo virtual · Gazebo 11', 'Virtual world · Gazebo 11')}</text>
    <rect x="470" y="56" width="120" height="44" rx="9" fill="var(--surface)" stroke="var(--border)"/><text x="530" y="83" text-anchor="middle">3 × Khepera IV</text>
    <rect x="610" y="56" width="120" height="44" rx="9" fill="var(--surface)" stroke="var(--border)"/><text x="670" y="76" text-anchor="middle">${T('Odometría', 'Odometry')}</text><text class="s" x="670" y="92" text-anchor="middle">${T('absoluta', 'absolute')}</text>
    <rect x="300" y="150" width="160" height="56" rx="10" fill="var(--surface)" stroke="var(--primary)" stroke-width="2"/><text x="380" y="174" text-anchor="middle">ROS 2 Foxy</text><text class="s" x="380" y="192" text-anchor="middle">${T('formación por consenso', 'consensus formation')}</text>
    <path d="M230,100 C230,140 280,170 300,175" fill="none" stroke="var(--primary)" stroke-width="2"/><text class="s" x="200" y="140">Pose</text>
    <path d="M670,100 C670,140 600,140 560,150" fill="none" stroke="var(--accent)" stroke-width="2"/><rect x="480" y="136" width="96" height="26" rx="7" fill="var(--surface)" stroke="var(--accent)"/><text class="s" x="528" y="153" text-anchor="middle">${T('traductor → Pose', 'translator → Pose')}</text>
    <path d="M480,155 C470,170 465,176 460,178" fill="none" stroke="var(--accent)" stroke-width="2"/>
    <path d="M300,190 C150,210 90,160 90,100" fill="none" stroke="var(--axis)" stroke-dasharray="5 4"/><path d="M460,190 C600,210 530,140 530,100" fill="none" stroke="var(--axis)" stroke-dasharray="5 4"/>
    <text class="s" x="120" y="205">${T('consignas', 'setpoints')}</text><text class="s" x="590" y="205">${T('consignas', 'setpoints')}</text></svg>`;

  /* Simulador */
  const sc = new IP.Scene3D($('#cv'), { az: -40, el: 24, radius: 1.2, target: [0, 0, 0.35] });
  const pe = new IP.Plot($('#pe'), { height: 240, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  const ctl = IP.controls($('#ctl'), [
    { id: 'case', type: 'select', label: T('Controlador', 'Controller'), value: '3', options: [{ value: '0', label: T('Caso 1 · P', 'Case 1 · P') }, { value: '2', label: T('Caso 2 · PI, T_i = 2 s', 'Case 2 · PI, T_i = 2 s') }, { value: '3', label: T('Caso 3 · PI, T_i = 3 s', 'Case 3 · PI, T_i = 3 s') }] }
  ], () => launch());
  let sw, seed = 6, axes = null;
  function launch(n) { if (n) seed++; sw = swarm(parseFloat(ctl.values.case), seed); axes = { t: [], x: [], y: [], z: [] }; }
  $('#run').addEventListener('click', () => launch(true));
  launch();
  const metricsAll = () => {
    // métricas de los tres controladores con las mismas condiciones iniciales
    return ['0', '2', '3'].map(c => { const s = swarm(parseFloat(c), seed); let mse = 0, n = 0; while (s.t < 20) { s.advance(0.05); REL.forEach(([i, j, r]) => { const w = V.sub(V.sub(s.p[j], s.p[i]), r); if (i < 3 && j < 3) w[2] = 0; mse += V.dot(w, w); n++; }); } return { c, iae: s.iae, itae: s.itae, mse: mse / n }; });
  };
  let cache = null, cacheSeed = -1;
  IP.animate($('#simulador'), (dt) => {
    if (sw.t < 20) {
      sw.advance(Math.min(0.1, dt));
      const e = [0, 0, 0]; REL.forEach(([i, j, r]) => { const w = V.sub(V.sub(sw.p[j], sw.p[i]), r); if (i < 3 && j < 3) w[2] = 0; for (let k = 0; k < 3; k++) e[k] += Math.abs(w[k]); });
      axes.t.push(sw.t); axes.x.push(e[0]); axes.y.push(e[1]); axes.z.push(e[2]);
    }
    sc.begin();
    GOAL.forEach((g, i) => sc.point(g, { r: 3, color: colorOf(i), stroke: '--surface' }));
    MA.draw(sc, sw, { ground: 1.1, labels: true, colorOf, size: 0.08 });
    sc.draw(dt);
    $('#tt').textContent = `t = ${fmt(sw.t, 1)} s`;
    pe.opts.xlim = [0, 20];
    pe.setSeries([{ name: 'X', color: '--s3', x: axes.t, y: axes.x, width: 2 }, { name: 'Y', color: '--s2', x: axes.t, y: axes.y, width: 2 }, { name: 'Z', color: '--s1', x: axes.t, y: axes.z, width: 2 }]);
    if (cacheSeed !== seed) { cache = metricsAll(); cacheSeed = seed; }
    const name = { '0': 'P', '2': 'PI 2 s', '3': 'PI 3 s' }, c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    const best = cache.reduce((a, b) => (b.mse < a.mse ? b : a));
    $('#ro').innerHTML = cache.map(r => c(`${name[r.c]} · IAE / MSE`, `${fmt(r.iae, 1)} / ${fmt(r.mse, 3)}`, r === best ? 'hl' : '')).join('') +
      `<p class="ip-small ip-muted" style="grid-column:1/-1;margin:4px 0 0">${T('Métricas simuladas de los tres controladores con las mismas condiciones iniciales (20 s).', 'Simulated metrics of the three controllers with the same initial conditions (20 s).')}</p>`;
  }).start();

  IP.quiz($('#quizBox'), [
    { q: T('¿Cómo sabe el controlador si un agente es real o virtual?', 'How does the controller know whether an agent is real or virtual?'), options: [T('No lo sabe: ambos publican el mismo mensaje Pose', 'It does not: both publish the same Pose message'), T('Por el color', 'By its colour'), T('Por la frecuencia de muestreo', 'By the sampling frequency')], answer: 0, explain: T('Esa transparencia es la clave de twins-in-the-loop: se pueden añadir robots virtuales sin cambiar el controlador.', 'That transparency is the key to twins-in-the-loop: virtual robots can be added without changing the controller.') },
    { q: T('¿Qué aporta el término integral (PI) frente al P?', 'What does the integral (PI) term add over P?'), options: [T('Una respuesta más rápida', 'A faster response'), T('Menor error cuadrático medio y menos sobreoscilación, a costa de más IAE/ITAE', 'Lower mean squared error and less overshoot, at the cost of more IAE/ITAE'), T('Nada', 'Nothing')], answer: 1, explain: T('Según la Tabla 2, el PI con T_i = 3 s reduce el MSE un 40,9 % frente al P, aunque el P acumula menos IAE.', 'According to Table 2, PI with T_i = 3 s reduces MSE by 40.9% vs P, although P accumulates less IAE.') },
    { q: T('¿Por qué el eje Z es el más lento?', 'Why is the Z axis the slowest?'), options: [T('Porque los Khepera no pueden moverse en Z: toda la corrección vertical la hacen los drones', 'Because the Kheperas cannot move in Z: all the vertical correction is done by the drones'), T('Por la gravedad', 'Because of gravity'), T('Porque Vicon no mide Z', 'Because Vicon does not measure Z')], answer: 0, explain: T('En los enlaces aire–tierra sólo el dron puede corregir la componente vertical del error.', 'In air–ground edges only the drone can correct the vertical component of the error.') }
  ]);
})();
