/* Página interactiva: Morphing de formaciones en sistemas multi-agente robóticos (Simposio CEA, Zaragoza 2026) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t;
  IP.page();

  const A0 = [1, 1, 1], S0 = FORM.surface('esfera', { R: 1 }), F = FORM.buildShield(S0, 14, { h0: 0.02 });
  const TM = 10, TEND = 30;
  const TG = {
    corridor: { l: T('Pasillo estrecho', 'Narrow corridor'), A: MORPH.TARGETS.corridor.A },
    ceiling: { l: T('Techo bajo', 'Low ceiling'), A: MORPH.TARGETS.ceiling.A },
    expand: { l: T('Cubrir más superficie', 'Cover more surface'), A: MORPH.TARGETS.expand.A }
  };
  const mk = (o) => new MORPH.Sim(Object.assign({ F, A0, tm: TM }, o));
  const surf = (A) => FORM.surface('elipsoide', { a: A[0], b: A[1], c: A[2] });

  function drawScene(sc, sim, o = {}) {
    const Acur = sim.axes(sim.s.reduce((a, b) => a + b, 0) / sim.N);
    FORM.wire(surf(Acur), 5, 40).forEach(l => sc.polyline(l, { color: '--border', width: 0.8, alpha: 0.75 }));
    if (o.target) FORM.wire(surf(sim.A1), 4, 40).forEach(l => sc.polyline(l, { color: '--accent', width: 0.7, alpha: 0.35 }));
    for (let k = -6; k <= 6; k++) { sc.line([k * 0.25, -1.5, 0], [k * 0.25, 1.5, 0], { color: '--border', width: 0.5, alpha: 0.35 }); sc.line([-1.5, k * 0.25, 0], [1.5, k * 0.25, 0], { color: '--border', width: 0.5, alpha: 0.35 }); }
    if (o.trails) sim.trails.forEach(tr => { if (tr.length > 1) sc.polyline(tr.slice(-120), { color: '--s3', width: 1, alpha: 0.35 }); });
    F.edges.forEach(([i, j], k) => {
      const d = sim.dstar(k, (sim.s[i] + sim.s[j]) / 2), e = Math.abs(MORPH.v.norm(MORPH.v.sub(sim.p[i], sim.p[j])) - d) / d;
      sc.line(sim.p[i], sim.p[j], { color: e > 0.1 ? '--s2' : '--s3', width: 1.2, alpha: 0.7 });
    });
    sim.p.forEach((q, i) => {
      const col = sim.s[i] < 0.02 ? '--s1' : sim.s[i] > 0.98 ? '--accent' : '--s4';
      sc.drone(q, { color: col, size: 0.055, alpha: i === sim.informed ? 0.7 : 0.3 });
      if (o.labels && i === sim.informed) sc.text(q, T('informado', 'informed'), { dy: -14, size: 10, color: '--s4' });
    });
  }

  /* Portada: bucle esfera → pasillo → esfera */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -35, el: 20, radius: 1.5, target: [0, 0, 0.45], autoRotate: IP.reducedMotion() ? 0 : 7 });
    const keys = ['corridor', 'ceiling', 'expand']; let n = 0, sim = mk({ A1: TG[keys[0]].A, mode: 'morph', Tm: 6 });
    IP.animate(cv.parentElement, (dt) => {
      sim.advance(Math.min(dt, 0.05) * 1.6);
      if (sim.t > 24) { n = (n + 1) % keys.length; sim = mk({ A1: TG[keys[n]].A, mode: 'morph', Tm: 6, seed: 3 + n }); }
      sc.begin(); drawScene(sc, sim); sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 720],
    nodes: [
      { id: 'prob', label: T('Entornos dinámicos\ny no estructurados', 'Dynamic, unstructured\nenvironments'), kind: 'problem', x: 160, y: 80, mx: 110, my: 60, text: T('<p>Obstáculos que se mueven, puntos de interés cambiantes u objetos deformables que transportar: una formación estática puede resultar ineficiente o quedarse bloqueada.</p>', '<p>Moving obstacles, changing points of interest or deformable objects to carry: a static formation may be inefficient or get blocked.</p>') },
      { id: 'prev', label: T('Conmutación,\nreconfiguración, mapping', 'Switching,\nreconfiguration, mapping'), kind: 'theory', x: 520, y: 80, mx: 310, my: 60, href: '#concepto', text: T('<p>Los enfoques previos saltan entre configuraciones discretas predefinidas o reasignan agentes a posiciones de una geometría transformada.</p>', '<p>Previous approaches jump between predefined discrete configurations or reassign agents to positions of a transformed geometry.</p>') },
      { id: 'morph', label: T('Morphing:\ntransición continua', 'Morphing:\ncontinuous transition'), kind: 'method', x: 880, y: 80, mx: 110, my: 180, href: '#concepto', text: T('<p>Transición continua y controlada entre geometrías que preserva la coherencia del grafo y los objetivos globales de la misión.</p>', '<p>A continuous, controlled transition between geometries that preserves graph coherence and the mission\'s global goals.</p>') },
      { id: 'ph1', label: T('Fase 1: formación\npor distancias', 'Phase 1: distance-\nbased formation'), kind: 'method', x: 330, y: 270, mx: 310, my: 180, href: '#simulador', text: T('<p>Los agentes convergen a una geometría con distancias precalculadas (controlador equivalente al de Guinaldo et al., 2024).</p>', '<p>The agents converge to a geometry with precomputed distances (a controller equivalent to Guinaldo et al., 2024).</p>') },
      { id: 'ph2', label: T('Fase 2: morphing\n+ consenso', 'Phase 2: morphing\n+ consensus'), kind: 'method', x: 710, y: 270, mx: 110, my: 300, href: '#simulador', text: T('<p>La geometría se modifica de forma distribuida; el consenso se adapta progresivamente a las nuevas distancias, con trayectorias continuas y sin configuraciones singulares.</p>', '<p>The geometry is changed in a distributed way; consensus adapts progressively to the new distances, with continuous trajectories and no singular configurations.</p>') },
      { id: 'ch', label: T('Retos: estabilidad,\ncohesión, convergencia', 'Challenges: stability,\ncohesion, convergence'), kind: 'result', x: 520, y: 440, mx: 310, my: 300, href: '#retos', text: T('<p>Objetivos variantes en el tiempo sin discontinuidades, evitación de obstáculos, límites dinámicos y de comunicación, y garantías de estabilidad.</p>', '<p>Time-varying goals without discontinuities, obstacle avoidance, dynamic and communication limits, and stability guarantees.</p>') },
      { id: 'next', label: T('Primer paso hacia\nmorphing avanzado', 'First step towards\nadvanced morphing'), kind: 'result', x: 880, y: 440, mx: 210, my: 420, text: T('<p>Trabajo conjunto de la UNED y el I3A (Universidad de Zaragoza), ilustrado con un ejemplo preliminar en MATLAB.</p>', '<p>Joint work between UNED and I3A (University of Zaragoza), illustrated with a preliminary MATLAB example.</p>') }
    ],
    edges: [{ from: 'prob', to: 'prev' }, { from: 'prev', to: 'morph', label: T('frente a', 'versus') }, { from: 'prob', to: 'ph1' }, { from: 'morph', to: 'ph2' }, { from: 'ph1', to: 'ph2' }, { from: 'ph2', to: 'ch' }, { from: 'ch', to: 'next' }]
  }, { panel: $('#cmapPanel'), initial: 'morph' });

  /* Enfoques */
  (function approaches() {
    const mini = (kind) => {
      const A = [[20, 60], [50, 30], [80, 60], [50, 80]], B = [[10, 50], [50, 45], [90, 50], [50, 58]];
      const poly = (P, c, dash = '') => `<polygon points="${P.map(p => p.join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/>` + P.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${c}"/>`).join('');
      if (kind === 'sw') return `<svg viewBox="0 0 260 100">${poly(A, 'var(--s1)')}<g transform="translate(150,0)">${poly(B, 'var(--accent)')}</g><text x="130" y="55" text-anchor="middle">⟶</text><text x="130" y="72" text-anchor="middle">${T('salto', 'jump')}</text></svg>`;
      if (kind === 'map') return `<svg viewBox="0 0 260 100">${poly(A, 'var(--s1)')}<g transform="translate(150,0)">${poly(B.slice(1).concat([B[0]]), 'var(--accent)')}</g><path d="M50,30 C100,0 160,10 200,45" fill="none" stroke="var(--s4)" stroke-dasharray="4 3"/><text x="130" y="94" text-anchor="middle">${T('reasignación', 'reassignment')}</text></svg>`;
      const mid = A.map((p, k) => [(p[0] + B[k][0]) / 2, (p[1] + B[k][1]) / 2]);
      return `<svg viewBox="0 0 300 100">${poly(A, 'var(--s1)')}<g transform="translate(100,0)">${poly(mid, 'var(--s4)', '4 3')}</g><g transform="translate(200,0)">${poly(B, 'var(--accent)')}</g><text x="150" y="96" text-anchor="middle">${T('continuo', 'continuous')}</text></svg>`;
    };
    const C = [
      ['sw', T('Topologías conmutadas / reconfiguración', 'Switching topologies / reconfiguration'), T('El sistema conmuta entre un conjunto discreto de configuraciones predefinidas cambiando los objetivos de control entre agentes (Liu et al., 2021).', 'The system switches among a discrete set of predefined configurations by changing the control goals between agents (Liu et al., 2021).')],
      ['map', 'Formation mapping', T('Reasigna los agentes a posiciones objetivo de una nueva geometría relacionada con la inicial por una transformación (Zhang et al., 2021).', 'Reassigns the agents to target positions in a new geometry related to the initial one by a transformation (Zhang et al., 2021).')],
      ['mo', 'Morphing', T('Pone el énfasis en la continuidad de la transición, con una perspectiva de control progresiva y orientada a la adaptación dinámica de la formación.', 'Emphasises the continuity of the transition, with a progressive control perspective aimed at the dynamic adaptation of the formation.')]
    ];
    $('#appr').innerHTML = C.map(c => `<div class="ip-card ${c[0] === 'mo' ? 'hl' : ''}" style="${c[0] === 'mo' ? 'border-color:var(--primary)' : ''}"><h3>${c[1]}</h3>${mini(c[0])}<p class="ip-small">${c[2]}</p></div>`).join('');
    // perfil s(t)
    const pl = new IP.Plot($('#sp'), { height: 220, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
    const t = [], q = [], dq = [], st = [];
    for (let k = 0; k <= 400; k++) { const x = 6 + k * 0.035; t.push(x); q.push(MORPH.quintic((x - TM) / 8)); dq.push(8 * (MORPH.quintic((x + 0.01 - TM) / 8) - MORPH.quintic((x - 0.01 - TM) / 8)) / 0.02); st.push(x < TM ? 0 : 1); }
    pl.setSeries([{ name: T('conmutación', 'switching'), color: '--s2', x: t, y: st, width: 2, step: true }, { name: 's (morphing)', color: '--s1', x: t, y: q, width: 2.2 }, { name: T('ṡ · T_m (morphing)', 'ṡ · T_m (morphing)'), color: '--s4', x: t, y: dq, width: 1.6, dash: [5, 4] }]);
  })();

  /* Simulador */
  const sc = new IP.Scene3D($('#cv'), { az: -35, el: 22, radius: 1.55, target: [0, 0, 0.45] });
  const ps = new IP.Plot($('#ps'), { height: 220, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', ylim: [-0.05, 1.08] });
  const pu = new IP.Plot($('#pu'), { height: 220, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', yunit: 'm/s' });
  const pe = new IP.Plot($('#pe'), { height: 230, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  let mode = 'morph';
  IP.seg($('#modeSeg'), [{ value: 'morph', label: 'Morphing' }, { value: 'switch', label: T('Conmutación', 'Switching') }], mode, (v) => { mode = v; launch(); });
  const ctl = IP.controls($('#ctl'), [
    { id: 'tg', type: 'select', label: T('Nueva geometría', 'New geometry'), value: 'corridor', options: Object.keys(TG).map(k => ({ value: k, label: TG[k].l })) },
    { id: 'Tm', label: T('Duración de la transición', 'Transition time'), sym: 'T_m', min: 2, max: 14, step: 1, value: 8, unit: 's', digits: 0 },
    { id: 'gamma', label: T('Ganancia de consenso', 'Consensus gain'), sym: 'γ', min: 0.5, max: 10, step: 0.5, value: 4, digits: 1 },
    { id: 'speed', label: T('Velocidad de reproducción', 'Playback speed'), min: 0.5, max: 4, step: 0.5, value: 1.5, unit: '×', digits: 1 }
  ], (id) => { if (id !== 'speed') launch(); });
  let sim, other;
  function launch() {
    const v = ctl.values, o = { A1: TG[v.tg].A, Tm: v.Tm, gamma: v.gamma };
    sim = mk(Object.assign({ mode }, o));
    other = mk(Object.assign({ mode: mode === 'morph' ? 'switch' : 'morph' }, o)); other.advance(TEND);
    summary();
  }
  $('#run').addEventListener('click', launch);
  function summary() {
    const v = ctl.values, o = { A1: TG[v.tg].A, Tm: v.Tm, gamma: v.gamma };
    const M = mode === 'morph' ? (() => { const s = mk(Object.assign({ mode: 'morph' }, o)); s.advance(TEND); return s; })() : other, Sw = mode === 'switch' ? (() => { const s = mk(Object.assign({ mode: 'switch' }, o)); s.advance(TEND); return s; })() : other;
    const m = M.summary(), w = Sw.summary(), c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    $('#ro').innerHTML = `<p class="ip-small" style="grid-column:1/-1;margin:0"><b>${T('Tras t_m', 'After t_m')}:</b> morphing · ${T('conmutación', 'switching')}</p>` +
      c(T('Pico de ‖u‖ (m/s)', 'Peak ‖u‖ (m/s)'), `${fmt(m.umPeak, 2)} · ${fmt(w.umPeak, 2)}`, 'hl') + c(T('Pico de error de distancias (m)', 'Peak distance error (m)'), `${fmt(m.edPeak, 2)} · ${fmt(w.edPeak, 2)}`) +
      `<p class="ip-small ip-muted" style="grid-column:1/-1;margin:4px 0 0">${T('Con conmutación, la acción de control se satura (límite 0,8 m/s) y la formación se deforma mucho más durante la transición. Con morphing, el error sigue a la geometría que cambia.', 'With switching, the control action saturates (0.8 m/s limit) and the formation deforms much more during the transition. With morphing, the error tracks the changing geometry.')}</p>`;
  }
  launch();
  IP.animate($('#simulador'), (dt) => {
    if (sim.t < TEND) sim.advance(Math.min(dt, 0.05) * ctl.values.speed);
    sc.begin(); drawScene(sc, sim, { target: true, labels: mode === 'morph', trails: true }); sc.draw(dt);
    const ph = sim.t < TM ? T('fase 1 · formación', 'phase 1 · formation') : T('fase 2 · ', 'phase 2 · ') + (mode === 'morph' ? 'morphing' : T('conmutación', 'switching'));
    $('#tt').textContent = `t = ${fmt(sim.t, 1)} s · ${ph}`;
    const h = sim.hist, ho = other.hist, n = ho.t.findIndex(t => t > sim.t), cut = n < 0 ? ho.t.length : n;
    [ps, pu, pe].forEach(p => { p.opts.xlim = [0, TEND]; p.overlays = { vlines: [{ x: TM, color: '--muted', label: 't_m' }] }; });
    ps.setSeries(h.s.map((s, i) => ({ name: i === 0 ? T('drones s_i', 'drones s_i') : '', nolegend: i > 0, color: i === sim.informed ? '--s4' : '--s3', x: h.t, y: s, width: i === sim.informed ? 2.4 : 1 })).concat([{ name: T('perfil s(t)', 'profile s(t)'), color: '--s2', x: h.t, y: h.sref, width: 1.6, dash: [5, 4] }]));
    pu.setSeries([{ name: mode === 'morph' ? 'Morphing' : T('Conmutación', 'Switching'), color: '--s1', x: h.t, y: h.umax, width: 2 }, { name: mode === 'morph' ? T('Conmutación', 'Switching') : 'Morphing', color: '--muted', x: ho.t.slice(0, cut), y: ho.umax.slice(0, cut), width: 1.4, dash: [5, 4] }]);
    pe.setSeries([{ name: T('distancias', 'distances'), color: '--s3', x: h.t, y: h.ed, width: 2 }, { name: T('superficie', 'surface'), color: '--s1', x: h.t, y: h.es, width: 2 }, { name: T('distancias (otro modo)', 'distances (other mode)'), color: '--muted', x: ho.t.slice(0, cut), y: ho.ed.slice(0, cut), width: 1.3, dash: [5, 4] }]);
  }).start();

  /* Retos */
  $('#chal').innerHTML = [
    [T('Objetivos variantes en el tiempo', 'Time-varying goals'), T('Guiar la evolución de la formación sin introducir discontinuidades en las señales de control. En el simulador: el perfil s(t) y el consenso sobre s_i.', 'Guide the formation\'s evolution without introducing discontinuities in the control signals. In the simulator: the s(t) profile and the consensus on s_i.')],
    [T('Evitación de obstáculos', 'Obstacle avoidance'), T('La nueva geometría debe alcanzarse sin colisiones con el entorno ni entre agentes. No se modela en esta página.', 'The new geometry must be reached with no collisions with the environment or between agents. Not modelled on this page.')],
    [T('Límites dinámicos y de comunicación', 'Dynamic and communication limits'), T('Velocidades máximas, saturación de actuadores y retardos o pérdidas en la red. En el simulador: saturación de 0,8 m/s.', 'Maximum speeds, actuator saturation and network delays or losses. In the simulator: 0.8 m/s saturation.')],
    [T('Estabilidad, cohesión y convergencia', 'Stability, cohesion and convergence'), T('Garantizar que el grupo no se separa y converge a la nueva geometría evitando configuraciones singulares y deformaciones no deseadas.', 'Guarantee that the group stays together and converges to the new geometry, avoiding singular configurations and unwanted deformations.')]
  ].map(([a, b]) => `<div class="ip-card"><b>${a}</b><span class="ip-small">${b}</span></div>`).join('');

  IP.quiz($('#quizBox'), [
    { q: T('¿En qué se diferencia el morphing de la reconfiguración por topologías conmutadas?', 'How does morphing differ from reconfiguration by switching topologies?'), options: [T('El morphing es una transición continua; la conmutación salta entre configuraciones discretas', 'Morphing is a continuous transition; switching jumps between discrete configurations'), T('El morphing cambia el número de agentes', 'Morphing changes the number of agents'), T('No hay diferencia', 'There is no difference')], answer: 0, explain: T('El morphing preserva la coherencia del grafo y evita discontinuidades en las consignas.', 'Morphing preserves graph coherence and avoids discontinuities in the setpoints.') },
    { q: T('¿Qué condiciones iniciales usa la fase 2 de la Figura 1?', 'Which initial conditions does phase 2 in Figure 1 use?'), options: [T('Las posiciones finales de la fase 1', 'The final positions of phase 1'), T('Posiciones aleatorias', 'Random positions'), T('Todos los agentes en el suelo', 'All agents on the ground')], answer: 0, explain: T('Primero se alcanza la geometría con distancias precalculadas; después se transforma desde ahí.', 'First the geometry with precomputed distances is reached; then it is transformed from there.') },
    { q: T('En el simulador, ¿qué pasa con la acción de control al conmutar bruscamente?', 'In the simulator, what happens to the control action with abrupt switching?'), options: [T('Aparece un pico enorme que satura los actuadores', 'A huge spike appears that saturates the actuators'), T('Se hace cero', 'It becomes zero'), T('Es igual que con morphing', 'It is the same as with morphing')], answer: 0, explain: T('Todas las distancias deseadas cambian a la vez, así que el error (y la ley de control, cuadrática en él) se dispara.', 'All desired distances change at once, so the error (and the control law, quadratic in it) spikes.') },
    { q: T('¿Para qué sirve el consenso sobre s_i?', 'What is the consensus on s_i for?'), options: [T('Para que todos los agentes avancen la transición a la vez aunque sólo uno conozca el perfil', 'So that all agents progress through the transition together even if only one knows the profile'), T('Para elegir al líder', 'To choose the leader'), T('Para medir la batería', 'To measure the battery')], answer: 0, explain: T('Es una forma distribuida de sincronizar la transición: cada agente sólo habla con sus vecinos.', 'It is a distributed way to synchronise the transition: each agent only talks to its neighbours.') }
  ]);
})();
