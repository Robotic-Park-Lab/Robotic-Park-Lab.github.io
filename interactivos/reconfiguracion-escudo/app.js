/* Página interactiva: Distributed reconfiguration of distance-based formations (ECC 2024) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t, V = FORM.v;
  IP.page();

  const EX = {
    ex1: { S: () => FORM.surface('esfera', { R: 10 }), N: 7, lose: [5], label: T('Ejemplo 1 · semiesfera R = 10, N = 7', 'Example 1 · hemisphere R = 10, N = 7') },
    ex2: { S: () => FORM.surface('elipsoide', { a: 10, b: 8, c: 7 }), N: 25, lose: [14, 19, 21], label: T('Ejemplo 2 · semielipsoide 10 × 8 × 7, N = 25', 'Example 2 · semi-ellipsoid 10 × 8 × 7, N = 25') }
  };
  const DELTA = 0.05;

  /** Etapa 1: quitar agentes, cerrar el hueco con sus vecinos y voltear aristas hasta Delaunay. */
  function repair(F, P, lost) {
    const keep = P.map((_, i) => i).filter(i => !lost.includes(i)), map = new Map(keep.map((i, k) => [i, k]));
    const oldE = F.edges.filter(([i, j]) => !lost.includes(i) && !lost.includes(j)).map(([i, j]) => [map.get(i), map.get(j)]);
    const has = new Set(oldE.map(([i, j]) => Math.min(i, j) + ',' + Math.max(i, j)));
    const added = [];
    lost.forEach(l => {
      // vecinos supervivientes ordenados por ángulo alrededor del agente perdido (plano tangente ≈ proyección radial)
      const nb = F.edges.filter(e => e.includes(l)).map(([i, j]) => (i === l ? j : i)).filter(i => !lost.includes(i));
      const c = P[l], n = V.mul(c, 1 / (V.norm(c) || 1)), ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const u = V.cross(n, ref), w = V.cross(n, u);
      const ord = nb.map(i => { const d = V.sub(P[i], c); return [Math.atan2(V.dot(d, w), V.dot(d, u)), i]; }).sort((a, b) => a[0] - b[0]).map(x => map.get(x[1]));
      const addE = (a, b) => { const k = Math.min(a, b) + ',' + Math.max(a, b); if (a !== b && !has.has(k)) { has.add(k); oldE.push([a, b]); added.push(k); } };
      for (let k = 0; k < ord.length; k++) addE(ord[k], ord[(k + 1) % ord.length]);       // contorno del hueco
      for (let k = 2; k < ord.length - 1; k++) addE(ord[0], ord[k]);                        // triangulación en abanico
    });
    const P2 = keep.map(i => P[i].slice());
    const dstar = oldE.map(([i, j]) => V.norm(V.sub(P2[i], P2[j])));
    const nbL = P2.map(() => []); oldE.forEach(([i, j], k) => { nbL[i].push([j, k]); nbL[j].push([i, k]); });
    const adj = P2.map(() => new Set()); oldE.forEach(([i, j]) => { adj[i].add(j); adj[j].add(i); });
    const tri = []; oldE.forEach(([i, j]) => adj[i].forEach(k => { if (k > j && adj[j].has(k)) tri.push([i, j, k]); }));
    let F2 = Object.assign({}, F, { P: P2, edges: oldE, dstar, nb: nbL, tri, level: keep.map(i => F.level[i]) });
    const r = FORM.flipToDelaunay(F2); F2 = r.F;
    F2.added = new Set([...added, ...F2.edges.map(([i, j]) => Math.min(i, j) + ',' + Math.max(i, j)).filter(k => !F.edges.some(([a, b]) => { const ia = keep[+k.split(',')[0]], ib = keep[+k.split(',')[1]]; return (a === ia && b === ib) || (a === ib && b === ia); }))]);
    F2.flips = r.flips; F2.keep = keep;
    return F2;
  }

  /** Etapa 2: consenso de distancias (Metropolis) con disparo por eventos. */
  function consensus(sim, F, anchors) {
    const mu2 = F.dstar.map(d => d * d);
    let updates = 0;
    F.edges.forEach(([i, j], k) => {
      const d2 = V.dot(V.sub(sim.p[i], sim.p[j]), V.sub(sim.p[i], sim.p[j]));
      if (Math.abs(d2 - mu2[k]) > DELTA * mu2[k]) return;                       // evento: sólo si la arista está casi satisfecha
      const th = (a, b) => {
        if (anchors.has(a)) return 0;
        const others = F.nb[a].filter(([x]) => x !== b);
        const w = 1 / (F.nb[a].length + Math.max(F.nb[b].length, 1) - 1);
        return w * others.reduce((s, [, kk]) => s + (mu2[kk] - mu2[k]), 0);
      };
      if (anchors.has(i) && anchors.has(j)) return;
      const delta = th(i, j) + th(j, i);
      if (Math.abs(delta) > 1e-9) { mu2[k] = Math.max(1e-6, mu2[k] + 0.5 * delta); updates++; }
    });
    F.dstar = mu2.map(Math.sqrt);
    return updates;
  }

  /* Portada: bucle derribo + reconfiguración */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -35, el: 24, radius: 11, target: [0, 0, 3], autoRotate: IP.reducedMotion() ? 0 : 8 });
    const S = EX.ex2.S(), F0 = FORM.buildShield(S, 25, { h0: 0.2 });
    let F, sim, t = 0, fall = [];
    const start = () => { t = 0; F = null; sim = null; fall = EX.ex2.lose.map(i => ({ i, p: F0.P[i].slice() })); };
    start();
    IP.animate(cv.parentElement, (dt) => {
      t += dt;
      if (t > 1.5 && !F) { F = repair(F0, F0.P, EX.ex2.lose); sim = new FORM.Sim({ S, F, P0: F.P, law: 'ras', k1: 0.02, k2: 300, k3: 1e-3, eps: 0.15, dt: 0.01, fixed: new Set(F.P.map((_, i) => i).filter(i => F.level[i] === 0)) }); }
      if (sim && t < 14) { sim.advance(dt * 1.5); if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) consensus(sim, F, sim.fixed); }
      if (t > 16) start();
      fall.forEach(f => { if (t > 0.6) f.p[2] -= dt * 6; });
      sc.begin();
      FORM.wire(S, 5, 40).forEach(l => sc.polyline(l, { color: 'rgba(200,230,215,0.3)', width: 0.8, zb: -1e3 }));
      const PP = sim ? sim.p : F0.P, FF = F || F0;
      FF.edges.forEach(([i, j]) => sc.line(PP[i], PP[j], { color: F && F.added.has(Math.min(i, j) + ',' + Math.max(i, j)) ? '#f0a35f' : '#7fd1a8', width: 1.3, alpha: 0.85 }));
      PP.forEach((p, i) => { if (!F && EX.ex2.lose.includes(i)) return; sc.drone(p, { color: '#6aa8ec', size: 0.4, dot: 2.5, alpha: 0.3 }); });
      fall.forEach(f => { if (f.p[2] > -1) sc.drone(f.p, { color: '#ef7b6c', size: 0.45, dot: 3 }); });
      sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'loss', label: T('Pérdida de\nagentes', 'Loss of\nagents'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>Fallos o ataques eliminan algunos drones del escudo: quedan huecos, la topología deja de ser una triangulación y el reparto deja de ser uniforme.</p>', '<p>Failures or attacks remove some drones from the shield: holes appear, the topology is no longer a triangulation and the distribution is no longer uniform.</p>') },
      { id: 'hole', label: T('Reconexión\ndel hueco', 'Hole\nreconnection'), kind: 'method', x: 520, y: 75, mx: 310, my: 60, href: '#algoritmo', text: T('<p>Los vecinos del agente perdido intercambian \\(I_j = \\{p_j, \\mathcal N_j, \\mathcal T_j\\}\\) y se enlazan alrededor del hueco.</p>', '<p>The lost agent\'s neighbours exchange \\(I_j = \\{p_j, \\mathcal N_j, \\mathcal T_j\\}\\) and link up around the hole.</p>') },
      { id: 'flip', label: T('Lawson flip +\ntest de Delaunay', 'Lawson flip +\nDelaunay test'), kind: 'method', x: 890, y: 75, mx: 110, my: 170, href: '#algoritmo', text: T('<p>Mientras el determinante \\(|M_{ABCD}|\\) indique que un nodo cae dentro de la circunferencia de un triángulo, se voltea la arista compartida.</p>', '<p>While the determinant \\(|M_{ABCD}|\\) shows a node inside a triangle\'s circumcircle, the shared edge is flipped.</p>') },
      { id: 'anch', label: T('Anclas en z = 0\nmóviles arriba', 'Anchors at z = 0\nmobile above'), kind: 'theory', x: 150, y: 260, mx: 310, my: 170, text: T('<p>Los nodos del borde \\(\\mathcal N_F\\) mantienen sus distancias; los móviles \\(\\mathcal N_M\\) las adaptan.</p>', '<p>Border nodes \\(\\mathcal N_F\\) keep their distances; mobile nodes \\(\\mathcal N_M\\) adapt theirs.</p>') },
      { id: 'cons', label: T('Consenso de\ndistancias (EBC)', 'Distance\nconsensus (EBC)'), kind: 'method', x: 520, y: 260, mx: 110, my: 280, href: '#simulador', text: T('<p>Pesos de Metropolis y disparo <i>send-on-delta</i> relativo: una arista actualiza su objetivo cuando \\(|d^2-\\mu^2|\\le 0.05\\,\\mu^2\\).</p>', '<p>Metropolis weights and relative send-on-delta triggering: an edge updates its target when \\(|d^2-\\mu^2|\\le 0.05\\,\\mu^2\\).</p>') },
      { id: 'res', label: T('Reparto uniforme\nrecuperado', 'Uniform spread\nrecovered'), kind: 'result', x: 890, y: 260, mx: 310, my: 280, href: '#simulador', text: T('<p>Distancia media 5,43 frente a 5,49 de un diseño desde cero; todos los móviles sobre la superficie (\\(f \\le 0{,}025\\)).</p>', '<p>Mean distance 5.43 vs 5.49 for a from-scratch design; all mobile agents on the surface (\\(f \\le 0.025\\)).</p>') },
      { id: 'fut', label: T('Agentes\nmaliciosos', 'Malicious\nagents'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, text: T('<p>Trabajo futuro: impacto de agentes maliciosos, prueba de convergencia con muestreo asíncrono y validación experimental.</p>', '<p>Future work: impact of malicious agents, a convergence proof under asynchronous sampling and experimental validation.</p>') }
    ],
    edges: [{ from: 'loss', to: 'hole' }, { from: 'hole', to: 'flip' }, { from: 'flip', to: 'cons', bend: 0.1 }, { from: 'anch', to: 'cons' }, { from: 'cons', to: 'res' }, { from: 'res', to: 'fut' }, { from: 'loss', to: 'anch', bend: 0 }]
  }, { panel: $('#cmapPanel'), initial: 'flip' });

  /* Simulador */
  const sc = new IP.Scene3D($('#cv'), { az: -35, el: 26, radius: 11, target: [0, 0, 3] });
  const pd = new IP.Plot($('#pd'), { height: 230, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', legend: false, tooltip: false });
  const ph = new IP.Plot($('#hist'), { height: 170, xname: 'd', legend: true, tooltip: false });
  const ctl = IP.controls($('#ctl'), [{ id: 'ex', type: 'select', label: T('Caso', 'Case'), value: 'ex2', options: Object.keys(EX).map(k => ({ value: k, label: EX[k].label })) }], () => reset(true));
  let S, F0, lost, F, sim, stage, dh;
  function reset(useExample) {
    const e = EX[ctl.values.ex]; S = e.S(); F0 = FORM.buildShield(S, e.N, { h0: 0.02 * S.hmax });
    lost = useExample ? e.lose.slice() : []; F = null; sim = null; stage = lost.length ? 1 : 0; dh = { t: [], d: [] };
    const R = Math.max(S.prm.a || S.prm.R, S.prm.b || 0); sc.o.radius = R * 1.05; sc.o.target = [0, 0, S.hmax * 0.4];
    hist(F0.dstar, null); readouts();
  }
  function steps() { IP.$$('.ip-step', $('#steps')).forEach((s, i) => { s.classList.toggle('is-done', i < stage); s.classList.toggle('is-running', i === stage); }); }
  $('#cv').addEventListener('click', (ev) => {
    if (F) return;
    const i = sc.pick(ev.clientX, ev.clientY, F0.P, 18); if (i < 0 || F0.level[i] === 0) return;
    lost = lost.includes(i) ? lost.filter(x => x !== i) : [...lost, i]; stage = lost.length ? 1 : 0; readouts();
  });
  $('#go').addEventListener('click', () => {
    if (!lost.length) return;
    F = repair(F0, F0.P, lost); stage = 2;
    sim = new FORM.Sim({ S, F, P0: F.P, law: 'ras', k1: 0.02 * (10 / sc.o.radius) ** 2, k2: 300, k3: 1e-3, eps: 0.015 * S.hmax, dt: 0.01, fixed: new Set(F.P.map((_, i) => i).filter(i => F.level[i] === 0)) });
    dh = { t: [], d: F.edges.map(() => []) }; sim.updates = 0;
  });
  $('#reset').addEventListener('click', () => reset(true));
  function hist(d, d2) {
    const all = d2 ? d.concat(d2) : d, lo = Math.min(...all), hi = Math.max(...all), nb = 10, w = (hi - lo) / nb || 1;
    const bins = (arr) => { const h = new Array(nb).fill(0); arr.forEach(x => h[Math.min(nb - 1, Math.floor((x - lo) / w))]++); return h; };
    const xs = [], mk = (h) => { const y = []; h.forEach((c, k) => { xs.length < 2 * nb && xs.push(lo + k * w, lo + (k + 1) * w); y.push(c, c); }); return y; };
    const h1 = mk(bins(d)), series = [{ name: T('nominal', 'nominal'), color: '--s5', x: xs.slice(), y: h1, width: 2, step: true, fill: true }];
    if (d2) series.push({ name: T('reconfigurada', 'reconfigured'), color: '--s1', x: xs.slice(), y: mk(bins(d2)), width: 2.4, step: true });
    ph.setSeries(series);
  }
  function readouts() {
    const c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`, mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const fmax = sim ? Math.max(...sim.p.map((p, i) => (sim.fixed.has(i) ? 0 : Math.abs(S.f(p))))) : 0;
    $('#ro').innerHTML = c(T('Perdidos', 'Lost'), lost.length ? lost.map(i => i + 1).join(', ') : '—', lost.length ? 'bad' : '') + c(T('Aristas', 'Edges'), F ? `${F.edges.length} (+${F.added.size})` : String(F0.edges.length)) +
      c(T('Volteos (flips)', 'Flips'), F ? String(F.flips) : '—') + c(T('Media nominal', 'Nominal mean'), fmt(mean(F0.dstar), 2)) + c(T('Media actual', 'Current mean'), F ? fmt(mean(F.dstar), 2) : '—', F ? 'hl' : '') + c('max |f_S(p_i)|', sim ? fmt(fmax, 3) : '—');
    $('#stage').textContent = [T('Pulsa drones para derribarlos', 'Click drones to knock them out'), T('Listo para reconfigurar', 'Ready to reconfigure'), T('Restaurando topología…', 'Restoring topology…'), T('Consenso de distancias…', 'Distance consensus…'), T('Terminado', 'Done')][stage] || '';
    steps();
  }
  let acc = 0;
  IP.animate($('#simulador'), (dt) => {
    if (!F0) return;
    if (sim && sim.t < 30) {
      sim.advance(Math.min(0.1, dt * 2)); acc += dt * 2;
      if (sim.t > 1.5) { stage = 3; if (acc > 0.25) { acc = 0; sim.updates += consensus(sim, F, sim.fixed); } }
      dh.t.push(sim.t); F.edges.forEach(([i, j], k) => dh.d[k].push(V.norm(V.sub(sim.p[i], sim.p[j]))));
      if (sim.t >= 29.9) { stage = 4; hist(F0.dstar, F.dstar); }
      readouts();
    }
    sc.begin();
    FORM.drawScene(sc, { S, P: [], wireRings: 5, wireAlpha: 0.25 });
    const P = sim ? sim.p : F0.P, E = F ? F.edges : F0.edges;
    E.forEach(([i, j]) => sc.line(P[i], P[j], { color: F && F.added.has(Math.min(i, j) + ',' + Math.max(i, j)) ? '--s2' : '--s1', width: F && F.added.has(Math.min(i, j) + ',' + Math.max(i, j)) ? 2.4 : 1.3, alpha: 0.85 }));
    P.forEach((p, i) => { const anchor = (F ? F.level[i] : F0.level[i]) === 0; sc.drone(p, { color: !F && lost.includes(i) ? '--danger' : anchor ? '--s5' : '--s3', size: sc.o.radius * 0.035, dot: !F && lost.includes(i) ? 6 : 3 }); });
    sc.draw(dt);
    if (sim) { pd.opts.xlim = [0, 30]; pd.setSeries(dh.d.filter((_, k) => !(sim.fixed.has(F.edges[k][0]) && sim.fixed.has(F.edges[k][1]))).map((d, k) => ({ name: 'd' + k, color: ['--s1', '--s2', '--s3', '--s4'][k % 4], x: dh.t, y: d, width: 1 }))); }
  }).start();
  reset(true);

  IP.quiz($('#quizBox'), [
    { q: T('¿Por qué se voltean aristas (Lawson flip) tras reconectar el hueco?', 'Why are edges flipped (Lawson flip) after reconnecting the hole?'), options: [T('Porque la triangulación improvisada puede no ser de Delaunay y perder sus buenas propiedades (rigidez, triángulos bien formados)', 'Because the improvised triangulation may not be Delaunay and lose its good properties (rigidity, well-shaped triangles)'), T('Para reducir mensajes', 'To reduce messages'), T('Por estética', 'For looks')], answer: 0, explain: T('El test local |M_ABCD| > 0 detecta los triángulos que hay que corregir, y cada volteo sólo afecta a dos triángulos vecinos.', 'The local test |M_ABCD| > 0 detects the triangles to fix, and each flip only affects two neighbouring triangles.') },
    { q: T('¿Qué hacen los nodos ancla del borde z = 0?', 'What do the anchor nodes on the z = 0 border do?'), options: [T('No se mueven ni cambian sus distancias: fijan la base del escudo', 'They neither move nor change their distances: they fix the base of the shield'), T('Coordinan a todos los demás', 'They coordinate everyone else'), T('Sustituyen a los perdidos', 'They replace the lost ones')], answer: 0, explain: T('Sólo los nodos móviles adaptan sus distancias objetivo mediante el consenso.', 'Only mobile nodes adapt their target distances through consensus.') },
    { q: T('¿Cuándo actualiza una arista su distancia objetivo?', 'When does an edge update its target distance?'), options: [T('Periódicamente a 10 Hz', 'Periodically at 10 Hz'), T('Cuando su error cuadrático relativo es menor que δ = 5 %', 'When its relative squared error is below δ = 5%'), T('Nunca', 'Never')], answer: 1, explain: T('Es un disparo por eventos: la formación se adapta poco a poco, sin cambiar los objetivos mientras los drones aún se están moviendo mucho.', 'It is event-triggered: the formation adapts gradually, without changing targets while the drones are still moving a lot.') }
  ]);
})();
