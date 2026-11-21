/* Página interactiva: Scalability of CPS with real and virtual robots in ROS 2 (Sensors 2023) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t, V = MA.v;
  IP.page();

  // Experimentos del artículo: CF/KH totales y reales; RTF e IAE/ITAE de Gazebo y Webots (null = fallo)
  const EXP = {
    A: { N: 5, cf: 1, cfR: 1, kh: 4, khR: 4, rtf: [0.995, 0.977], iae: [0.4485, 0.3879], itae: [6.8471, 3.5558] },
    B: { N: 10, cf: 4, cfR: 4, kh: 6, khR: 4, rtf: [0.967, 0.977], iae: [0.3421, 0.2481], itae: [4.2980, 2.5427] },
    C: { N: 15, cf: 7, cfR: 5, kh: 8, khR: 4, rtf: [0.866, 0.962], iae: [0.4293, 0.3062], itae: [5.0444, 1.9985] },
    D: { N: 20, cf: 11, cfR: 6, kh: 9, khR: 4, rtf: [0.716, 0.941], iae: [0.4619, 0.3182], itae: [5.0498, 2.4613] },
    E: { N: 30, cf: 18, cfR: 6, kh: 12, khR: 4, rtf: [0.477, 0.831], iae: [0.5404, 0.3108], itae: [5.7722, 3.5415] },
    F: { N: 40, cf: 26, cfR: 6, kh: 14, khR: 4, rtf: [null, 0.563], iae: [null, 0.6511], itae: [null, 8.3456] }
  };
  const R = 2;
  /** Khepera en el anillo z = 0; Crazyflie repartidos en espiral de Fibonacci sobre el casquete superior; enlaces con los 4 vecinos más cercanos. */
  function formation(e) {
    const P = [], A = [];
    for (let k = 0; k < e.kh; k++) { const a = k / e.kh * 2 * Math.PI; P.push([R * Math.cos(a), R * Math.sin(a), 0]); A.push({ type: 'kh', real: k < e.khR }); }
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < e.cf; k++) { const z = R * (0.25 + 0.75 * (k + 0.5) / e.cf), r = Math.sqrt(R * R - z * z), a = k * ga; P.push([r * Math.cos(a), r * Math.sin(a), z]); A.push({ type: 'cf', real: k < e.cfR }); }
    const E = new Map();
    P.forEach((p, i) => P.map((q, j) => [V.norm(V.sub(p, q)), j]).filter(x => x[1] !== i).sort((a, b) => a[0] - b[0]).slice(0, 4).forEach(([d, j]) => { const k = i < j ? i + ',' + j : j + ',' + i; E.set(k, [Math.min(i, j), Math.max(i, j), d]); }));
    return { P, A, E: [...E.values()] };
  }
  function swarm(key, seed) {
    const F = formation(EXP[key]), rg = MA.rng(seed);
    const agents = F.A.map((a, i) => Object.assign({}, a, { p: a.type === 'kh' ? [F.P[i][0] * 0.6 + (rg.u() - 0.5) * 0.6, F.P[i][1] * 0.6 + (rg.u() - 0.5) * 0.6, 0] : [F.P[i][0] * 0.4 + (rg.u() - 0.5) * 0.8, F.P[i][1] * 0.4 + (rg.u() - 0.5) * 0.8, 0.6] }));
    return new MA.Swarm({ agents, edges: F.E, mu: 0.3, sphere: { R, c: [0, 0, 0], k: 0.15 }, fc: 10, sampling: { mode: 'event', delta: 0.02, fcheck: 50 }, tau: 0.3, vmax: 0.6, noise: 0.002, seed });
  }
  const col = (sw) => (i) => (sw.agents[i].type === 'cf' ? '--s1' : '--s2');

  /* Portada: 40 agentes */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -35, el: 22, radius: 2.4, target: [0, 0, 0.8], autoRotate: IP.reducedMotion() ? 0 : 8 });
    let seed = 2, sw = swarm('F', seed);
    IP.animate(cv.parentElement, (dt) => {
      if (sw.t < 16) sw.advance(dt * 1.5); else sw = swarm('F', ++seed);
      sc.begin(); MA.draw(sc, sw, { ground: 2.3, groundFill: 'rgba(200,230,215,0.06)', groundStroke: 'rgba(200,230,215,0.3)', trails: false, colorOf: (i) => (sw.agents[i].type === 'cf' ? '#6aa8ec' : '#f0a35f'), size: 0.1 }); sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'sc', label: T('Escalabilidad\nde los CPS', 'CPS\nscalability'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>Los sistemas ciberfísicos tienen cada vez más agentes; las herramientas de control y simulación deben escalar con ellos.</p>', '<p>Cyber-physical systems have ever more agents; control and simulation tools must scale with them.</p>') },
      { id: 'mr', label: T('Reales + virtuales\n(gemelos)', 'Real + virtual\n(twins)'), kind: 'method', x: 520, y: 75, mx: 310, my: 60, href: '#experimentos', text: T('<p>Cada robot real tiene su gemelo digital; además se añaden robots puramente virtuales que imitan a los reales. Todo en ROS 2 con <i>namespaces</i>.</p>', '<p>Each real robot has its digital twin; purely virtual robots imitating the real ones are added too. All in ROS 2 with namespaces.</p>') },
      { id: 'sims', label: 'Gazebo vs Webots', kind: 'theory', x: 890, y: 75, mx: 110, my: 170, href: '#resultados', text: T('<p>Dos simuladores de código abierto con distintos motores físicos (ODE, Bullet, DART… en Gazebo; ODE en Webots) y formatos de modelo (SDF/URDF frente a PROTO).</p>', '<p>Two open-source simulators with different physics engines (ODE, Bullet, DART… in Gazebo; ODE in Webots) and model formats (SDF/URDF vs PROTO).</p>') },
      { id: 'form', label: T('Formación rígida\nsemiesfera R = 2 m', 'Rigid formation\nhemisphere R = 2 m'), kind: 'theory', x: 150, y: 260, mx: 310, my: 170, href: '#experimentos', text: T('<p>Control por distancias con un término que lleva a cada agente a la semiesfera, evitación de colisiones con campos potenciales y muestreo por eventos evaluado a 50 Hz.</p>', '<p>Distance-based control with a term driving each agent to the hemisphere, potential-field collision avoidance and event-based sampling checked at 50 Hz.</p>') },
      { id: 'met', label: T('RTF · CPU ·\nIAE / ITAE', 'RTF · CPU ·\nIAE / ITAE'), kind: 'method', x: 520, y: 260, mx: 110, my: 280, href: '#resultados', text: T('<p>Factor de tiempo real, uso de CPU global y por proceso (psutil) y error de formación, de 5 a 50 agentes.</p>', '<p>Real-time factor, overall and per-process CPU usage (psutil) and formation error, from 5 to 50 agents.</p>') },
      { id: 'res', label: T('Webots hasta 40\nGazebo hasta 30', 'Webots up to 40\nGazebo up to 30'), kind: 'result', x: 890, y: 260, mx: 310, my: 280, href: '#resultados', text: T('<p>Webots mantiene mejor el RTF y gasta la mitad de CPU; Gazebo falla con 40 agentes. Ninguno soporta 50.</p>', '<p>Webots keeps RTF better and uses half the CPU; Gazebo fails at 40 agents. Neither handles 50.</p>') },
      { id: 'bat', label: T('RTF < 0,75 ⇒\nsin robots reales', 'RTF < 0.75 ⇒\nno real robots'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, text: T('<p>Con la batería de 3–5 min del Crazyflie, un simulador lento invalida la experiencia mixta.</p>', '<p>With the Crazyflie\'s 3–5 min battery, a slow simulator invalidates the mixed experiment.</p>') }
    ],
    edges: [{ from: 'sc', to: 'mr' }, { from: 'mr', to: 'sims' }, { from: 'form', to: 'met' }, { from: 'sims', to: 'met', bend: 0.1 }, { from: 'met', to: 'res' }, { from: 'res', to: 'bat' }, { from: 'sc', to: 'form', bend: 0 }]
  }, { panel: $('#cmapPanel'), initial: 'mr' });

  /* Experimento en vivo al RTF del simulador */
  const sc = new IP.Scene3D($('#cv'), { az: -35, el: 22, radius: 2.4, target: [0, 0, 0.8] });
  let simIdx = 1;
  IP.seg($('#simSeg'), [{ value: 0, label: 'Gazebo' }, { value: 1, label: 'Webots' }], simIdx, (v) => { simIdx = v; launch(); });
  const ctl = IP.controls($('#ctl'), [{ id: 'exp', type: 'select', label: T('Experimento', 'Experiment'), value: 'D', options: Object.keys(EXP).map(k => ({ value: k, label: `${k} · N = ${EXP[k].N} (${EXP[k].cfR + EXP[k].khR} ${T('reales', 'real')})` })) }], () => launch());
  let sw, treal = 0;
  function launch() { sw = swarm(ctl.values.exp, 3); treal = 0; }
  $('#run').addEventListener('click', launch);
  launch();
  IP.animate($('#experimentos'), (dt) => {
    const e = EXP[ctl.values.exp], rtf = e.rtf[simIdx];
    const warn = $('#warn');
    if (rtf === null) { warn.style.display = ''; warn.textContent = T('Gazebo no consiguió cargar los 40 modelos (timeout): el experimento F sólo pudo hacerse con Webots.', 'Gazebo could not load the 40 models (timeout): experiment F could only be run with Webots.'); }
    else { warn.style.display = rtf < 0.75 ? '' : 'none'; warn.textContent = T(`RTF = ${fmt(rtf, 3)} < 0,75: en un minuto real sólo se simulan ${fmt(60 * rtf, 0)} s. Con robots reales de 3–5 min de batería, la experiencia deja de ser válida.`, `RTF = ${fmt(rtf, 3)} < 0.75: one real minute only simulates ${fmt(60 * rtf, 0)} s. With real robots on a 3–5 min battery, the experiment is no longer valid.`); }
    if (rtf !== null && sw.t < 25) { treal += dt; sw.advance(Math.min(0.1, dt * rtf)); }
    sc.begin(); MA.draw(sc, sw, { ground: 2.3, trails: false, colorOf: col(sw), size: 0.1 }); sc.draw(dt);
    $('#treal').textContent = fmt(treal, 1) + ' s'; $('#tsim').textContent = fmt(sw.t, 1) + ' s';
    const c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`, s = ['Gazebo', 'Webots'][simIdx];
    $('#ro').innerHTML = c(T('Agentes CF + KH', 'Agents CF + KH'), `${e.cf} + ${e.kh}`) + c(T('Reales CF + KH', 'Real CF + KH'), `${e.cfR} + ${e.khR}`) +
      c('RTF ' + s, rtf === null ? T('fallo', 'failed') : fmt(rtf, 3), rtf === null || rtf < 0.75 ? 'bad' : 'hl') + c('IAE ' + s + T(' (artículo)', ' (paper)'), e.iae[simIdx] === null ? '—' : fmt(e.iae[simIdx], 4));
  }).start();

  /* Gráficas de resultados */
  const keys = Object.keys(EXP), xs = keys.map(k => EXP[k].N);
  const prtf = new IP.Plot($('#prtf'), { height: 240, xlabel: T('número de agentes N', 'number of agents N'), xname: 'N' });
  prtf.overlays = { hlines: [{ y: 0.75, color: '--danger', label: T('límite práctico 0,75', 'practical limit 0.75') }, { y: 1, color: '--muted', dash: [2, 3] }] };
  prtf.setSeries([{ name: 'Gazebo', color: '--s2', x: xs, y: keys.map(k => EXP[k].rtf[0] ?? NaN), width: 2.4 }, { name: 'Webots', color: '--s1', x: xs, y: keys.map(k => EXP[k].rtf[1]), width: 2.4 },
    { name: 'Gazebo', color: '--s2', x: xs, y: keys.map(k => EXP[k].rtf[0] ?? NaN), points: true, r: 4, nolegend: true, notip: true }, { name: 'Webots', color: '--s1', x: xs, y: keys.map(k => EXP[k].rtf[1]), points: true, r: 4, nolegend: true, notip: true }]);
  const piae = new IP.Plot($('#piae'), { height: 240, xlabel: T('número de agentes N', 'number of agents N'), xname: 'N' });
  piae.setSeries([{ name: 'Gazebo', color: '--s2', x: xs, y: keys.map(k => EXP[k].iae[0] ?? NaN), width: 2.4, digits: 4 }, { name: 'Webots', color: '--s1', x: xs, y: keys.map(k => EXP[k].iae[1]), width: 2.4, digits: 4 },
    { name: 'Gazebo', color: '--s2', x: xs, y: keys.map(k => EXP[k].iae[0] ?? NaN), points: true, r: 4, nolegend: true, notip: true }, { name: 'Webots', color: '--s1', x: xs, y: keys.map(k => EXP[k].iae[1]), points: true, r: 4, nolegend: true, notip: true }]);

  IP.quiz($('#quizBox'), [
    { q: T('Si el RTF es 0,5, ¿cuánto tiempo simulado transcurre en 2 minutos reales?', 'If RTF is 0.5, how much simulated time elapses in 2 real minutes?'), options: [T('1 minuto', '1 minute'), T('2 minutos', '2 minutes'), T('4 minutos', '4 minutes')], answer: 0, explain: T('RTF = t_simulado / t_real ⇒ 0,5 × 2 min = 1 min.', 'RTF = t_simulated / t_real ⇒ 0.5 × 2 min = 1 min.') },
    { q: T('¿Por qué un RTF bajo es especialmente grave en una experiencia con robots reales?', 'Why is a low RTF particularly serious in an experiment with real robots?'), options: [T('Porque los robots reales no pueden ralentizarse y su batería dura pocos minutos', 'Because real robots cannot slow down and their battery only lasts a few minutes'), T('Porque ROS 2 se desconecta', 'Because ROS 2 disconnects'), T('No es grave', 'It is not serious')], answer: 0, explain: T('Los agentes virtuales irían «a cámara lenta» respecto a los reales y la formación mixta perdería sentido.', 'The virtual agents would move in "slow motion" relative to the real ones and the mixed formation would make no sense.') },
    { q: T('¿Qué simulador escaló mejor en el estudio?', 'Which simulator scaled better in the study?'), options: ['Gazebo', 'Webots', T('Ninguno pasó de 10 agentes', 'Neither passed 10 agents')], answer: 1, explain: T('Webots llegó a 40 agentes (RTF 0,563) con menos de la mitad de CPU; Gazebo cayó a RTF 0,477 con 30 y falló con 40.', 'Webots reached 40 agents (RTF 0.563) with less than half the CPU; Gazebo dropped to RTF 0.477 at 30 and failed at 40.') }
  ]);
})();
