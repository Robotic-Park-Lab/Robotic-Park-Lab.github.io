/* Página interactiva: benchmark de formaciones (JA 2024 · Control Systems Benchmarks 2025) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t, V = MA.v;
  IP.page();
  const N0 = 15, R = 1, Z0 = 1;

  /* ---------- Problema 1: tres algoritmos de diseño ---------- */
  function kNearest(P, k) {
    const E = new Map();
    P.forEach((p, i) => P.map((q, j) => [V.norm(V.sub(p, q)), j]).filter(x => x[1] !== i).sort((a, b) => a[0] - b[0]).slice(0, k).forEach(([d, j]) => E.set(Math.min(i, j) + ',' + Math.max(i, j), [Math.min(i, j), Math.max(i, j), d])));
    return [...E.values()];
  }
  const DESIGNS = {
    alg1: { name: T('Algoritmo 1 (anillos + Delaunay)', 'Algorithm 1 (rings + Delaunay)'), run: (N) => { const F = FORM.buildShield(FORM.surface('esfera', { R }), N, { h0: 0.02 }); return { P: F.P.map(p => [p[0], p[1], p[2] + Z0]), E: F.edges.map(([i, j], k) => [i, j, F.dstar[k]]) }; } },
    fib: { name: T('Espiral de Fibonacci + 4 vecinos', 'Fibonacci spiral + 4 neighbours'), run: (N) => { const ga = Math.PI * (3 - Math.sqrt(5)), P = []; for (let k = 0; k < N; k++) { const z = (k + 0.5) / N, r = Math.sqrt(1 - z * z); P.push([R * r * Math.cos(k * ga), R * r * Math.sin(k * ga), Z0 + R * z]); } return { P, E: kNearest(P, 4) }; } },
    rnd: { name: T('Aleatorio + 4 vecinos', 'Random + 4 neighbours'), run: (N) => { const g = MA.rng(7), P = []; for (let k = 0; k < N; k++) { const z = g.u(), a = g.u() * 2 * Math.PI, r = Math.sqrt(1 - z * z); P.push([R * r * Math.cos(a), R * r * Math.sin(a), Z0 + R * z]); } return { P, E: kNearest(P, 4) }; } }
  };
  function J1(design, N) {
    const t0 = performance.now(); let D; for (let k = 0; k < 5; k++) D = DESIGNS[design].run(N); const tau = (performance.now() - t0) / 5 / 1000;
    const d = D.E.map(e => e[2]), delta = Math.max(...d) - Math.min(...d), Ed = d.reduce((s, x) => s + 1 / (x * x), 0);
    return { D, tau, delta, Ed, J: 2.4283 * tau + 1.0 * delta + 0.0079 * Ed };
  }

  /** Condiciones iniciales: 'hover' = como en el benchmark (despegue bajo su nodo y ensayo desde z ≈ 1 m);
      'random' = posiciones aleatorias en el suelo (el gradiente suele quedar atrapado en mínimos locales). */
  function initial(D, mode, seed) {
    const g = MA.rng(seed);
    return D.P.map(p => mode === 'random' ? [(g.u() - 0.5) * 2.2, (g.u() - 0.5) * 2.2, 0.02]
      : [0.8 * p[0] + 0.3 * (g.u() - 0.5), 0.8 * p[1] + 0.3 * (g.u() - 0.5), Z0 + 0.02 + 0.1 * (p[2] - Z0) + 0.05 * g.u()]);
  }

  /* Portada */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -35, el: 20, radius: 1.3, target: [0, 0, 0.9], autoRotate: IP.reducedMotion() ? 0 : 8 });
    const D = DESIGNS.alg1.run(N0); let seed = 1, sw;
    const go = () => { sw = new MA.Swarm({ agents: initial(D, 'hover', seed++).map(p => ({ type: 'cf', p })), edges: D.E, mu: 1, sphere: { R, c: [0, 0, Z0], k: 1, upper: true }, fc: 10, tau: 0.3, vmax: 0.6, seed }); };
    go();
    IP.animate(cv.parentElement, (dt) => { if (sw.t < 14) sw.advance(dt * 1.3); else go(); sc.begin(); MA.draw(sc, sw, { ground: 1.3, groundFill: 'rgba(200,230,215,0.06)', groundStroke: 'rgba(200,230,215,0.3)', colorOf: () => '#6aa8ec', size: 0.06, trails: false }); sc.draw(dt); }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'need', label: T('Comparar algoritmos\nde forma justa', 'Compare algorithms\nfairly'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>Faltan herramientas estandarizadas para comparar la generación de formaciones 3D y su control distribuido en precisión, comunicación y cómputo.</p>', '<p>Standard tools to compare 3D formation generation and its distributed control in accuracy, communication and computation are lacking.</p>') },
      { id: 'p1', label: T('Problema 1\ndiseño de la malla', 'Problem 1\nmesh design'), kind: 'method', x: 520, y: 75, mx: 310, my: 60, href: '#problema1', text: T('<p>Posiciones y distancias objetivo para N = 15 sobre una semiesfera de R = 1 m. Se evalúa con J₁.</p>', '<p>Positions and target distances for N = 15 over a hemisphere of R = 1 m. Evaluated with J₁.</p>') },
      { id: 'p2', label: T('Problema 2\ncontrol distribuido', 'Problem 2\ndistributed control'), kind: 'method', x: 890, y: 75, mx: 110, my: 170, href: '#problema2', text: T('<p>Llevar a los drones desde z = 0 hasta la formación con una ley que sólo use a los vecinos. Se evalúa con J₂.</p>', '<p>Take the drones from z = 0 to the formation with a law that only uses neighbours. Evaluated with J₂.</p>') },
      { id: 'j1', label: T('J₁: CPU, dispersión\ny energía', 'J₁: CPU, spread\nand energy'), kind: 'theory', x: 520, y: 260, mx: 310, my: 170, href: '#problema1', text: T('<p>\\(J_1 = \\lambda_1\\tau_{CPU} + \\lambda_2\\delta(d) + \\lambda_3E_d\\), con \\(\\lambda = (2.4283, 1.0, 0.0079)\\).</p>', '<p>\\(J_1 = \\lambda_1\\tau_{CPU} + \\lambda_2\\delta(d) + \\lambda_3E_d\\), with \\(\\lambda = (2.4283, 1.0, 0.0079)\\).</p>') },
      { id: 'j2', label: T('J₂: mensajes, cómputo\ny error', 'J₂: messages, compute\nand error'), kind: 'theory', x: 890, y: 260, mx: 110, my: 280, href: '#problema2', text: T('<p>Suma por agente de mensajes, ejecuciones del controlador, tiempo de establecimiento al 2 %, IAE e ITAE, con pesos (0.02, 0.1, 0.3, 0.1, 0.01).</p>', '<p>Per-agent sum of messages, controller executions, 2% settling time, IAE and ITAE, with weights (0.02, 0.1, 0.3, 0.1, 0.01).</p>') },
      { id: 'rp', label: T('Robotic Park\nROS 2 · Webots', 'Robotic Park\nROS 2 · Webots'), kind: 'method', x: 150, y: 260, mx: 310, my: 280, text: T('<p>Plantillas en MATLAB (<code>problem1.m</code>, <code>RP_benchmark.m</code>) y ROS 2 Humble con Webots; ensayos virtuales, físicos o híbridos con Crazyflie 2.1.</p>', '<p>MATLAB templates (<code>problem1.m</code>, <code>RP_benchmark.m</code>) and ROS 2 Humble with Webots; virtual, physical or hybrid runs with Crazyflie 2.1.</p>') },
      { id: 'rank', label: T('Ranking\nabierto', 'Open\nranking'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, href: '#ranking', text: T('<p>Los participantes envían sus resultados y se ordenan por J₁ y J₂.</p>', '<p>Participants submit their results, ranked by J₁ and J₂.</p>') }
    ],
    edges: [{ from: 'need', to: 'p1' }, { from: 'p1', to: 'p2', label: T('d*_ij', 'd*_ij') }, { from: 'p1', to: 'j1' }, { from: 'p2', to: 'j2' }, { from: 'rp', to: 'p1', bend: 0.1 }, { from: 'j1', to: 'rank' }, { from: 'j2', to: 'rank' }]
  }, { panel: $('#cmapPanel'), initial: 'p1' });

  /* Problema 1 */
  const sc1 = new IP.Scene3D($('#cv1'), { az: -35, el: 24, radius: 1.3, target: [0, 0, 1.3] });
  let P1 = null;
  const ctl1 = IP.controls($('#ctl1'), [
    { id: 'alg', type: 'select', label: T('Algoritmo de diseño', 'Design algorithm'), value: 'alg1', options: Object.keys(DESIGNS).map(k => ({ value: k, label: DESIGNS[k].name })) },
    { id: 'N', label: T('Número de agentes', 'Number of agents'), sym: 'N', min: 6, max: 40, step: 1, value: 15, digits: 0 }
  ], () => solve1());
  function solve1() {
    P1 = J1(ctl1.values.alg, Math.round(ctl1.values.N));
    const c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    $('#ro1').innerHTML = c('τ_CPU', P1.tau.toExponential(2).replace('.', IP.lang === 'en' ? '.' : ',') + ' s') + c('δ(d) = max − min', fmt(P1.delta, 3) + ' m') + c('E_d', fmt(P1.Ed, 1)) + c(T('Aristas', 'Edges'), String(P1.D.E.length)) + c('J₁', fmt(P1.J, 3), 'hl');
    best('p1', P1.J, `${DESIGNS[ctl1.values.alg].name} · N = ${Math.round(ctl1.values.N)}`);
  }
  IP.animate($('#cv1').parentElement, (dt) => {
    if (!P1) return; const { P, E } = P1.D, d = E.map(e => e[2]), lo = Math.min(...d), hi = Math.max(...d);
    sc1.begin();
    FORM.wire(FORM.surface('esfera', { R }), 5, 40).forEach(l => sc1.polyline(l.map(p => [p[0], p[1], p[2] + Z0]), { color: '--muted', width: 0.7, alpha: 0.3, zb: -1e3 }));
    E.forEach(([i, j, dd]) => sc1.line(P[i], P[j], { color: (dd - lo) / ((hi - lo) || 1) > 0.66 ? '--s2' : (dd - lo) / ((hi - lo) || 1) < 0.33 ? '--s3' : '--s1', width: 1.6 }));
    P.forEach(p => sc1.drone(p, { color: '--s1', size: 0.05 }));
    sc1.draw(dt);
  }).start();

  /* Problema 2 */
  const sc2 = new IP.Scene3D($('#cv2'), { az: -35, el: 22, radius: 1.4, target: [0, 0, 0.9] });
  const ctl2 = IP.controls($('#ctl2'), [
    { id: 'samp', type: 'select', label: T('Comunicación', 'Communication'), value: 'e2', options: [{ value: 'p50', label: T('Periódica 50 Hz', 'Periodic 50 Hz') }, { value: 'p10', label: T('Periódica 10 Hz', 'Periodic 10 Hz') }, { value: 'e1', label: T('Eventos δ = 1 cm', 'Events δ = 1 cm') }, { value: 'e2', label: T('Eventos δ = 2 cm', 'Events δ = 2 cm') }, { value: 'e4', label: T('Eventos δ = 4 cm', 'Events δ = 4 cm') }] },
    { id: 'fc', type: 'select', label: T('Frecuencia del controlador', 'Controller rate'), value: '10', options: [{ value: '10', label: '10 Hz' }, { value: '20', label: '20 Hz' }, { value: '50', label: '50 Hz' }] },
    { id: 'mu', label: T('Ganancia de formación', 'Formation gain'), sym: 'μ', min: 0.2, max: 3, step: 0.1, value: 1, digits: 1 },
    { id: 'ks', label: T('Ganancia de superficie', 'Surface gain'), sym: 'k_s', min: 0, max: 3, step: 0.1, value: 1, digits: 1 },
    { id: 'init', type: 'select', label: T('Condiciones iniciales', 'Initial conditions'), value: 'hover', options: [{ value: 'hover', label: T('Vuelo estacionario a z ≈ 1 m (benchmark)', 'Hover at z ≈ 1 m (benchmark)') }, { value: 'random', label: T('Aleatorias en el suelo (mínimos locales)', 'Random on the ground (local minima)') }], hint: T('La ley de gradiente sólo garantiza convergencia local: desde posiciones aleatorias puede quedar atrapada.', 'The gradient law only guarantees local convergence: from random positions it can get trapped.') }
  ]);
  let sw2 = null, D2 = DESIGNS.alg1.run(N0);
  function run2() {
    const v = ctl2.values, s = v.samp[0] === 'p' ? { mode: 'periodic', f: +v.samp.slice(1) } : { mode: 'event', delta: +v.samp.slice(1) / 100, fcheck: 50 };
    sw2 = new MA.Swarm({ agents: initial(D2, v.init, 9).map(p => ({ type: 'cf', p })), edges: D2.E, mu: v.mu, sphere: v.ks > 0 ? { R, c: [0, 0, Z0], k: v.ks, upper: true } : null, fc: +v.fc, sampling: s, tau: 0.3, vmax: 0.6, noise: 0.002, seed: 9 });
  }
  $('#run2').addEventListener('click', run2);
  run2();
  function J2(sw) {
    const h = sw.hist, dt = 0.05; let J = 0, ts = 0, iae = 0, itae = 0;
    sw.agents.forEach((_, i) => {
      const e = h.eAgent[i], e0 = Math.max(...e.slice(0, 3)) || 1e-9; let t = 0;
      for (let k = e.length - 1; k >= 0; k--) if (e[k] > 0.02 * e0) { t = h.t[k]; break; }
      const I = e.reduce((s, x) => s + x * dt, 0), IT = e.reduce((s, x, k) => s + x * h.t[k] * dt, 0);
      ts += t; iae += I; itae += IT;
      J += 0.02 * sw.msgs[i] + 0.1 * sw.execs[i] + 0.3 * t + 0.1 * I + 0.01 * IT;
    });
    return { J, ts: ts / sw.N, iae, itae, msgs: sw.msgs.reduce((a, b) => a + b, 0), execs: sw.execs.reduce((a, b) => a + b, 0) };
  }
  let saved = false;
  IP.animate($('#problema2'), (dt) => {
    if (!sw2) return;
    if (sw2.t < 20) { sw2.advance(Math.min(0.1, dt * 1.5)); saved = false; }
    sc2.begin(); MA.draw(sc2, sw2, { ground: 1.3, size: 0.06 }); sc2.draw(dt);
    $('#tt2').textContent = `t = ${fmt(sw2.t, 1)} / 20 s`;
    const r = J2(sw2), c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    $('#ro2').innerHTML = c('Σ n_m', String(r.msgs)) + c('Σ n_u', String(r.execs)) + c(T('t_s medio', 'mean t_s'), fmt(r.ts, 2) + ' s') + c('Σ IAE', fmt(r.iae, 2)) + c('Σ ITAE', fmt(r.itae, 1)) + c('J₂', sw2.t >= 19.95 ? fmt(r.J, 1) : '…', 'hl');
    if (sw2.t >= 19.95 && !saved) { saved = true; const v = ctl2.values; best('p2', r.J, `${v.init === 'random' ? '⚠ ' : ''}${v.samp[0] === 'p' ? v.samp.slice(1) + ' Hz' : 'δ = ' + v.samp.slice(1) + ' cm'} · ${v.fc} Hz · μ = ${fmt(v.mu, 1)} · k_s = ${fmt(v.ks, 1)}`); }
  }).start();

  /* Ranking local (sólo este navegador) */
  const KEY = 'rp-benchmark-ranking';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { p1: [], p2: [] }; } catch (e) { return { p1: [], p2: [] }; } };
  function best(p, J, desc) {
    const r = load(); if (!r[p].some(x => x.desc === desc && Math.abs(x.J - J) < 1e-9)) r[p].push({ J, desc });
    r[p].sort((a, b) => a.J - b.J); r[p] = r[p].slice(0, 5);
    try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { }
    show(r);
  }
  function show(r = load()) {
    const row = (p, x, i) => `<tr${i === 0 ? ' class="best"' : ''}><td>${p === 'p1' ? 'J₁' : 'J₂'} #${i + 1}</td><td style="text-align:left">${x.desc}</td><td class="num">${fmt(x.J, p === 'p1' ? 3 : 1)}</td></tr>`;
    $('#rank').innerHTML = `<thead><tr><th>${T('Puesto', 'Rank')}</th><th style="text-align:left">${T('Configuración', 'Configuration')}</th><th>J</th></tr></thead><tbody>` + r.p1.map((x, i) => row('p1', x, i)).join('') + r.p2.map((x, i) => row('p2', x, i)).join('') + '</tbody>';
  }
  $('#clear').addEventListener('click', () => { try { localStorage.removeItem(KEY); } catch (e) { } show(); });
  solve1(); show();

  IP.quiz($('#quizBox'), [
    { q: T('¿Qué mide δ(d) en J₁?', 'What does δ(d) measure in J₁?'), options: [T('La diferencia entre la distancia objetivo mayor y la menor: lo homogénea que es la malla', 'The difference between the largest and smallest target distance: how homogeneous the mesh is'), T('El tiempo de cálculo', 'The computation time'), T('El número de enlaces', 'The number of edges')], answer: 0, explain: T('Una malla con distancias parecidas reparte mejor a los agentes sobre la superficie.', 'A mesh with similar distances spreads the agents better over the surface.') },
    { q: T('Si cambias de periódico 50 Hz a eventos de 2 cm, ¿qué término de J₂ baja más?', 'Switching from periodic 50 Hz to 2 cm events, which J₂ term drops the most?'), options: [T('0,02·n_m (mensajes)', '0.02·n_m (messages)'), T('0,3·t_s', '0.3·t_s'), T('0,01·ITAE', '0.01·ITAE')], answer: 0, explain: T('Con eventos cada dron sólo publica cuando se mueve más de δ: los mensajes caen drásticamente una vez formada la semiesfera.', 'With events each drone only publishes when it moves more than δ: messages drop drastically once the hemisphere is formed.') },
    { q: T('¿Por qué el benchmark admite ejecuciones virtuales, físicas e híbridas?', 'Why does the benchmark accept virtual, physical and hybrid runs?'), options: [T('Para que cualquiera pueda participar en simulación y los mejores se validen con robots reales', 'So anyone can take part in simulation and the best are validated with real robots'), T('Porque Webots no funciona', 'Because Webots does not work'), T('Por normativa', 'Because of regulations')], answer: 0, explain: T('La misma interfaz ROS 2 (local_pose / goal_pose) sirve para los tres modos.', 'The same ROS 2 interface (local_pose / goal_pose) serves all three modes.') }
  ]);
})();
