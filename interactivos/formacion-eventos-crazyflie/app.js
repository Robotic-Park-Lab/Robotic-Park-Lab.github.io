/* Página interactiva: Control de formación basado en eventos para Crazyflie 2.1 (I Simposio CEA, 2022) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t, P = LF.PAPER;
  IP.page();
  const COL = ['--s1', '--s3', '--s2'], NAMES = ['dron01', 'dron02', 'dron03'];

  /* Dibujo común de la escena */
  function sphere(sc, c, r, color) {
    [[1, 0], [0, 1], [2, 0]].forEach(([ax]) => {
      const pts = []; for (let k = 0; k < 32; k++) { const a = k / 32 * 2 * Math.PI, u = r * Math.cos(a), v = r * Math.sin(a); pts.push(ax === 1 ? [c[0] + u, c[1] + v, c[2]] : ax === 0 ? [c[0] + u, c[1], c[2] + v] : [c[0], c[1] + u, c[2] + v]); }
      sc.polyline(pts, { color, closed: true, alpha: 0.35, width: 1 });
    });
  }
  function floor(sc) {
    for (let k = -4; k <= 4; k++) { sc.line([k * 0.25, -1, 0], [k * 0.25, 1, 0], { color: '--border', width: 0.7, alpha: 0.6 }); sc.line([-1, k * 0.25, 0], [1, k * 0.25, 0], { color: '--border', width: 0.7, alpha: 0.6 }); }
    const sq = [[-0.25, -0.25, 1], [0.25, -0.25, 1], [0.25, 0.25, 1], [-0.25, 0.25, 1]];
    sc.polyline(sq, { color: '--muted', closed: true, dash: [5, 4], width: 1.2 });
  }
  function drawState(sc, R, k, o = {}) {
    floor(sc);
    for (let i = 0; i < 3; i++) {
      const tr = R.p[i].slice(Math.max(0, k - (o.trail || 400)), k + 1).filter((_, n) => n % 3 === 0);
      if (tr.length > 1) sc.polyline(tr, { color: COL[i], width: 1.3, alpha: 0.5 });
    }
    sc.line(R.p[0][k], R.p[1][k], { color: '--s4', width: 1.4, alpha: 0.7, dash: [4, 4] });
    sc.line(R.p[1][k], R.p[2][k], { color: '--s4', width: 1.4, alpha: 0.7, dash: [4, 4] });
    if (o.spheres && o.c > 0) for (let i = 0; i < 2; i++) sphere(sc, R.sent[i][k], o.c, COL[i]);
    for (let i = 0; i < 3; i++) {
      const flash = o.flash && o.flash[i] > 0;
      sc.drone(R.p[i][k], { color: COL[i], size: 0.06, alpha: flash ? 0.75 : 0.3 });
      if (flash) sc.point(R.p[i][k], { r: 9, color: COL[i], alpha: 0.35 });
      if (o.labels) sc.text(R.p[i][k], NAMES[i], { dy: -14, size: 10, color: COL[i] });
    }
  }

  /* Portada */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -35, el: 22, radius: 0.95, target: [0.1, 0.1, 0.75], autoRotate: IP.reducedMotion() ? 0 : 7 });
    const R = LF.simulate({ mode: 'E', c: 0.1, seed: 4 });
    let k = 0, acc = 0;
    IP.animate(cv.parentElement, (dt) => {
      acc += dt * 1.5; while (acc > 0.05) { acc -= 0.05; k = (k + 1) % R.t.length; }
      sc.begin(); drawState(sc, R, k, { spheres: true, c: 0.1, trail: 300 }); sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 720],
    nodes: [
      { id: 'need', label: T('Validar enjambres\nen interior', 'Validate swarms\nindoors'), kind: 'problem', x: 150, y: 80, mx: 110, my: 60, text: T('<p>Antes de llevar un enjambre a exteriores (rescate, agricultura, exploración) conviene validarlo en un entorno controlado. Robotic Park nace para eso, en investigación y en docencia.</p>', '<p>Before taking a swarm outdoors (rescue, agriculture, exploration) it is wise to validate it in a controlled environment. Robotic Park was born for that, in research and teaching.</p>') },
      { id: 'plat', label: T('Robotic Park\nROS 2 + Vicon', 'Robotic Park\nROS 2 + Vicon'), kind: 'method', x: 520, y: 80, mx: 310, my: 60, href: '#plataforma', text: T('<p>ROS 2 Galactic descentralizado: cualquier agente conectado a la red ve todos los nodos y <i>topics</i>. Vicon Tracker 3.9 a 100 Hz con 6 cámaras Vero v2.2; Gazebo para simular con los mismos nombres de <i>topics</i>.</p>', '<p>Decentralised ROS 2 Galactic: any agent on the network sees every node and <i>topic</i>. Vicon Tracker 3.9 at 100 Hz with 6 Vero v2.2 cameras; Gazebo to simulate with the same <i>topic</i> names.</p>') },
      { id: 'cf', label: 'Crazyflie 2.1', kind: 'method', x: 890, y: 80, mx: 110, my: 180, href: '#plataforma', text: T('<p>Nanocuadricóptero de 27 g y 92 × 92 × 29 mm. El control de posición se ejecuta a bordo; un solo Crazyradio PA comunica hasta 15 unidades con el PC.</p>', '<p>27 g, 92 × 92 × 29 mm nano-quadrotor. Position control runs on board; a single Crazyradio PA links up to 15 units with the PC.</p>') },
      { id: 'lf', label: T('Líder-seguidor\np_i − p_j = p*_ij', 'Leader-follower\np_i − p_j = p*_ij'), kind: 'theory', x: 330, y: 270, mx: 310, my: 180, href: '#simulador', text: T('<p>El líder sigue la consigna γ(t); los seguidores mantienen la posición relativa deseada con su vecino. Topología: dron01 → dron02 ↔ dron03.</p>', '<p>The leader tracks the reference γ(t); followers keep the desired relative position with their neighbour. Topology: dron01 → dron02 ↔ dron03.</p>') },
      { id: 'sod', label: T('Send-on-delta\n‖e_i‖ > c₀', 'Send-on-delta\n‖e_i‖ > c₀'), kind: 'theory', x: 710, y: 270, mx: 110, my: 300, href: '#eventos', text: T('<p>Cada dron sólo publica su posición cuando se ha alejado más de c₀ de la última posición enviada. Ahorra canal y batería.</p>', '<p>Each drone only publishes its position when it has moved more than c₀ away from the last position sent. It saves channel and battery.</p>') },
      { id: 'res', label: T('−95,47 %\nmensajes', '−95.47%\nmessages'), kind: 'result', x: 520, y: 440, mx: 310, my: 300, href: '#resultados', text: T('<p>Con c₀ = 10 el líder pasa de 928 a 42 mensajes con la misma formación (Tablas 1 y 2). El retardo sube de 0,6 s a 1,0 s sin efecto negativo.</p>', '<p>With c₀ = 10 the leader goes from 928 to 42 messages with the same formation (Tables 1 and 2). The lag rises from 0.6 s to 1.0 s with no negative effect.</p>') },
      { id: 'why', label: T('¿Por qué funciona?', 'Why does it work?'), kind: 'result', x: 890, y: 440, mx: 210, my: 420, text: T('<p>Los controladores internos del Crazyflie son muy estables: cuando el líder llega a un punto no sale de su esfera umbral hasta recibir una nueva consigna, así que deja de generar eventos.</p>', '<p>The Crazyflie\'s inner controllers are very stable: once the leader reaches a point it does not leave its threshold sphere until it gets a new setpoint, so it stops generating events.</p>') }
    ],
    edges: [{ from: 'need', to: 'plat' }, { from: 'plat', to: 'cf' }, { from: 'plat', to: 'lf' }, { from: 'cf', to: 'sod' }, { from: 'lf', to: 'sod' }, { from: 'lf', to: 'res' }, { from: 'sod', to: 'res' }, { from: 'res', to: 'why' }]
  }, { panel: $('#cmapPanel'), initial: 'sod' });

  /* Arquitectura */
  (function arch() {
    const B = {
      cam: [T('6 cámaras Vero v2.2', '6 Vero v2.2 cameras'), T('<p>Hasta 330 fps y 2,2 Mpx: detectan marcadores de 6,5 mm en todo el volumen de 2 × 2 × 2,5 m. Van conectadas por Ethernet a un <i>switch</i> PoE de 26 puertos (D-Link DGS-1026MP).</p>', '<p>Up to 330 fps and 2.2 Mpx: they detect 6.5 mm markers in the whole 2 × 2 × 2.5 m volume. They connect over Ethernet to a 26-port PoE switch (D-Link DGS-1026MP).</p>')],
      trk: ['Vicon Tracker 3.9', T('<p>En el PC con Windows 10. Asocia los puntos detectados a cada objeto y estima su posición y orientación a 100 Hz. Para la pose completa necesita 5 marcadores asimétricos por robot; con menos, sólo la posición, y la distribución debe ser distinta en cada robot.</p>', '<p>On the Windows 10 PC. It associates the detected points with each object and estimates its position and orientation at 100 Hz. Full pose needs 5 asymmetric markers per robot; with fewer, only position, and each robot needs a different layout.</p>')],
      ros: ['ROS 2 Galactic', T('<p>En el PC con Ubuntu 20.04. Un nodo con el SDK de Vicon publica cada pose como <code>geometry_msgs/Pose</code>; otro nodo gestiona las trayectorias. Todos los nodos con el mismo <code>ROS_DOMAIN_ID</code> se ven entre sí, sin un máster central como en ROS 1.</p>', '<p>On the Ubuntu 20.04 PC. A node using the Vicon SDK publishes each pose as <code>geometry_msgs/Pose</code>; another node manages trajectories. All nodes sharing the same <code>ROS_DOMAIN_ID</code> see each other, with no central master as in ROS 1.</p>')],
      radio: ['Crazyradio PA', T('<p>Antena USB con la API de Python <code>cflib</code>. Una sola antena comunica hasta 15 Crazyflie. La comunicación entre drones pasa por este nodo, así que cada mensaje ahorrado libera el canal de radio.</p>', '<p>USB dongle with the <code>cflib</code> Python API. A single dongle links up to 15 Crazyflies. Drone-to-drone communication goes through this node, so every saved message frees the radio channel.</p>')],
      cf: ['Crazyflie 2.1', T('<p>27 g, 92 × 92 × 29 mm. Lleva sensor de distancia VL53L1x y de flujo óptico PMW3901, pero su estimación es poco precisa: el sistema global (Vicon) inicializa y corrige su posición. El control de posición corre en su microcontrolador.</p>', '<p>27 g, 92 × 92 × 29 mm. It carries a VL53L1x distance sensor and a PMW3901 optical-flow sensor, but their estimate is not very accurate: the global system (Vicon) initialises and corrects its position. Position control runs on its microcontroller.</p>')],
      gz: ['Gazebo', T('<p>Mismo grafo de ROS 2 que el sistema real: un nodo sustituye a Vicon y publica las poses simuladas con el mismo tipo, frecuencia y nombre de <i>topic</i>. Así un experimento pasa de simulación a realidad sin cambios.</p>', '<p>Same ROS 2 graph as the real system: a node replaces Vicon and publishes the simulated poses with the same type, rate and <i>topic</i> name. An experiment thus moves from simulation to reality unchanged.</p>')]
    };
    const box = (id, x, y, w, h, l1, l2, fill) => `<g class="hot" data-id="${id}" tabindex="0" role="button"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill || 'var(--surface)'}" stroke="var(--primary)" stroke-width="1.4"/><text x="${x + w / 2}" y="${y + (l2 ? h / 2 - 3 : h / 2 + 4)}" text-anchor="middle">${l1}</text>${l2 ? `<text class="s" x="${x + w / 2}" y="${y + h / 2 + 14}" text-anchor="middle">${l2}</text>` : ''}</g>`;
    const ar = (d, c = 'var(--axis)', dash = '') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.8" ${dash ? `stroke-dasharray="${dash}"` : ''} marker-end="url(#ah)"/>`;
    $('#arch').innerHTML = `<svg viewBox="0 0 720 300"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--axis)"/></marker></defs>
      ${box('cam', 20, 30, 160, 54, T('6 × Vero v2.2', '6 × Vero v2.2'), T('Ethernet · switch PoE', 'Ethernet · PoE switch'))}
      ${box('trk', 270, 30, 180, 54, 'Tracker 3.9', 'Windows 10 · 100 Hz')}
      ${box('ros', 270, 140, 180, 60, 'ROS 2 Galactic', T('Ubuntu 20.04 · trayectorias', 'Ubuntu 20.04 · trajectories'), 'var(--primary-soft)')}
      ${box('radio', 540, 140, 160, 60, 'Crazyradio PA', T('cflib · hasta 15 drones', 'cflib · up to 15 drones'))}
      ${box('cf', 540, 236, 160, 50, '3 × Crazyflie 2.1', T('control a bordo', 'on-board control'))}
      ${box('gz', 20, 140, 160, 60, 'Gazebo', T('gemelo del sistema', 'system twin'), 'var(--accent-soft)')}
      ${ar('M180,57 L268,57')}${ar('M360,84 L360,138')}<text class="s" x="368" y="116">Pose · 100 Hz</text>
      ${ar('M450,170 L538,170')}<text class="s" x="460" y="162">${T('consignas', 'setpoints')}</text>
      ${ar('M620,200 L620,234')}${ar('M540,262 C470,262 380,250 360,202', 'var(--axis)', '5 4')}<text class="s" x="384" y="262">${T('marcadores', 'markers')}</text>
      ${ar('M180,170 L268,170', 'var(--accent)', '5 4')}<text class="s" x="190" y="162">${T('sustituye a Vicon', 'replaces Vicon')}</text></svg>`;
    const show = (id) => { $('#archInfo').innerHTML = `<h3>${B[id][0]}</h3>${B[id][1]}`; IP.$$('#arch .hot').forEach(g => g.querySelector('rect').setAttribute('stroke-width', g.dataset.id === id ? 3 : 1.4)); };
    IP.$$('#arch .hot').forEach(g => { g.addEventListener('click', () => show(g.dataset.id)); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(g.dataset.id); } }); });
    show('ros');
  })();

  /* Send-on-delta en una dimensión */
  (function sod() {
    const pl = new IP.Plot($('#sod'), { height: 260, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', yunit: 'm' });
    const ctl = IP.controls($('#sodCtl'), [{ id: 'c', label: T('Umbral', 'Threshold'), sym: 'c₀', min: 0.01, max: 0.2, step: 0.01, value: 0.05, unit: 'm', digits: 2 }], draw);
    const R = LF.simulate({ mode: 'P', seed: 2 });
    function draw() {
      const c = ctl.values.c, t = [], x = [], s = [], ev = []; let last = null, n = 0;
      R.t.forEach((tt, k) => { const q = R.p[0][k]; if (last === null || Math.hypot(q[0] - last[0], q[1] - last[1], q[2] - last[2]) > c) { last = q.slice(); n++; ev.push({ x: tt, y: q[0], r: 3, color: '--s2', scale: false }); } t.push(tt); x.push(q[0]); s.push(last[0]); });
      pl.overlays = { markers: ev };
      pl.setSeries([{ name: T('posición real', 'actual position'), color: '--s1', x: t, y: x, width: 2 }, { name: T('última enviada', 'last sent'), color: '--s2', x: t, y: s, width: 1.8, step: true }]);
      const per = R.t.length;
      $('#sodRo').innerHTML = `<div class="ip-readout"><span>${T('Periódico (50 ms)', 'Periodic (50 ms)')}</span><b>${per}</b></div><div class="ip-readout hl"><span>${T('Eventos', 'Events')}</span><b>${n}</b></div><div class="ip-readout" style="grid-column:1/-1"><span>${T('Reducción', 'Reduction')}</span><b>${fmt(100 * (1 - n / per), 1)} %</b></div>
        <p class="ip-small ip-muted" style="grid-column:1/-1;margin:4px 0 0">${T('El umbral se mide en 3D (‖e‖), por eso también el despegue genera eventos aunque x no cambie.', 'The threshold is measured in 3D (‖e‖), which is why take-off also generates events although x does not change.')}</p>`;
    }
    draw();
  })();

  /* Simulador */
  const sc = new IP.Scene3D($('#cv'), { az: -38, el: 22, radius: 1.0, target: [0.1, 0.1, 0.7] });
  const pe = new IP.Plot($('#pe'), { height: 240, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', yunit: 'm' });
  const pp = new IP.Plot($('#pp'), { height: 240, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', yunit: 's' });
  let mode = 'E';
  const ctl = IP.controls($('#ctl'), [
    { id: 'c', label: T('Umbral de disparo', 'Trigger threshold'), sym: 'c₀', min: 0.01, max: 0.2, step: 0.01, value: 0.1, unit: 'm', digits: 2 },
    { id: 'speed', label: T('Velocidad de reproducción', 'Playback speed'), min: 0.5, max: 6, step: 0.5, value: 2, unit: '×', digits: 1 },
    { id: 'spheres', type: 'toggle', label: T('Mostrar esferas umbral', 'Show threshold spheres'), value: true }
  ], (id) => { if (id === 'c') run(); });
  IP.seg($('#modeSeg'), [{ value: 'P', label: T('Periódico 50 ms', 'Periodic 50 ms') }, { value: 'E', label: T('Eventos', 'Events') }], mode, (v) => { mode = v; run(); });
  let R, k = 0, acc = 0, flash = [0, 0, 0], mi = [0, 0];
  const cache = {};
  const sim = (m, c) => { const key = m + c.toFixed(3); return cache[key] || (cache[key] = LF.simulate({ mode: m, c })); };
  function run() {
    R = sim(mode, ctl.values.c); k = 0; mi = [0, 0];
    const tt = [], ex = [[], [], []]; R.t.forEach((t, n) => { tt.push(t); for (let a = 0; a < 3; a++) ex[a].push(R.p[1][n][a] - R.p[0][n][a] - P.offset[a]); });
    pe.opts.xlim = [0, P.T];
    pe.setSeries([{ name: 'X', color: '--s3', x: tt, y: ex[0], width: 1.6 }, { name: 'Y', color: '--s2', x: tt, y: ex[1], width: 1.6 }, { name: 'Z', color: '--s1', x: tt, y: ex[2], width: 1.6 }]);
    // periodo entre mensajes recibidos por dron02 (enviados por dron01)
    const m = R.msgT[0], px = [], py = []; for (let n = 1; n < m.length; n++) { px.push(m[n]); py.push(m[n] - m[n - 1]); }
    pp.opts.xlim = [0, P.T];
    pp.setSeries([{ name: mode === 'P' ? 'P' : `c₀ = ${fmt(ctl.values.c, 2)} m`, color: '--s1', x: px, y: py, width: 1.8, step: true }]);
    readouts();
  }
  function readouts() {
    const c = (a, b, cl = '') => `<div class="ip-readout ${cl}"><span>${a}</span><b>${b}</b></div>`, per = sim('P', 0);
    $('#ro').innerHTML = c(T('Mensajes dron01', 'dron01 messages'), R.msgs[0]) + c(T('Mensajes dron02', 'dron02 messages'), R.msgs[1]) +
      c(T('Reducción frente a 50 ms', 'Reduction vs 50 ms'), `${fmt(100 * (1 - R.msgs[0] / per.msgs[0]), 1)} %`, 'hl') + c(T('Retardo líder → seguidor', 'Leader → follower lag'), `${fmt(R.lag, 2)} s`) +
      `<p class="ip-small ip-muted" style="grid-column:1/-1;margin:4px 0 0">${T('Retardo estimado como el desfase que mejor alinea la trayectoria de dron02 (menos p*) con la de dron01.', 'Lag estimated as the shift that best aligns dron02\'s trajectory (minus p*) with dron01\'s.')}</p>`;
  }
  $('#replay').addEventListener('click', () => { k = 0; mi = [0, 0]; });
  run();
  IP.animate($('#simulador'), (dt) => {
    acc += dt * ctl.values.speed;
    while (acc > 0.05) {
      acc -= 0.05; k++;
      if (k >= R.t.length) { k = 0; mi = [0, 0]; }
      for (let i = 0; i < 2; i++) while (mi[i] < R.msgT[i].length && R.msgT[i][mi[i]] <= R.t[k]) { mi[i]++; if (mode === 'E') flash[i] = 0.25; }
    }
    flash = flash.map(f => Math.max(0, f - dt));
    sc.begin(); drawState(sc, R, k, { spheres: ctl.values.spheres && mode === 'E', c: ctl.values.c, flash, labels: true }); sc.draw(dt);
    $('#tt').textContent = `t = ${fmt(R.t[k], 1)} s · ${T('mensajes', 'messages')} ${mi[0]} / ${mi[1]}`;
  }).start();

  /* Resultados: tablas del artículo junto a la simulación */
  (function results() {
    const S = { P: sim('P', 0), BE5: sim('E', 0.05), BE10: sim('E', 0.1) };
    const rows = [['dron01', 0], ['dron02', 1]].map(([n, i]) => `<tr><td>${n}</td>${['P', 'BE5', 'BE10'].map(m => `<td class="num">${P.msgs[m][i]} <span class="ip-muted">· ${S[m].msgs[i]}</span></td>`).join('')}</tr>`).join('');
    const red = ['P', 'BE5', 'BE10'].map(m => `<td class="num">${m === 'P' ? '—' : fmt(100 * (1 - P.msgs[m][0] / P.msgs.P[0]), 2) + ' %'}</td>`).join('');
    const lag = ['P', 'BE5', 'BE10'].map(m => `<td class="num">${fmt(P.delay[m], 1)} s <span class="ip-muted">· ${fmt(S[m].lag, 2)}</span></td>`).join('');
    $('#cmpTable').innerHTML = `<div class="ip-table-wrap"><table class="ip-table"><thead><tr><th>${T('Emisor', 'Sender')}</th><th>P</th><th>BE5</th><th>BE10</th></tr></thead><tbody>${rows}<tr class="best"><td>${T('Reducción líder', 'Leader reduction')}</td>${red}</tr><tr><td>${T('Retardo', 'Lag')}</td>${lag}</tr></tbody></table></div>
      <p class="ip-small ip-muted" style="margin-top:6px">${T('Primer número: artículo · en gris: esta simulación.', 'First number: paper · in grey: this simulation.')}</p>`;
    const mx = P.msgs.P[0];
    $('#bars').innerHTML = '<div class="lbars">' + ['P', 'BE5', 'BE10'].map(m => [[T('Artículo', 'Paper'), P.msgs[m][0], ''], [T('Simulación', 'Simulation'), S[m].msgs[0], 'r']].map(([n, v, cl]) => `<div class="lbar"><span>${m} · ${n}</span><div class="tr"><i class="${cl}" style="width:${Math.max(1.5, 100 * Math.sqrt(v / mx))}%"></i></div><span>${v}</span></div>`).join('')).join('') + '</div>' +
      `<p class="ip-small ip-muted" style="margin-top:6px">${T('Longitud de barra en escala de raíz cuadrada para que se vean los casos por eventos.', 'Bar length on a square-root scale so the event-based cases are visible.')}</p>`;
    const lab = ['(01 − 02) X', '(01 − 02) Y', '(01 − 02) Z', '(02 − 03) X', '(02 − 03) Y', '(02 − 03) Z'], ms = (v) => `${fmt(v[0], 2)} ± ${fmt(v[1], 2)}`;
    $('#relTable').innerHTML = `<div class="ip-table-wrap"><table class="ip-table"><thead><tr><th>${T('Relación', 'Pair')}</th><th>P</th><th>BE5</th><th>BE10</th></tr></thead><tbody>${lab.map((l, r) => `<tr><td>${l}</td>${['P', 'BE5', 'BE10'].map(m => `<td class="num">${ms(P.rel[m][r])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    // calculadora de bytes
    const bc = IP.controls($('#bytesCtl'), [
      { id: 'n', label: T('Número de drones que publican', 'Number of publishing drones'), min: 1, max: 15, step: 1, value: 2, digits: 0 },
      { id: 'pose', type: 'toggle', label: T('Enviar orientación (Pose completa, 56 B)', 'Send orientation (full Pose, 56 B)'), value: true }
    ], bytes);
    function bytes() {
      const B = bc.values.pose ? P.poseBytes : P.posBytes, n = bc.values.n, per = 20 * B * n, ev = (P.msgs.BE10[0] / P.T) * B * n;
      $('#bytesRo').innerHTML = `<div class="ip-readout"><span>${T('Periódico', 'Periodic')}</span><b>${fmt(per / 1000, 2)} kB/s</b></div><div class="ip-readout hl"><span>BE10</span><b>${fmt(ev, 0)} B/s</b></div><div class="ip-readout"><span>${T('En 1 h de vuelo', 'In 1 h of flight')}</span><b>${fmt(per * 3.6, 0)} → ${fmt(ev * 3.6, 0)} kB</b></div>`;
    }
    bytes();
  })();

  IP.quiz($('#quizBox'), [
    { q: T('¿Cuándo publica su posición un dron con send-on-delta?', 'When does a drone publish its position with send-on-delta?'), options: [T('Cada 50 ms', 'Every 50 ms'), T('Cuando se ha alejado más de c₀ de la última posición enviada', 'When it has moved more than c₀ away from the last position sent'), T('Cuando lo pide el líder', 'When the leader asks for it')], answer: 1, explain: T('f_i = ‖p_i(t) − p_i(t_k)‖ − c₀: el evento se dispara cuando f_i > 0.', 'f_i = ‖p_i(t) − p_i(t_k)‖ − c₀: the event fires when f_i > 0.') },
    { q: T('¿Por qué la reducción de mensajes es tan grande (95,47 %)?', 'Why is the message reduction so large (95.47%)?'), options: [T('Porque el control interno del Crazyflie es estable: al llegar a un punto el dron no sale de su esfera umbral', 'Because the Crazyflie\'s inner control is stable: once at a point the drone does not leave its threshold sphere'), T('Porque Vicon funciona a 100 Hz', 'Because Vicon runs at 100 Hz'), T('Porque se omite la orientación', 'Because the orientation is dropped')], answer: 0, explain: T('Mientras el dron mantiene la posición no se generan eventos; sólo los desplazamientos producen mensajes.', 'While the drone holds its position no events are generated; only displacements produce messages.') },
    { q: T('¿Qué precio se paga al usar eventos con c₀ = 10?', 'What is the price of using events with c₀ = 10?'), options: [T('La formación se rompe', 'The formation breaks'), T('Un retardo algo mayor entre líder y seguidor (de 0,6 a 1,0 s)', 'A somewhat larger leader–follower lag (from 0.6 to 1.0 s)'), T('Más consumo de batería', 'Higher battery consumption')], answer: 1, explain: T('El seguidor recibe la posición más tarde (sólo cuando el líder se ha movido c₀), pero la Tabla 1 muestra la misma posición relativa en los tres casos.', 'The follower gets the position later (only once the leader has moved c₀), but Table 1 shows the same relative position in all three cases.') },
    { q: T('¿Qué permite pasar un experimento de Gazebo al laboratorio sin cambios?', 'What lets an experiment move from Gazebo to the lab unchanged?'), options: [T('Usar los mismos nombres, tipos y frecuencias de topics en ROS 2', 'Using the same topic names, types and rates in ROS 2'), T('Usar el mismo PC', 'Using the same PC'), T('Desactivar Vicon', 'Disabling Vicon')], answer: 0, explain: T('Un nodo de simulación sustituye a Vicon publicando las poses con el mismo formato: el resto del grafo no nota la diferencia.', 'A simulation node replaces Vicon by publishing the poses in the same format: the rest of the graph does not notice the difference.') }
  ]);
})();
