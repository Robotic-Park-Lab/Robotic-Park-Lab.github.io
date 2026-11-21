/* Página interactiva: Robotic Park, multi-agent platform for teaching control and robotics (IEEE Access 2023) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t, V = MA.v;
  IP.page();

  // Formación de ejemplo con el grafo del artículo: 0 TB01 (líder real), 1–3 KH01–KH03 (virtuales), 4–6 CF01–CF03 (reales)
  const GOAL = [[0, 0, 0], [0.45, 0.4, 0], [0.75, -0.15, 0], [0.35, -0.5, 0], [0.25, 0.25, 0.8], [0.55, -0.3, 0.8], [0.85, 0.2, 0.85]];
  const NAMES = ['TB01', 'KH01', 'KH02', 'KH03', 'CF01', 'CF02', 'CF03'];
  const PAIRS = [[0, 1], [0, 3], [0, 4], [1, 3], [1, 2], [1, 4], [2, 3], [2, 5], [3, 5], [4, 5], [4, 6], [5, 6]];
  const EDGES = PAIRS.map(([i, j]) => [i, j, V.norm(V.sub(GOAL[i], GOAL[j]))]);
  const TMOVE = 12;          // instante del avance del líder en esta simulación (en el artículo, 21 s)
  function swarm(sampling, seed) {
    const R = MA.rng(seed);
    const agents = GOAL.map((g, i) => ({ name: NAMES[i], type: i === 0 ? 'tb' : i < 4 ? 'kh' : 'cf', real: i === 0 || i > 3, p: i < 4 ? [g[0] + (R.u() - 0.5) * 0.8, g[1] + (R.u() - 0.5) * 0.8, 0] : [g[0] + (R.u() - 0.5) * 0.8, g[1] + (R.u() - 0.5) * 0.8, 0.8] }));
    agents[0].p = [0, 0, 0];
    const track = { 0: (t) => [t < TMOVE ? 0 : Math.min(0.75, (t - TMOVE) * 0.15), 0, 0], k: 2 };
    return new MA.Swarm({ agents, edges: EDGES, mu: 1.2, fc: 10, sampling, tau: 0.3, vmax: 0.5, noise: 0.002, seed, track });
  }
  const colorOf = (i) => (i === 0 ? '--ok' : i < 4 ? '--s2' : '--s1');

  /* Portada */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -50, el: 26, radius: 1.3, target: [0.5, 0, 0.35], autoRotate: IP.reducedMotion() ? 0 : 7 });
    let seed = 2, sw = swarm({ mode: 'event', delta: 0.01, fcheck: 50 }, seed);
    IP.animate(cv.parentElement, (dt) => {
      if (sw.t < 20) sw.advance(dt); else sw = swarm({ mode: 'event', delta: 0.01, fcheck: 50 }, ++seed);
      sc.begin();
      for (let k = -2; k <= 6; k++) { sc.line([k * 0.25 - 0.25, -1, 0], [k * 0.25 - 0.25, 1, 0], { color: 'rgba(200,230,215,0.12)', width: 0.8 }); }
      MA.draw(sc, sw, { colorOf: (i) => (i === 0 ? '#4fb98a' : i < 4 ? '#f0a35f' : '#6aa8ec'), size: 0.08 }); sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'need', label: T('Validar MRS\ncon datos reales', 'Validate MRS\nwith real data'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>Muchos algoritmos multi-robot sólo se prueban en simulación, y las plataformas existentes son homogéneas y poco flexibles.</p>', '<p>Many multi-robot algorithms are only tested in simulation, and existing platforms are homogeneous and inflexible.</p>') },
      { id: 'hw', label: T('Robots\nheterogéneos', 'Heterogeneous\nrobots'), kind: 'method', x: 520, y: 75, mx: 310, my: 60, href: '#plataforma', text: T('<p>Crazyflie 2.1 y DJI Tello (aéreos), Khepera IV y Turtlebot3 (terrestres diferenciales).</p>', '<p>Crazyflie 2.1 and DJI Tello (aerial), Khepera IV and Turtlebot3 (differential ground robots).</p>') },
      { id: 'pos', label: T('Posicionamiento\nVicon · Lighthouse · UWB', 'Positioning\nVicon · Lighthouse · UWB'), kind: 'method', x: 890, y: 75, mx: 110, my: 170, href: '#plataforma', text: T('<p>Captura de movimiento Vicon, Lighthouse (láser) y Loco Positioning (UWB), además de la odometría de cada robot.</p>', '<p>Vicon motion capture, Lighthouse (laser) and Loco Positioning (UWB), plus each robot\'s odometry.</p>') },
      { id: 'dt', label: T('Gemelos digitales\nGazebo · Webots', 'Digital twins\nGazebo · Webots'), kind: 'method', x: 150, y: 260, mx: 310, my: 170, href: '#plataforma', text: T('<p>Réplicas del recinto y de los robots: experiencias virtuales o híbridas en realidad mixta.</p>', '<p>Replicas of the arena and robots: virtual or hybrid mixed-reality experiments.</p>') },
      { id: 'ros', label: T('ROS 2 con\nnamespaces', 'ROS 2 with\nnamespaces'), kind: 'theory', x: 520, y: 260, mx: 110, my: 280, href: '#capas', text: T('<p>Cada agente vive en su <code>/agentXX</code>: el mismo código sirve para robots reales y virtuales y para control centralizado, distribuido o híbrido.</p>', '<p>Each agent lives in its own <code>/agentXX</code>: the same code works for real and virtual robots and for centralised, distributed or hybrid control.</p>') },
      { id: 'exp', label: T('Formación por\neventos (1 cm)', 'Event-based\nformation (1 cm)'), kind: 'result', x: 890, y: 260, mx: 310, my: 280, href: '#experiencia', text: T('<p>7 agentes, 4 reales y 3 virtuales: −89 % de tráfico y ~5 % menos error que a 50 Hz.</p>', '<p>7 agents, 4 real and 3 virtual: −89% traffic and ~5% less error than at 50 Hz.</p>') },
      { id: 'teach', label: T('Docencia y\ninvestigación', 'Teaching and\nresearch'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, text: T('<p>Una misma plataforma para prácticas de control y robótica y para investigar en sistemas multi-agente.</p>', '<p>One platform for control and robotics labs and for multi-agent research.</p>') }
    ],
    edges: [{ from: 'need', to: 'hw' }, { from: 'hw', to: 'pos' }, { from: 'need', to: 'dt', bend: 0 }, { from: 'pos', to: 'ros' }, { from: 'dt', to: 'ros' }, { from: 'ros', to: 'exp' }, { from: 'exp', to: 'teach' }]
  }, { panel: $('#cmapPanel'), initial: 'ros' });

  /* Explorador de la plataforma */
  const ITEMS = {
    robots: [
      { n: 'Crazyflie 2.1', s: T('Micro-cuadricóptero · 27 g', 'Micro quadrotor · 27 g'), d: T('92 × 92 × 29 mm, STM32F405, hasta 15 por antena Crazyradio PA. Cubiertas Multi-ranger, Flow v2 y AI-deck (GAP8). Control de posición a 100 Hz y de actitud a 500 Hz.', '92 × 92 × 29 mm, STM32F405, up to 15 per Crazyradio PA. Multi-ranger, Flow v2 and AI-deck (GAP8) decks. Position control at 100 Hz and attitude at 500 Hz.') },
      { n: 'DJI Tello', s: T('Cuadricóptero · 80 g', 'Quadrotor · 80 g'), d: T('98 × 92,5 × 41 mm, cámara integrada, control por Wi-Fi.', '98 × 92.5 × 41 mm, built-in camera, Wi-Fi control.') },
      { n: 'Khepera IV', s: T('Diferencial · 540 g', 'Differential · 540 g'), d: T('Carga de hasta 2 kg, ARM Cortex con Linux Yocto, cámara 752×480 a 30 fps, sensores IR (25 cm) y ultrasonidos (25 cm–2 m).', 'Payload up to 2 kg, ARM Cortex with Yocto Linux, 752×480 camera at 30 fps, IR (25 cm) and ultrasonic (25 cm–2 m) sensors.') },
      { n: 'Turtlebot3 Burger', s: T('Diferencial · 1 kg', 'Differential · 1 kg'), d: T('138 × 178 × 192 mm, carga de hasta 15 kg, Raspberry Pi 4 y LiDAR LDS.', '138 × 178 × 192 mm, payload up to 15 kg, Raspberry Pi 4 and LDS LiDAR.') }
    ],
    pos: [
      { n: 'Vicon MoCap', s: T('6 cámaras Vero 2,2 MP', '6 Vero 2.2 MP cameras'), d: T('Precisión submilimétrica a 100 Hz (máx. 250 Hz) con Tracker 3.9.', 'Sub-millimetre accuracy at 100 Hz (max. 250 Hz) with Tracker 3.9.') },
      { n: 'Lighthouse', s: T('Láser SteamVR', 'SteamVR laser'), d: T('Posición calculada a bordo a 50 Hz, alcance de 6 m.', 'Position computed on board at 50 Hz, 6 m range.') },
      { n: 'Loco Positioning', s: 'UWB', d: T('Ultra-banda ancha con 4–8 anclas y hasta 30 m de alcance.', 'Ultra-wideband with 4–8 anchors and up to 30 m range.') },
      { n: 'Gazebo 11 · Webots 2023a', s: T('Gemelos digitales', 'Digital twins'), d: T('Réplicas virtuales del recinto y de los robots, conectadas a la misma red ROS 2.', 'Virtual replicas of the arena and the robots, connected to the same ROS 2 network.') }
    ]
  };
  function cards(el, list) {
    el.innerHTML = list.map((x, i) => `<div class="rcard" tabindex="0" data-i="${i}"><h4>${x.n}</h4><p>${x.s}</p></div>`).join('');
    IP.$$('.rcard', el).forEach(c => c.addEventListener('click', () => { IP.$$('.rcard').forEach(o => o.classList.remove('on')); c.classList.add('on'); const x = list[+c.dataset.i]; $('#detail').innerHTML = `<span class="ip-pill">${x.s}</span><h3 style="margin-top:8px">${x.n}</h3><p>${x.d}</p>`; }));
  }
  cards($('#robots'), ITEMS.robots); cards($('#pos'), ITEMS.pos);
  $('#robots .rcard').click();

  /* Experiencia */
  const sc = new IP.Scene3D($('#cv'), { az: -50, el: 26, radius: 1.3, target: [0.5, 0, 0.35] });
  const pe = new IP.Plot($('#pe'), { height: 240, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  let mode = 'event';
  IP.seg($('#modeSeg'), [{ value: 'periodic', label: T('Periódico 50 Hz', 'Periodic 50 Hz') }, { value: 'event', label: T('Eventos 1 cm', 'Events 1 cm') }], mode, (v) => { mode = v; launch(); });
  let sw, ref, seed = 4;
  const samp = () => (mode === 'periodic' ? { mode: 'periodic', f: 50 } : { mode: 'event', delta: 0.01, fcheck: 50 });
  function launch(n) { if (n) seed++; sw = swarm(samp(), seed); ref = swarm({ mode: 'periodic', f: 50 }, seed); ref.advance(22); }
  $('#run').addEventListener('click', () => launch(true));
  launch();
  IP.animate($('#experiencia'), (dt) => {
    if (sw.t < 22) sw.advance(Math.min(0.1, dt));
    sc.begin();
    sc.line([0, 0, 0.002], [0.75, 0, 0.002], { color: '--ok', width: 3, dash: [6, 4], alpha: 0.6 });
    MA.draw(sc, sw, { ground: 1.3, labels: true, colorOf, size: 0.08 }); sc.draw(dt);
    $('#tt').textContent = `t = ${fmt(sw.t, 1)} s`;
    pe.opts.xlim = [0, 22];
    pe.overlays = { vlines: [{ x: TMOVE, color: '--ok', label: T('avance del líder', 'leader moves') }] };
    pe.setSeries(sw.hist.eAgent.map((e, i) => ({ name: NAMES[i], color: ['--ok', '--s2', '--s2', '--s2', '--s1', '--s1', '--s1'][i], x: sw.hist.t, y: e, width: 1.6, dash: i > 0 && i < 4 ? [4, 3] : [] })));
    const hz = (type) => { const idx = sw.agents.map((a, i) => i).filter(i => (type === 'ground' ? sw.agents[i].type !== 'cf' : sw.agents[i].type === 'cf')); return idx.reduce((s, i) => s + sw.msgs[i], 0) / idx.length / Math.max(sw.t, 1e-6); };
    const all = sw.msgs.reduce((a, b) => a + b, 0) / 7 / Math.max(sw.t, 1e-6);
    const c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    $('#ro').innerHTML = c(T('Frecuencia media', 'Mean rate'), fmt(all, 2) + ' Hz', 'hl') + c(T('Reducción vs 50 Hz', 'Reduction vs 50 Hz'), fmt(100 * (1 - all / 50), 0) + ' %', 'hl') +
      c(T('Terrestres', 'Ground'), fmt(hz('ground'), 2) + ' Hz') + c(T('Drones', 'Drones'), fmt(hz('air'), 2) + ' Hz') +
      c('IAE', fmt(sw.iae, 2)) + c(T('IAE a 50 Hz', 'IAE at 50 Hz'), sw.t > 21.9 ? fmt(ref.iae, 2) : '…');
  }).start();

  IP.quiz($('#quizBox'), [
    { q: T('¿Qué permite que el mismo código controle un robot real y su gemelo?', 'What lets the same code control a real robot and its twin?'), options: [T('Los namespaces de ROS 2: ambos publican y reciben los mismos tópicos', 'ROS 2 namespaces: both publish and subscribe to the same topics'), T('Que el gemelo use Vicon', 'That the twin uses Vicon'), T('Nada, hay que reescribirlo', 'Nothing, it must be rewritten')], answer: 0, explain: T('Cada agente expone la misma interfaz en /agentXX, venga de un robot físico o de Gazebo/Webots.', 'Each agent exposes the same interface in /agentXX, whether it comes from a physical robot or from Gazebo/Webots.') },
    { q: T('¿Por qué los robots terrestres reducen más sus mensajes con eventos (−96 %) que los drones (−81 %)?', 'Why do ground robots reduce their messages more with events (−96%) than drones (−81%)?'), options: [T('Porque, una vez formados, apenas se mueven; los drones oscilan en vuelo estacionario', 'Because once in formation they barely move; drones oscillate while hovering'), T('Porque tienen menos batería', 'Because they have less battery'), T('Porque usan UWB', 'Because they use UWB')], answer: 0, explain: T('Un dron en vuelo estacionario tiene un pequeño rizado que a veces supera 1 cm y dispara eventos.', 'A hovering drone has a small ripple that sometimes exceeds 1 cm and triggers events.') },
    { q: T('¿En qué capa se ejecuta el control de formación?', 'In which layer does formation control run?'), options: [T('Planificación (< 10 Hz)', 'Path planning (< 10 Hz)'), T('Coordinación (10–100 Hz)', 'Coordination (10–100 Hz)'), T('Control individual (100–500 Hz)', 'Individual control (100–500 Hz)')], answer: 1, explain: T('La coordinación calcula las consignas de cada robot a partir de las posiciones de sus vecinos; el control individual las sigue.', 'Coordination computes each robot\'s setpoints from its neighbours\' positions; individual control tracks them.') }
  ]);
})();
