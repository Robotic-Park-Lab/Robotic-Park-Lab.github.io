/* Página interactiva: Sistemas ciberfísicos multi-agente en realidad mixta (II Simposio CEA, 2023) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t;
  IP.page();

  // Figura 6 del artículo: Caso B normalizado respecto al Caso A
  const PAPER = { f: 0.02, IAE: 0.85, ITAE: 0.85, RMSE: 0.57, cf: 0.15 };
  // Formación de ejemplo: CF01 sobre el centro de un cuadrado de Khepera
  const L = 0.8, H = 0.8, G = [[0, 0, H], [L / 2, L / 2, 0], [-L / 2, L / 2, 0], [-L / 2, -L / 2, 0], [L / 2, -L / 2, 0]];
  const NAMES = ['CF01', 'KH01', 'KH02', 'KH03', 'KH04'];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const E = [[1, 2], [2, 3], [3, 4], [4, 1], [1, 3], [0, 1], [0, 2], [0, 3], [0, 4]].map(([i, j]) => [i, j, dist(G[i], G[j])]);
  function swarm(mode, seed, virt) {
    const R = MA.rng(seed);
    const agents = G.map((g, i) => ({
      type: i ? 'kh' : 'cf', name: NAMES[i], real: !virt.has(i), every: i ? 1 : 2, noise: i ? 0.0005 : 0.001, wobble: i ? 0 : 0.15,
      p: i ? [g[0] + (R.u() - 0.5) * 0.8, g[1] + (R.u() - 0.5) * 0.8, 0] : [(R.u() - 0.5) * 0.6, (R.u() - 0.5) * 0.6, 0.5]
    }));
    return new MA.Swarm({ agents, edges: E, mu: 1, fc: 20, sampling: mode === 'A' ? { mode: 'periodic', f: 100 } : { mode: 'event', delta: 0.01, fcheck: 100 }, tau: 0.3, vmax: 0.4, seed });
  }
  const VIRT = new Set([3, 4]);   // KH03 y KH04 son virtuales (como en el artículo)

  /* Portada */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -40, el: 24, radius: 1.05, target: [0, 0, 0.35], autoRotate: IP.reducedMotion() ? 0 : 8 });
    let seed = 2, sw = swarm('B', seed, VIRT);
    IP.animate(cv.parentElement, (dt) => {
      if (sw.t < 14) sw.advance(dt); else sw = swarm('B', ++seed, VIRT);
      sc.begin();
      for (let k = -4; k <= 4; k++) { sc.line([k * 0.25, -1, 0], [k * 0.25, 1, 0], { color: 'rgba(106,168,236,0.18)', width: 0.8 }); sc.line([-1, k * 0.25, 0], [1, k * 0.25, 0], { color: 'rgba(106,168,236,0.18)', width: 0.8 }); }
      MA.draw(sc, sw, { colorOf: (i) => (i ? (VIRT.has(i) ? '#f0a35f' : '#7fd1b9') : '#6aa8ec'), size: 0.08 });
      sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 720],
    nodes: [
      { id: 'cps', label: T('Sistemas\nciberfísicos', 'Cyber-physical\nsystems'), kind: 'problem', x: 150, y: 80, mx: 110, my: 60, text: T('<p>Integran componentes físicos y digitales que interactúan en tiempo real. En robótica, la arquitectura de comunicación entre robots y con el entorno es crítica.</p>', '<p>They integrate physical and digital components interacting in real time. In robotics, the communication architecture between robots and with the environment is critical.</p>') },
      { id: 'twin', label: T('Gemelo, sombra\ny modelo digital', 'Digital twin,\nshadow and model'), kind: 'theory', x: 520, y: 80, mx: 310, my: 60, href: '#gemelos', text: T('<p>La diferencia está en el flujo de datos: ninguno (modelo), del físico al digital (sombra) o en los dos sentidos (gemelo).</p>', '<p>The difference is the data flow: none (model), from physical to digital (shadow) or both ways (twin).</p>') },
      { id: 'mr', label: T('Realidad mixta', 'Mixed reality'), kind: 'theory', x: 890, y: 80, mx: 110, my: 180, href: '#gemelos', text: T('<p>Combina realidad virtual y aumentada con interacción completamente bidireccional: lo que hacen los robots virtuales afecta a los reales y viceversa.</p>', '<p>Combines virtual and augmented reality with fully bidirectional interaction: what virtual robots do affects real ones and vice versa.</p>') },
      { id: 'rp', label: T('Robotic Park\nROS 2 Humble', 'Robotic Park\nROS 2 Humble'), kind: 'method', x: 330, y: 270, mx: 310, my: 180, href: '#robots', text: T('<p>Cinco tipos de robots (Crazyflie, Tello, Khepera IV, Turtlebot3, Limo), cada uno en su <i>namespace</i>. Webots ejecuta los robots virtuales y los gemelos.</p>', '<p>Five robot types (Crazyflie, Tello, Khepera IV, Turtlebot3, Limo), each in its own <i>namespace</i>. Webots runs the virtual robots and twins.</p>') },
      { id: 'ev', label: T('Eventos con\numbral de 1 cm', 'Events with a\n1 cm threshold'), kind: 'method', x: 710, y: 270, mx: 110, my: 300, href: '#experimento', text: T('<p>Cada agente publica su posición sólo cuando se ha movido más de 1 cm (send-on-delta), frente al muestreo continuo a 100 Hz (Khepera) y 50 Hz (dron).</p>', '<p>Each agent publishes its position only once it has moved more than 1 cm (send-on-delta), versus continuous sampling at 100 Hz (Khepera) and 50 Hz (drone).</p>') },
      { id: 'res', label: T('−98 % mensajes\n−43 % RMSE', '−98% messages\n−43% RMSE'), kind: 'result', x: 520, y: 440, mx: 310, my: 300, href: '#resultados', text: T('<p>Reducción global del 98 % en las muestras (85 % en el dron) y mejora del 15 % en IAE e ITAE y del 43 % en RMSE, atribuida al efecto de filtrado.</p>', '<p>98% overall reduction in samples (85% for the drone) and a 15% improvement in IAE and ITAE and 43% in RMSE, attributed to the filtering effect.</p>') },
      { id: 'same', label: T('Real o virtual:\nda igual', 'Real or virtual:\nno difference'), kind: 'result', x: 150, y: 440, mx: 210, my: 420, href: '#experimento', text: T('<p>Con la misma nomenclatura en ROS 2, el comportamiento del sistema es indiferente a la naturaleza real o virtual de los robots.</p>', '<p>With the same ROS 2 naming, the system behaves the same whether the robots are real or virtual.</p>') }
    ],
    edges: [{ from: 'cps', to: 'twin' }, { from: 'twin', to: 'mr' }, { from: 'cps', to: 'rp' }, { from: 'mr', to: 'rp', bend: 0 }, { from: 'rp', to: 'ev' }, { from: 'ev', to: 'res' }, { from: 'rp', to: 'same' }]
  }, { panel: $('#cmapPanel'), initial: 'mr' });

  /* Modelo / sombra / gemelo / realidad mixta */
  (function twins() {
    const K = {
      model: { l: T('Modelo digital', 'Digital model'), fwd: false, back: false, t: T('<h3>Modelo digital</h3><p>Una versión digital del robot <b>sin comunicación en tiempo real</b>. Una vez creado, cualquier cambio en el robot físico no le afecta. Es el clásico modelo de simulación.</p>', '<h3>Digital model</h3><p>A digital version of the robot <b>with no real-time communication</b>. Once created, any change in the physical robot does not affect it. It is the classic simulation model.</p>') },
      shadow: { l: T('Sombra digital', 'Digital shadow'), fwd: true, back: false, t: T('<h3>Sombra digital</h3><p>Comunicación <b>unidireccional</b>, del sistema físico al digital: la réplica virtual se actualiza con los datos del robot real, pero no actúa sobre él. Sirve para monitorizar, estimar parámetros o detectar fallos.</p>', '<h3>Digital shadow</h3><p><b>One-way</b> communication, from the physical to the digital system: the virtual replica is updated with the real robot\'s data but does not act on it. Useful to monitor, estimate parameters or detect faults.</p>') },
      twin: { l: T('Gemelo digital', 'Digital twin'), fwd: true, back: true, t: T('<h3>Gemelo digital</h3><p>Comunicación <b>bidireccional</b> en tiempo real. En Robotic Park, el gemelo de un robot real le da realimentación sensorial de los robots que sólo existen en simulación; así se pueden evitar colisiones entre robots reales y virtuales como si compartieran el mismo espacio. También sirve para control predictivo o detección de fallos.</p>', '<h3>Digital twin</h3><p>Real-time <b>two-way</b> communication. In Robotic Park, a real robot\'s twin gives it sensory feedback about robots that only exist in simulation, so collisions between real and virtual robots can be avoided as if they shared the same space. It also serves for predictive control or fault detection.</p>') },
      mr: { l: T('Realidad mixta', 'Mixed reality'), fwd: true, back: true, mr: true, t: T('<h3>Realidad mixta</h3><p>Combina la realidad virtual (representa el mundo físico) y la aumentada (superpone información digital sobre él). La interacción es completamente bidireccional: robots reales y virtuales forman <b>un único sistema multi-agente</b>, que puede escalar a más agentes de los que caben en el laboratorio.</p>', '<h3>Mixed reality</h3><p>Combines virtual reality (representing the physical world) and augmented reality (overlaying digital information on it). Interaction is fully bidirectional: real and virtual robots form <b>a single multi-agent system</b>, which can scale beyond the robots that fit in the lab.</p>') }
    };
    let cur = 'twin';
    function draw() {
      const k = K[cur];
      const arrow = (on, y, rev, label) => on ? `<path class="flow ${rev ? 'rev' : ''}" d="M250,${y} L470,${y}" stroke="${rev ? 'var(--accent)' : 'var(--primary)'}" stroke-width="3" fill="none"/><text class="s" x="360" y="${y - 8}" text-anchor="middle">${label}</text>` : `<path d="M250,${y} L470,${y}" stroke="var(--border)" stroke-width="2" stroke-dasharray="3 6" fill="none"/><text class="s" x="360" y="${y - 8}" text-anchor="middle">${T('sin datos en tiempo real', 'no real-time data')}</text>`;
      $('#twin').innerHTML = `<svg viewBox="0 0 720 230">
        <rect x="20" y="30" width="230" height="170" rx="16" fill="var(--primary-soft)" stroke="var(--primary)"/><text x="135" y="58" text-anchor="middle">${T('Mundo físico', 'Physical world')}</text>
        <circle cx="105" cy="130" r="34" fill="var(--surface)" stroke="var(--s2)" stroke-width="2.5"/><line x1="105" y1="130" x2="139" y2="130" stroke="var(--s2)" stroke-width="3"/><text class="s" x="105" y="185" text-anchor="middle">KH01</text>
        ${k.mr ? `<g><line x1="170" y1="112" x2="210" y2="112" stroke="var(--s1)" stroke-width="2.5"/><line x1="190" y1="92" x2="190" y2="132" stroke="var(--s1)" stroke-width="2.5"/><circle cx="190" cy="112" r="5" fill="var(--s1)"/><text class="s" x="190" y="160" text-anchor="middle">CF01</text></g>` : ''}
        <rect x="470" y="30" width="230" height="170" rx="16" fill="var(--accent-soft)" stroke="var(--accent)"/><text x="585" y="58" text-anchor="middle">${T('Mundo digital · Webots', 'Digital world · Webots')}</text>
        <circle cx="555" cy="130" r="34" fill="none" stroke="var(--s2)" stroke-width="2" stroke-dasharray="5 4"/><line x1="555" y1="130" x2="589" y2="130" stroke="var(--s2)" stroke-width="2" stroke-dasharray="4 3"/><text class="s" x="555" y="185" text-anchor="middle">${k.mr ? 'KH03' : T('réplica de KH01', 'KH01 replica')}</text>
        ${k.mr ? `<circle cx="640" cy="130" r="22" fill="none" stroke="var(--s2)" stroke-width="2" stroke-dasharray="5 4"/><text class="s" x="640" y="170" text-anchor="middle">KH04</text>` : ''}
        ${arrow(k.fwd, 100, false, T('posición, sensores', 'position, sensors'))}
        ${arrow(k.back, 150, true, k.mr ? T('vecinos virtuales, consignas', 'virtual neighbours, setpoints') : T('percepción, consignas', 'perception, setpoints'))}
      </svg>`;
      $('#twinTxt').innerHTML = k.t;
    }
    IP.seg($('#twinSeg'), Object.keys(K).map(v => ({ value: v, label: K[v].l })), cur, (v) => { cur = v; draw(); });
    draw();
  })();

  /* Robots */
  (function robots() {
    const R = [
      { id: 'cf', n: 'Crazyflie 2.1', m: 'Bitcraze', k: T('aéreo · código abierto', 'aerial · open source'), c: '--s1', t: T('<p>Nanocuadricóptero de código abierto. Se comunica mediante la antena Crazyradio y su <i>driver</i> de ROS 2 está basado en la librería <code>cflib</code>. Admite cubiertas para varios sistemas de posicionamiento: MoCap (Vicon), Lighthouse y LPS.</p>', '<p>Open-source nano-quadrotor. It communicates through the Crazyradio dongle and its ROS 2 <i>driver</i> is built on the <code>cflib</code> library. It accepts covers for several positioning systems: MoCap (Vicon), Lighthouse and LPS.</p>') },
      { id: 'tello', n: 'DJI Tello', m: 'DJI', k: T('aéreo · comercial', 'aerial · commercial'), c: '--s5', t: T('<p>Dron comercial con más autonomía y cámara frontal. Usa un <i>driver</i> no oficial que permite controlar tanto el robot real como su modelo de simulación en Gazebo.</p>', '<p>Commercial drone with longer flight time and a front camera. It uses an unofficial <i>driver</i> that controls both the real robot and its Gazebo simulation model.</p>') },
      { id: 'kh', n: 'Khepera IV', m: 'K-Team', k: T('diferencial · comercial', 'differential · commercial'), c: '--s3', t: T('<p>Robot diferencial con sensores de gran precisión. <b>No tiene <i>driver</i> de ROS 2</b>: se integra mediante un sistema cliente-servidor o con micro-ROS en un ESP32 conectado al robot por I2C o puerto serie.</p>', '<p>Differential robot with very accurate sensors. <b>It has no ROS 2 <i>driver</i></b>: it joins through a client–server scheme or with micro-ROS on an ESP32 linked to the robot over I2C or serial.</p>') },
      { id: 'tb', n: 'Turtlebot3 Burger', m: 'Robotis', k: T('diferencial · código abierto', 'differential · open source'), c: '--s2', t: T('<p>Su <i>driver</i> oficial se ejecuta en la Raspberry Pi 4 que lleva incorporada, así que opera de forma completamente autónoma en la red.</p>', '<p>Its official <i>driver</i> runs on its on-board Raspberry Pi 4, so it works fully autonomously on the network.</p>') },
      { id: 'limo', n: 'Limo', m: 'Agilex', k: T('multimodal', 'multimodal'), c: '--s4', t: T('<p>La última incorporación. Su locomoción se configura como omnidireccional, diferencial de cuatro ruedas, diferencial de cadenas o tipo Ackermann. <i>Driver</i> oficial en su Jetson Nano.</p>', '<p>The latest addition. Its locomotion can be set up as omnidirectional, four-wheel differential, tracked differential or Ackermann. Official <i>driver</i> on its Jetson Nano.</p>') }
    ];
    $('#robotList').innerHTML = R.map(r => `<button class="robot" type="button" data-id="${r.id}"><b><span class="dot" style="background:var(${r.c})"></span>${r.n}</b><i>${r.m} · ${r.k}</i></button>`).join('');
    const show = (id) => { const r = R.find(x => x.id === id); $('#robotInfo').innerHTML = `<h3>${r.n}</h3>${r.t}<p class="ip-small ip-muted">${T('Micro-ROS permite integrar microcontroladores como ESP32 o Raspberry Pi Pico igual que un PC.', 'Micro-ROS lets microcontrollers such as the ESP32 or Raspberry Pi Pico join just like a PC.')}</p>`; IP.$$('.robot').forEach(b => b.classList.toggle('on', b.dataset.id === id)); };
    IP.$$('.robot').forEach(b => b.addEventListener('click', () => show(b.dataset.id)));
    show('kh');
  })();

  /* Experimento: adivinar y simular */
  const sc = new IP.Scene3D($('#cv'), { az: -40, el: 26, radius: 1.1, target: [0, 0, 0.3] });
  const pe = new IP.Plot($('#pe'), { height: 230, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', yunit: 'm' });
  let mode = 'B', seed = 5, sw, guess = new Set(), revealed = false;
  const other = {};
  IP.seg($('#caseSeg'), [{ value: 'A', label: T('Caso A · continuo', 'Case A · continuous') }, { value: 'B', label: T('Caso B · eventos 1 cm', 'Case B · 1 cm events') }], mode, (v) => { mode = v; launch(); });
  function launch(next) {
    if (next) seed++;
    sw = swarm(mode, seed, VIRT);
    ['A', 'B'].forEach(m => { if (m !== mode) { const s = swarm(m, seed, VIRT); s.advance(40); other[m] = s; } });
  }
  $('#run').addEventListener('click', () => launch(true));
  launch();
  function guessUI() {
    const ok = revealed && [...guess].every(i => VIRT.has(i)) && guess.size === 2;
    $('#guess').innerHTML = `<span class="ip-small">${T('Tus virtuales:', 'Your virtual picks:')} <b>${guess.size ? [...guess].map(i => NAMES[i]).join(', ') : '—'}</b></span>` +
      `<button class="ip-btn small" id="reveal" type="button" ${guess.size === 2 && !revealed ? '' : 'disabled'}>${T('Revelar', 'Reveal')}</button>` +
      (revealed ? `<span class="ip-pill ${ok ? 'accent' : 'danger'}">${ok ? T('¡Acertaste!', 'Correct!') : T('Eran KH03 y KH04', 'They were KH03 and KH04')}</span><button class="ip-btn small ghost" id="again" type="button">${T('Otra vez', 'Again')}</button>` : '') +
      `<p class="ip-small ip-muted" style="margin:6px 0 0;flex-basis:100%">${revealed ? T('Los controladores tampoco pueden saberlo: reales y virtuales publican el mismo tipo de mensaje con la misma nomenclatura.', 'The controllers cannot tell either: real and virtual robots publish the same message type with the same naming.') : T('Marca dos Khepera pulsando sobre ellos en la escena.', 'Mark two Kheperas by clicking on them in the scene.')}</p>`;
    const r = $('#reveal'); if (r) r.addEventListener('click', () => { revealed = true; guessUI(); });
    const a = $('#again'); if (a) a.addEventListener('click', () => { revealed = false; guess.clear(); launch(true); guessUI(); });
  }
  guessUI();
  $('#cv').addEventListener('click', (ev) => {
    if (revealed) return;
    const i = sc.pick(ev.clientX, ev.clientY, sw.p, 26);
    if (i < 1) return;
    if (guess.has(i)) guess.delete(i); else if (guess.size < 2) guess.add(i);
    guessUI();
  });
  const colorOf = (i) => (i === 0 ? '--s1' : revealed && VIRT.has(i) ? '--s2' : guess.has(i) ? '--s4' : '--s3');
  IP.animate($('#experimento'), (dt) => {
    if (sw.t < 40) sw.advance(Math.min(0.1, dt * 1.5));
    sc.begin();
    MA.draw(sc, { ...sw, agents: sw.agents.map((a, i) => ({ ...a, real: !(revealed && VIRT.has(i)) })), edges: sw.edges, rel: sw.rel, p: sw.p, v: sw.v, trails: sw.trails }, { ground: 0.9, labels: true, colorOf, size: 0.08 });
    sc.draw(dt);
    $('#tt').textContent = `t = ${fmt(sw.t, 1)} s`;
    const h = sw.hist, o = other[mode === 'A' ? 'B' : 'A'], cut = (s) => { const n = s.hist.t.findIndex(t => t > sw.t); return n < 0 ? s.hist.t.length : n; }, nn = cut(o);
    pe.opts.xlim = [0, 40];
    pe.setSeries([
      { name: mode === 'A' ? T('Caso A (este)', 'Case A (this)') : T('Caso B (este)', 'Case B (this)'), color: '--s1', x: h.t, y: h.e, width: 2 },
      { name: mode === 'A' ? T('Caso B', 'Case B') : T('Caso A', 'Case A'), color: '--muted', x: o.hist.t.slice(0, nn), y: o.hist.e.slice(0, nn), width: 1.4, dash: [5, 4] }
    ]);
    const A = mode === 'A' ? sw : other.A, B = mode === 'B' ? sw : other.B, tot = (s) => s.msgs.reduce((a, b) => a + b, 0);
    const c = (a, b, cl = '') => `<div class="ip-readout ${cl}"><span>${a}</span><b>${b}</b></div>`;
    $('#ro').innerHTML = c(T('Mensajes en este caso', 'Messages in this case'), tot(sw)) + c(T('Frecuencia media', 'Mean frequency'), `${fmt(tot(sw) / Math.max(sw.t, 0.1) / 5, 1)} Hz`) +
      (sw.t > 39 ? c(T('Reducción total B frente a A', 'Total reduction B vs A'), `${fmt(100 * (1 - tot(B) / tot(A)), 1)} %`, 'hl') + c(T('Reducción en el dron', 'Drone reduction'), `${fmt(100 * (1 - B.msgs[0] / A.msgs[0]), 1)} %`) : c(T('Reducción', 'Reduction'), T('al terminar', 'when done')) + c(T('Reales / virtuales', 'Real / virtual'), '3 / 2'));
  }).start();

  /* Resultados */
  (function results() {
    const A = swarm('A', 5, VIRT), B = swarm('B', 5, VIRT); A.advance(40); B.advance(40);
    const tot = (s) => s.msgs.reduce((a, b) => a + b, 0), f = tot(B) / tot(A), cf = B.msgs[0] / A.msgs[0];
    ['#simF', '#simFen'].forEach(id => { $(id).textContent = `−${fmt(100 * (1 - f), 0)} %`; });
    ['#simCF', '#simCFen'].forEach(id => { $(id).textContent = `−${fmt(100 * (1 - cf), 0)} %`; });
    const rows = [['f', PAPER.f, f], ['IAE', PAPER.IAE], ['ITAE', PAPER.ITAE], ['RMSE', PAPER.RMSE]];
    $('#bars').innerHTML = '<div class="lbars">' + rows.map(([n, v, s]) => `<div class="lbar"><span>${n}</span><div class="tr"><i style="width:${Math.max(1.5, 100 * v)}%"></i></div><span>${fmt(v, 2)}</span></div>` + (s !== undefined ? `<div class="lbar"><span class="ip-muted">${T('sim.', 'sim.')}</span><div class="tr"><i class="r" style="width:${Math.max(1.5, 100 * s)}%"></i></div><span>${fmt(s, 3)}</span></div>` : '')).join('') + '</div>' +
      `<p class="ip-small ip-muted" style="margin-top:8px">${T('1 = igual que el muestreo continuo. La barra azul es la frecuencia simulada en esta página.', '1 = same as continuous sampling. The blue bar is the frequency simulated on this page.')}</p>`;
  })();

  IP.quiz($('#quizBox'), [
    { q: T('¿Qué distingue una sombra digital de un gemelo digital?', 'What distinguishes a digital shadow from a digital twin?'), options: [T('La sombra sólo recibe datos del sistema físico; el gemelo intercambia datos en los dos sentidos', 'The shadow only receives data from the physical system; the twin exchanges data both ways'), T('La sombra es en 2D', 'The shadow is 2D'), T('No hay diferencia', 'There is no difference')], answer: 0, explain: T('Modelo: sin datos en tiempo real. Sombra: físico → digital. Gemelo: bidireccional.', 'Model: no real-time data. Shadow: physical → digital. Twin: two-way.') },
    { q: T('¿Por qué los controladores no distinguen los Khepera reales de los virtuales?', 'Why can\'t the controllers tell real from virtual Kheperas?'), options: [T('Porque usan la misma nomenclatura y tipos de mensaje en ROS 2', 'Because they use the same naming and message types in ROS 2'), T('Porque los virtuales se mueven más despacio', 'Because the virtual ones move slower'), T('Porque Vicon también ve a los virtuales', 'Because Vicon also sees the virtual ones')], answer: 0, explain: T('Desde el punto de vista del controlador es imposible saber qué información procede del mundo real y cuál de Webots.', 'From the controller\'s point of view it is impossible to know which information comes from the real world and which from Webots.') },
    { q: T('¿Por qué el dron reduce menos sus mensajes (85 %) que los Khepera?', 'Why does the drone cut its messages less (85%) than the Kheperas?'), options: [T('Porque oscila ligeramente en vuelo estacionario y supera el umbral de 1 cm más a menudo', 'Because it oscillates slightly in hover and exceeds the 1 cm threshold more often'), T('Porque publica a 50 Hz', 'Because it publishes at 50 Hz'), T('Porque es virtual', 'Because it is virtual')], answer: 0, explain: T('Los Khepera, una vez en su sitio, no se mueven hasta recibir nuevas consignas; el dron nunca está completamente quieto.', 'Once in place, the Kheperas do not move until they get new setpoints; the drone is never completely still.') },
    { q: T('¿Cómo se integra un Khepera IV, que no tiene driver de ROS 2?', 'How does a Khepera IV, which has no ROS 2 driver, join?'), options: [T('Con un sistema cliente-servidor o con micro-ROS en un ESP32', 'With a client–server scheme or micro-ROS on an ESP32'), T('No se puede usar', 'It cannot be used'), T('Sólo en simulación', 'Only in simulation')], answer: 0, explain: T('El ESP32 se comunica con el robot por I2C o puerto serie y aparece en la red como un nodo más.', 'The ESP32 talks to the robot over I2C or serial and appears on the network as one more node.') }
  ]);
})();
