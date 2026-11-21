/* Página interactiva: Muestreo y comunicación en SMR heterogéneos (RIAI 2024) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t, V = MA.v;
  IP.page();

  /* Geometría deducida de las distancias del artículo:
     Khepera en un cuadrado de radio 0,5 m (0°, 90°…), anillo de CF02–CF05 a 0,866 m de altura
     girado 45°, CF01 en el eje a 1,36 m, nodo virtual O en el origen. */
  function geometry() {
    const P = [[0, 0, 0]], A = [{ type: 'origin', name: 'O' }];
    P.push([0, 0, 1.36]); A.push({ type: 'cf', name: 'CF01' });
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; P.push([0.5 * Math.cos(a), 0.5 * Math.sin(a), 0.866]); A.push({ type: 'cf', name: 'CF0' + (k + 2) }); }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; P.push([0.5 * Math.cos(a), 0.5 * Math.sin(a), 0]); A.push({ type: 'kh', name: 'KH0' + (k + 1) }); }
    const E = [], add = (i, j) => E.push([i, j, V.norm(V.sub(P[i], P[j]))]);
    for (let k = 0; k < 4; k++) {
      add(1, 2 + k); add(2 + k, 2 + (k + 1) % 4); add(0, 2 + k);           // aire
      add(6 + k, 6 + (k + 1) % 4); add(0, 6 + k);                           // tierra
      add(2 + k, 6 + k); add(2 + k, 6 + (k + 1) % 4);                       // aire–tierra (0,9468 m)
    }
    add(0, 1);
    return { P, A, E };
  }
  const G = geometry();
  function swarm(sampling, seed) {
    const R = MA.rng(seed);
    const agents = G.A.map((a, i) => Object.assign({}, a, { p: a.type === 'origin' ? [0, 0, 0] : a.type === 'cf' ? [(R.u() - 0.5) * 2.6, (R.u() - 0.5) * 2.6, 0.7] : [(R.u() - 0.5) * 2.6, (R.u() - 0.5) * 2.6, 0] }));
    return new MA.Swarm({ agents, edges: G.E, mu: 1, fc: 10, sampling, tau: 0.3, vmax: 0.5, noise: 0.002, seed });
  }
  const deg = G.A.map((_, i) => G.E.filter(e => e[0] === i || e[1] === i).length);
  /** mensajes de red según la arquitectura, a partir de las publicaciones de cada robot */
  const netMsgs = (sw, arch) => sw.msgs.reduce((s, n, i) => s + (G.A[i].type === 'origin' ? 0 : arch === 'central' ? 2 * n : n * (1 + deg[i])), 0);

  /* Portada */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -35, el: 22, radius: 1.3, target: [0, 0, 0.6], autoRotate: IP.reducedMotion() ? 0 : 8 });
    let seed = 4, sw = swarm({ mode: 'event', delta: 0.02 }, seed);
    IP.animate(cv.parentElement, (dt) => {
      if (sw.t < 13) sw.advance(dt); else sw = swarm({ mode: 'event', delta: 0.02 }, ++seed);
      sc.begin(); MA.draw(sc, sw, { ground: 1.2, groundFill: 'rgba(200,230,215,0.06)', groundStroke: 'rgba(200,230,215,0.3)', colorOf: (i) => (G.A[i].type === 'cf' ? '#6aa8ec' : G.A[i].type === 'kh' ? '#f0a35f' : '#a9bdb2'), size: 0.07 }); sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'het', label: T('SMR heterogéneo\n5 CF + 4 KH', 'Heterogeneous MRS\n5 CF + 4 KH'), kind: 'theory', x: 150, y: 75, mx: 110, my: 60, href: '#simulador', text: T('<p>Cinco Crazyflie 2.1 y cuatro Khepera IV en Robotic Park, con posicionamiento por Vicon, Lighthouse, Marvelmind o UWB, integrados en ROS 2 con <i>namespaces</i>.</p>', '<p>Five Crazyflie 2.1 and four Khepera IV in Robotic Park, with Vicon, Lighthouse, Marvelmind or UWB positioning, integrated in ROS 2 with namespaces.</p>') },
      { id: 'lim', label: T('Batería, ancho de\nbanda y cómputo', 'Battery, bandwidth\nand computation'), kind: 'problem', x: 520, y: 75, mx: 310, my: 60, text: T('<p>Comunicar mucho reduce la autonomía y satura la red; cada robot tiene distinta capacidad de cálculo.</p>', '<p>Heavy communication reduces autonomy and saturates the network; each robot has different computing power.</p>') },
      { id: 'arch', label: T('3 arquitecturas', '3 architectures'), kind: 'method', x: 890, y: 75, mx: 110, my: 170, href: '#arquitecturas', text: T('<p>Centralizada (un nodo ROS 2), distribuida en ROS 2 (un nodo por robot) y distribuida a bordo (en el microcontrolador del robot).</p>', '<p>Centralised (one ROS 2 node), distributed in ROS 2 (one node per robot) and distributed on board (in the robot\'s microcontroller).</p>') },
      { id: 'form', label: T('Formación por\ndistancias', 'Distance-based\nformation'), kind: 'theory', x: 150, y: 260, mx: 310, my: 170, href: '#simulador', text: T('<p>\\(u_i=-\\sum\\mu_{ij}(\\|p_i-p_j\\|^2-d_{ij}^{*2})(p_i-p_j)\\) con un nodo virtual en el origen que ancla la formación.</p>', '<p>\\(u_i=-\\sum\\mu_{ij}(\\|p_i-p_j\\|^2-d_{ij}^{*2})(p_i-p_j)\\) with a virtual node at the origin anchoring the formation.</p>') },
      { id: 'samp', label: T('Periódico 0,5–50 Hz\no eventos 1–8 cm', 'Periodic 0.5–50 Hz\nor events 1–8 cm'), kind: 'method', x: 520, y: 260, mx: 110, my: 280, href: '#simulador', text: T('<p>Once casos con siete repeticiones cada uno, en las tres arquitecturas.</p>', '<p>Eleven cases with seven repetitions each, in the three architectures.</p>') },
      { id: 'res', label: T('2 cm: −80 a −89 %\nmensajes', '2 cm: −80 to −89%\nmessages'), kind: 'result', x: 890, y: 260, mx: 310, my: 280, text: T('<p>Frente a 10 Hz periódicos: −89 % centralizado, −80 % distribuido en ROS 2 y −82 % a bordo, con desempeño equivalente.</p>', '<p>Compared with 10 Hz periodic: −89% centralised, −80% distributed in ROS 2 and −82% on board, with equivalent performance.</p>') },
      { id: 'cpu', label: T('CPU: cada robot\nen su sitio', 'CPU: each robot\nin its place'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, text: T('<p>El Crazyflie es más eficiente con el controlador a bordo; el Khepera IV, en ROS 2. La CPU con eventos equivale a la de 5 Hz periódicos.</p>', '<p>The Crazyflie is more efficient with the controller on board; the Khepera IV, in ROS 2. CPU with events equals 5 Hz periodic.</p>') }
    ],
    edges: [{ from: 'het', to: 'form' }, { from: 'lim', to: 'arch' }, { from: 'lim', to: 'samp' }, { from: 'form', to: 'samp' }, { from: 'arch', to: 'res', bend: 0 }, { from: 'samp', to: 'res' }, { from: 'res', to: 'cpu' }]
  }, { panel: $('#cmapPanel'), initial: 'arch' });

  /* Diagrama de arquitecturas */
  const ARCH = {
    central: { t: T('Centralizada: un único nodo ROS 2 recibe todas las posiciones y calcula todas las consignas. n = 2N mensajes por periodo.', 'Centralised: a single ROS 2 node receives all positions and computes all setpoints. n = 2N messages per period.') },
    ros2: { t: T('Distribuida en ROS 2: un nodo coordinador por robot en el PC; cada uno escucha a sus vecinos. n = N(1 + |N_i|).', 'Distributed in ROS 2: one coordinator node per robot on the PC; each listens to its neighbours. n = N(1 + |N_i|).') },
    onboard: { t: T('Distribuida a bordo: el controlador corre en el propio robot (STM32F405 del Crazyflie o ARM Cortex-A8 del Khepera IV). Mismos mensajes que la distribuida, pero el cómputo lo paga el robot.', 'Distributed on board: the controller runs on the robot itself (Crazyflie STM32F405 or Khepera IV ARM Cortex-A8). Same messages as distributed, but the robot pays the computation.') }
  };
  function drawArch(a) {
    const R = [[90, 170], [210, 170], [330, 170], [450, 170], [570, 170]];
    let s = '<svg viewBox="0 0 680 230">';
    if (a === 'central') { s += '<rect x="250" y="20" width="180" height="44" rx="10" fill="var(--primary-soft)" stroke="var(--primary)"/><text x="340" y="47" text-anchor="middle">' + T('Coordinador central', 'Central coordinator') + '</text>'; R.forEach(([x, y]) => (s += `<line x1="340" y1="64" x2="${x}" y2="${y - 18}" stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="5 4"/>`)); }
    else R.forEach(([x, y], k) => { const n = R[(k + 1) % R.length]; if (k < R.length - 1) s += `<path d="M${x},${y - 18} Q${(x + n[0]) / 2},${y - 70} ${n[0]},${n[1] - 18}" fill="none" stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="5 4"/>`; });
    R.forEach(([x, y], k) => {
      const on = a !== 'central';
      s += `<rect x="${x - 48}" y="${y - 18}" width="96" height="44" rx="10" fill="var(--surface-2)" stroke="var(--border)"/><text x="${x}" y="${y + 2}" text-anchor="middle">${k < 3 ? 'CF0' + (k + 1) : 'KH0' + (k - 2)}</text>`;
      if (on) s += `<text class="m" x="${x}" y="${y + 18}" text-anchor="middle">${a === 'ros2' ? T('nodo en PC', 'node on PC') : T('a bordo', 'on board')}</text>`;
    });
    s += '</svg>';
    $('#archSvg').innerHTML = s; $('#archTxt').textContent = ARCH[a].t;
  }
  let archSel = 'central';
  IP.seg($('#archSeg'), [{ value: 'central', label: T('Centralizada', 'Centralised') }, { value: 'ros2', label: T('Distribuida ROS 2', 'Distributed ROS 2') }, { value: 'onboard', label: T('A bordo', 'On board') }], archSel, (v) => { archSel = v; drawArch(v); ctl && ctl.set('arch', v); });
  drawArch(archSel);

  /* Simulador */
  const sc = new IP.Scene3D($('#cv'), { az: -35, el: 24, radius: 1.3, target: [0, 0, 0.6] });
  const pe = new IP.Plot($('#pe'), { height: 220, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  const pm = new IP.Plot($('#pm'), { height: 220, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  const SAMP = ['p50', 'p20', 'p10', 'p5', 'p1', 'p0.5', 'e1', 'e2', 'e4', 'e6', 'e8'];
  const lab = (k) => (k[0] === 'p' ? T('Periódico ', 'Periodic ') + k.slice(1).replace('.', IP.lang === 'en' ? '.' : ',') + ' Hz' : T('Eventos δ = ', 'Events δ = ') + k.slice(1) + ' cm');
  const sampOf = (k) => (k[0] === 'p' ? { mode: 'periodic', f: parseFloat(k.slice(1)) } : { mode: 'event', delta: parseFloat(k.slice(1)) / 100, fcheck: 50 });
  const ctl = IP.controls($('#ctl'), [
    { id: 'arch', type: 'select', label: T('Arquitectura', 'Architecture'), value: 'central', options: [{ value: 'central', label: T('Centralizada', 'Centralised') }, { value: 'ros2', label: T('Distribuida en ROS 2', 'Distributed in ROS 2') }, { value: 'onboard', label: T('Distribuida a bordo', 'Distributed on board') }] },
    { id: 'samp', type: 'select', label: T('Muestreo', 'Sampling'), value: 'e2', options: SAMP.map(k => ({ value: k, label: lab(k) })) }
  ], (v, id) => { if (id === 'samp') launch(); });
  let sw, ref, seed = 5;
  function launch(n) { if (n) seed++; sw = swarm(sampOf(ctl.values.samp), seed); ref = swarm({ mode: 'periodic', f: 10 }, seed); ref.advance(18); }
  $('#run').addEventListener('click', () => launch(true));
  launch();
  const errType = (s, type) => s.hist.eAgent.reduce((acc, arr, i) => (G.A[i].type === type ? acc.map((x, k) => x + arr[k]) : acc), s.hist.t.map(() => 0));
  IP.animate($('#simulador'), (dt) => {
    if (sw.t < 18) sw.advance(Math.min(0.1, dt));
    sc.begin(); MA.draw(sc, sw, { ground: 1.2, labels: true, size: 0.07 }); sc.draw(dt);
    $('#tt').textContent = `t = ${fmt(sw.t, 1)} s`;
    pe.opts.xlim = pm.opts.xlim = [0, 18];
    pe.setSeries([{ name: 'Crazyflie', color: '--s1', x: sw.hist.t, y: errType(sw, 'cf'), width: 2, unit: 'm' }, { name: 'Khepera IV', color: '--s2', x: sw.hist.t, y: errType(sw, 'kh'), width: 2, unit: 'm' }]);
    const a = ctl.values.arch, cumNet = (s) => { const per = s.hist.msgs; const tot = netMsgs(s, a), last = per[per.length - 1] || 1; return per.map(x => x * tot / last); };
    pm.setSeries([{ name: T('10 Hz periódico', '10 Hz periodic'), color: '--s5', x: ref.hist.t, y: cumNet(ref), width: 1.6, dash: [5, 4] }, { name: lab(ctl.values.samp), color: '--s1', x: sw.hist.t, y: cumNet(sw), width: 2.2 }]);
    const m = sw.metrics(0.05), mr = ref.metrics(0.05), n = netMsgs(sw, a), nr = netMsgs(ref, a) * Math.min(1, sw.t / 18);
    const c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    $('#ro').innerHTML = c(T('Mensajes de red', 'Network messages'), String(n)) + c(T('vs. 10 Hz', 'vs. 10 Hz'), (n <= nr ? '−' : '+') + fmt(Math.abs(100 * (1 - n / Math.max(1, nr))), 0) + ' %', 'hl') +
      c(T('Mensajes por periodo', 'Messages per period'), a === 'central' ? `2N = ${2 * 9}` : `ΣN(1+|N_i|) = ${G.A.reduce((s, x, i) => s + (x.type === 'origin' ? 0 : 1 + deg[i]), 0)}`) +
      (sw.t >= 17.9 ? c('IEA', fmt(m.iae, 2)) + c(T('IEA vs. 10 Hz', 'IAE vs. 10 Hz'), (m.iae >= mr.iae ? '+' : '−') + fmt(Math.abs(100 * (m.iae / mr.iae - 1)), 1) + ' %') + c('t_e (5 %)', fmt(m.te, 1) + ' s')
        : c('IEA', '…') + c(T('IEA vs. 10 Hz', 'IAE vs. 10 Hz'), '…') + c('t_e (5 %)', '…'));
  }).start();

  IP.quiz($('#quizBox'), [
    { q: T('¿Por qué los Khepera IV y los Crazyflie no tienen las mismas distancias objetivo entre sí?', 'Why do the Khepera IV and Crazyflie not have the same target distances?'), options: [T('Porque los Khepera están en el suelo y los drones a 0,866 m: los enlaces aire–tierra miden 0,9468 m', 'Because the Kheperas are on the ground and the drones at 0.866 m: air–ground edges are 0.9468 m'), T('Por un error de medida', 'Due to a measurement error'), T('Porque los Khepera son más rápidos', 'Because the Kheperas are faster')], answer: 0, explain: T('Con un anillo girado 45° respecto al de los Khepera, la distancia es √(0,383² + 0,866²) ≈ 0,9468 m.', 'With a ring rotated 45° relative to the Kheperas\', the distance is √(0.383² + 0.866²) ≈ 0.9468 m.') },
    { q: T('En la arquitectura centralizada con 9 robots, ¿cuántos mensajes hay por periodo?', 'In the centralised architecture with 9 robots, how many messages per period?'), options: ['9', '18', '81'], answer: 1, explain: T('n = 2N: cada robot envía su posición y recibe su consigna.', 'n = 2N: each robot sends its position and receives its setpoint.') },
    { q: T('Según el artículo, ¿dónde conviene ejecutar el controlador del Khepera IV?', 'According to the paper, where is it best to run the Khepera IV controller?'), options: [T('A bordo', 'On board'), T('En ROS 2 (fuera de placa)', 'In ROS 2 (off board)'), T('Da igual', 'It does not matter')], answer: 1, explain: T('Su procesador y su sistema operativo antiguo obligan a un protocolo cliente-servidor costoso por encima de 10 Hz; el Crazyflie, en cambio, rinde mejor a bordo.', 'Its processor and legacy OS force a costly client–server protocol above 10 Hz; the Crazyflie, instead, does better on board.') }
  ]);
})();
