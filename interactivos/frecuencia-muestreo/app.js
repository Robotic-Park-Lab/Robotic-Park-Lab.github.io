/* Página interactiva: Análisis de la frecuencia de muestreo en sistemas multi-robot (JA 2023) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t;
  IP.page();

  // Tabla 1 del artículo: caso → [t_e (s), periodo medio T (s), IEA, IEAT]
  const T1 = {
    'p50': [7.72, 0.020, 32.3685, 70.190], 'p40': [7.64, 0.025, 32.3794, 69.6588], 'p33': [6.54, 0.030, 32.4426, 73.8772], 'p20': [7.58, 0.050, 33.0321, 74.3059],
    'p10': [6.59, 0.100, 32.2444, 72.0423], 'p5': [7.89, 0.200, 32.7242, 74.6127], 'p1': [7.26, 1.000, 36.1560, 87.5696], 'p0.5': [8.19, 2.000, 43.5029, 114.3360],
    'e1': [6.98, 0.097, 31.1275, 65.3618], 'e2': [7.32, 0.187, 32.2453, 72.0034], 'e4': [8.48, 0.408, 31.8367, 70.9773], 'e6': [10.53, 0.636, 32.6532, 75.9826], 'e8': [10.27, 0.925, 34.7546, 84.1132]
  };
  const CASES = Object.keys(T1);
  const label = (k) => (k[0] === 'p' ? k.slice(1).replace('.', IP.lang === 'en' ? '.' : ',') + ' Hz' : k.slice(1) + ' cm');

  // Formación: 0 = origen virtual, 1 = CF01 (arriba), 2–5 = anillo CF02–CF05
  function swarm(sampling, seed) {
    const A = [{ type: 'origin', p: [0, 0, 0], name: 'O' }, { type: 'cf', p: [0, 0, 0], name: 'CF01' }];
    for (let k = 0; k < 4; k++) A.push({ type: 'cf', p: [0, 0, 0], name: 'CF0' + (k + 2) });
    const R = MA.rng(seed); A.forEach((a, i) => { if (i) a.p = [(R.u() - 0.5) * 2.4, (R.u() - 0.5) * 2.4, 0.7]; });
    const E = []; for (let k = 0; k < 4; k++) { E.push([1, 2 + k, 0.70]); E.push([2 + k, 2 + (k + 1) % 4, 0.70]); E.push([0, 2 + k, 1.0]); } E.push([0, 1, 1.37]);
    return new MA.Swarm({ agents: A, edges: E, mu: 1, fc: 10, sampling, tau: 0.3, vmax: 0.6, noise: 0.002, seed });
  }
  const sampOf = (k) => (k[0] === 'p' ? { mode: 'periodic', f: parseFloat(k.slice(1)) } : { mode: 'event', delta: parseFloat(k.slice(1)) / 100, fcheck: 50 });

  /* Portada */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -35, el: 22, radius: 1.25, target: [0, 0, 0.75], autoRotate: IP.reducedMotion() ? 0 : 8 });
    let sw = swarm({ mode: 'event', delta: 0.02 }, 2), seed = 2;
    IP.animate(cv.parentElement, (dt) => {
      if (sw.t < 12) sw.advance(dt); else { seed++; sw = swarm({ mode: 'event', delta: 0.02 }, seed); }
      sc.begin(); MA.draw(sc, sw, { ground: 1.1, groundFill: 'rgba(200,230,215,0.06)', groundStroke: 'rgba(200,230,215,0.3)', colorOf: (i) => (i ? '#6aa8ec' : '#a9bdb2'), size: 0.07 }); sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'res', label: T('Batería y\nancho de banda', 'Battery and\nbandwidth'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>Comunicar a alta frecuencia gasta canal y batería; en un enjambre el problema crece con el número de agentes.</p>', '<p>High-rate communication uses up channel and battery; in a swarm the problem grows with the number of agents.</p>') },
      { id: 'form', label: T('Formación por\ndistancias', 'Distance-based\nformation'), kind: 'theory', x: 520, y: 75, mx: 310, my: 60, href: '#formacion', text: T('<p>Grafo con 5 drones y un nodo virtual en el origen; cada enlace impone una distancia objetivo.</p>', '<p>Graph with 5 drones and a virtual node at the origin; each edge imposes a target distance.</p>') },
      { id: 'hier', label: T('Control\njerárquico', 'Hierarchical\ncontrol'), kind: 'theory', x: 890, y: 75, mx: 110, my: 170, text: T('<p>Coordinación fuera de placa en ROS 2 Humble; posición a 100 Hz y actitud a 500 Hz a bordo de cada Crazyflie.</p>', '<p>Off-board coordination in ROS 2 Humble; position at 100 Hz and attitude at 500 Hz on board each Crazyflie.</p>') },
      { id: 'per', label: T('Barrido periódico\n0,5–50 Hz', 'Periodic sweep\n0.5–50 Hz'), kind: 'method', x: 150, y: 260, mx: 310, my: 170, href: '#simulador', text: T('<p>Ocho frecuencias. A partir de 10 Hz el desempeño es prácticamente el mismo; a 1 Hz el IEA crece un 11 % y a 0,5 Hz un 34 %.</p>', '<p>Eight frequencies. From 10 Hz up performance is practically the same; at 1 Hz IAE grows 11% and at 0.5 Hz 34%.</p>') },
      { id: 'ev', label: T('Send-on-delta\nδ = 1…8 cm', 'Send-on-delta\nδ = 1…8 cm'), kind: 'method', x: 520, y: 260, mx: 110, my: 280, href: '#simulador', text: T('<p>Cada dron sólo publica cuando se ha movido más de δ desde el último envío.</p>', '<p>Each drone only publishes when it has moved more than δ since its last message.</p>') },
      { id: 'opt', label: T('δ = 2 cm:\n−46,7 % mensajes', 'δ = 2 cm:\n−46.7% messages'), kind: 'result', x: 890, y: 260, mx: 310, my: 280, href: '#resultados', text: T('<p>Mismo desempeño que la referencia periódica de 10 Hz (variación &lt; 5 %) con casi la mitad de mensajes. Con 4 cm: −75,5 %.</p>', '<p>Same performance as the 10 Hz periodic reference (variation &lt; 5%) with almost half the messages. With 4 cm: −75.5%.</p>') },
      { id: 'next', label: T('Ampliación\nRIAI 2024', 'Extension\nRIAI 2024'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, href: '../muestreo-comunicacion/', text: T('<p>El estudio se amplía a un sistema heterogéneo con robots terrestres Khepera IV y tres arquitecturas de control.</p>', '<p>The study is extended to a heterogeneous system with Khepera IV ground robots and three control architectures.</p>') }
    ],
    edges: [{ from: 'res', to: 'per', label: T('se estudia', 'studied') }, { from: 'form', to: 'per' }, { from: 'form', to: 'ev' }, { from: 'hier', to: 'form', bend: 0.15 }, { from: 'per', to: 'ev', label: T('10 Hz ref.', '10 Hz ref.') }, { from: 'ev', to: 'opt' }, { from: 'opt', to: 'next' }]
  }, { panel: $('#cmapPanel'), initial: 'ev' });

  /* Simulador en vivo */
  const sc = new IP.Scene3D($('#cv'), { az: -35, el: 22, radius: 1.25, target: [0, 0, 0.75] });
  const pe = new IP.Plot($('#pe'), { height: 220, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  const pm = new IP.Plot($('#pm'), { height: 220, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  const ctl = IP.controls($('#ctl'), [
    { id: 'case', type: 'select', label: T('Caso del artículo', 'Paper case'), value: 'e2', options: CASES.map(k => ({ value: k, label: (k[0] === 'p' ? T('Periódico ', 'Periodic ') : T('Eventos δ = ', 'Events δ = ')) + label(k) })) },
    { id: 'speed', type: 'select', label: T('Reproducción', 'Playback'), value: '1', options: [{ value: '1', label: '×1' }, { value: '2', label: '×2' }] }
  ], () => launch());
  let sw = null, ref = null, seed = 3;
  function launch(newSeed) {
    if (newSeed) seed++;
    sw = swarm(sampOf(ctl.values.case), seed);
    ref = swarm({ mode: 'periodic', f: 10 }, seed); ref.advance(16);       // referencia de 10 Hz con las mismas condiciones
  }
  $('#run').addEventListener('click', () => launch(true));
  launch();
  IP.animate($('#simulador'), (dt) => {
    if (!sw) return;
    if (sw.t < 16) sw.advance(Math.min(0.1, dt * parseFloat(ctl.values.speed)));
    sc.begin(); MA.draw(sc, sw, { ground: 1.1, labels: true, size: 0.07 }); sc.draw(dt);
    $('#tt').textContent = `t = ${fmt(sw.t, 1)} s`;
    pe.opts.xlim = pm.opts.xlim = [0, 16];
    pe.setSeries([{ name: T('referencia 10 Hz', '10 Hz reference'), color: '--s5', x: ref.hist.t, y: ref.hist.e, width: 1.6, dash: [5, 4] }, { name: label(ctl.values.case), color: '--s1', x: sw.hist.t, y: sw.hist.e, width: 2.2, unit: 'm' }]);
    pm.setSeries([{ name: T('referencia 10 Hz', '10 Hz reference'), color: '--s5', x: ref.hist.t, y: ref.hist.msgs, width: 1.6, dash: [5, 4] }, { name: label(ctl.values.case), color: '--s1', x: sw.hist.t, y: sw.hist.msgs, width: 2.2 }]);
    const m = sw.metrics(0.05), mr = ref.metrics(0.05), P = T1[ctl.values.case];
    const c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    $('#ro').innerHTML = c(T('Mensajes', 'Messages'), `${m.msgs}`) + c(T('vs. 10 Hz', 'vs. 10 Hz'), (m.msgs <= mr.msgs ? '−' : '+') + fmt(Math.abs(100 * (1 - m.msgs / mr.msgs)), 1) + ' %', 'hl') +
      c(T('Periodo medio T', 'Mean period T'), fmt(m.Tmean, 3) + ' s') + c(T('IEA (sim.)', 'IAE (sim.)'), fmt(m.iae, 2)) + c(T('IEA vs. 10 Hz', 'IAE vs. 10 Hz'), (m.iae >= mr.iae ? '+' : '−') + fmt(Math.abs(100 * (m.iae / mr.iae - 1)), 1) + ' %') +
      c(T('IEA artículo', 'Paper IAE'), fmt(P[2], 2));
  }).start();

  /* Barras: IEA del artículo y de la simulación (normalizados a 10 Hz) */
  function bars(sim) {
    const W = 760, H = 270, ml = 44, mb = 40, mt = 14, pw = W - ml - 16, ph = H - mt - mb, gw = pw / CASES.length;
    const ref = T1.p10[2], vals = CASES.map(k => T1[k][2] / ref), sv = sim ? CASES.map(k => sim[k] / sim.p10) : null;
    const ymax = Math.max(1.5, ...vals, ...(sv || [])) * 1.05;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    [0, 0.5, 1, 1.5, 2, 2.5, 3].filter(y => y <= ymax).forEach(y => { const py = mt + ph - y / ymax * ph; s += `<line x1="${ml}" x2="${W - 16}" y1="${py}" y2="${py}" stroke="var(--grid)"/><text x="${ml - 6}" y="${py + 4}" text-anchor="end">${fmt(y, 1)}</text>`; });
    const py1 = mt + ph - 1 / ymax * ph; s += `<line x1="${ml}" x2="${W - 16}" y1="${py1}" y2="${py1}" stroke="var(--accent)" stroke-dasharray="5 4"/>`;
    CASES.forEach((k, i) => {
      const x = ml + gw * i + gw * 0.15, bw = sim ? gw * 0.33 : gw * 0.7, h = vals[i] / ymax * ph;
      s += `<rect x="${x}" y="${mt + ph - h}" width="${bw}" height="${h}" rx="3" fill="var(--s3)"><title>${label(k)}: IEA ${fmt(T1[k][2], 2)}</title></rect>`;
      if (sim) { const h2 = sv[i] / ymax * ph; s += `<rect x="${x + bw + 3}" y="${mt + ph - h2}" width="${bw}" height="${h2}" rx="3" fill="var(--s1)"><title>${T('simulación', 'simulation')}: ${fmt(sv[i], 2)}</title></rect>`; }
      s += `<text x="${ml + gw * (i + 0.5)}" y="${H - 22}" text-anchor="middle" style="font-weight:600">${label(k)}</text>`;
    });
    s += `<text x="12" y="${mt + ph / 2}" transform="rotate(-90 12 ${mt + ph / 2})" text-anchor="middle">IEA / IEA(10 Hz)</text></svg>`;
    s += `<div class="ip-legend"><span><i style="background:var(--s3)"></i>${T('Artículo (Tabla 1)', 'Paper (Table 1)')}</span>${sim ? `<span><i style="background:var(--s1)"></i>${T('Tu simulación', 'Your simulation')}</span>` : ''}<span>— ${T('referencia 10 Hz', '10 Hz reference')}</span></div>`;
    $('#bars').innerHTML = s;
  }
  bars(null); IP.onTheme(() => bars(null));
  $('#sweep').addEventListener('click', () => {
    const sim = {}; CASES.forEach(k => { const s = swarm(sampOf(k), 3); s.advance(16); sim[k] = s.metrics().iae; }); bars(sim);
  });

  IP.quiz($('#quizBox'), [
    { q: T('¿Por qué hace falta un nodo virtual en el origen?', 'Why is a virtual node at the origin needed?'), options: [T('Para anclar la formación: con sólo distancias entre drones podría trasladarse o girar libremente', 'To anchor the formation: with distances between drones only, it could translate or rotate freely'), T('Para que los drones tengan batería', 'So the drones have battery'), T('Para medir el ruido', 'To measure noise')], answer: 0, explain: T('Las distancias entre agentes definen la forma pero no la posición; las distancias al origen fijan dónde se construye la semiesfera.', 'Inter-agent distances define the shape but not the position; distances to the origin fix where the hemisphere is built.') },
    { q: T('A 1 Hz los drones siguen formando la semiesfera, pero ¿qué ocurre?', 'At 1 Hz the drones still form the hemisphere, but what happens?'), options: [T('Nada: es igual que 10 Hz', 'Nothing: it is the same as 10 Hz'), T('Usan posiciones de los vecinos de hasta 1 s de antigüedad y el error integrado crece', 'They use neighbour positions up to 1 s old and the integrated error grows'), T('Chocan siempre', 'They always crash')], answer: 1, explain: T('En el artículo el IEA crece un 11 % a 1 Hz y un 34 % a 0,5 Hz respecto a la referencia de 10 Hz.', 'In the paper IAE grows 11% at 1 Hz and 34% at 0.5 Hz relative to the 10 Hz reference.') },
    { q: T('¿Qué ventaja tiene δ = 2 cm frente a 10 Hz periódicos?', 'What is the advantage of δ = 2 cm over 10 Hz periodic?'), options: [T('Mayor precisión final', 'Higher final accuracy'), T('Casi la mitad de mensajes con un desempeño equivalente', 'Almost half the messages with equivalent performance'), T('Menos drones', 'Fewer drones')], answer: 1, explain: T('Los drones quietos dejan de publicar; sólo se comunica cuando hay información nueva relevante.', 'Hovering drones stop publishing; communication only happens when there is relevant new information.') }
  ]);
})();
