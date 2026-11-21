/* Página interactiva: Desarrollo, control y evaluación de una plataforma robótica multi-agente heterogénea (III Simposio CEA, 2024) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t, V = FORM.v;
  IP.page();

  const PAPER = {
    zRed: { fixed: 65.77, adaptive: 93 },
    table1: [   // Id, N, reales, RTF Gazebo, RTF Webots, %CPU Gazebo, %CPU Webots
      ['A', 5, 5, 0.99, 0.97, 19, 14], ['B', 10, 8, 0.97, 0.97, 46, 26], ['C', 15, 9, 0.86, 0.96, 74, 33],
      ['D', 20, 10, 0.71, 0.94, 82, 68], ['E', 30, 10, 0.47, 0.83, 85, 74], ['F', 40, 10, null, 0.56, 100, 85]
    ],
    samp: [[T('Centralizada', 'Centralised'), 89], [T('Distribuida en ROS 2', 'Distributed in ROS 2'), 80], [T('Distribuida en microcontroladores', 'Distributed on microcontrollers'), 82]]
  };

  /* Formación de cinco drones hacia una semiesfera (ley (2)) */
  const R0 = 0.8, S = FORM.surface('esfera', { R: R0 });
  const h = 0.45 * R0, rr = Math.sqrt(R0 * R0 - h * h);
  const GOAL = [[0, 0, R0], ...[0, 1, 2, 3].map(k => [rr * Math.cos(k * Math.PI / 2), rr * Math.sin(k * Math.PI / 2), h])];
  const EDGES = []; for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) EDGES.push([i, j, V.norm(V.sub(GOAL[i], GOAL[j]))]);
  class Form {
    constructor(k1, k2, seed) {
      let s = seed * 9301 + 49297; const u = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      this.p = GOAL.map(() => [(u() - 0.5) * 1.4, (u() - 0.5) * 1.4, 0.05 + 0.25 * u()]);
      this.k1 = k1; this.k2 = k2; this.t = 0; this.tc = 0; this.u = this.p.map(() => [0, 0, 0]); this.failed = null; this.dead = null;
      this.hist = { t: [], ed: [], es: [] }; this.trails = this.p.map(q => [q.slice()]); this.rec();
    }
    step(dt) {
      if (this.t >= this.tc - 1e-9) {        // nivel superior: coordinación a 10 Hz
        this.tc += 0.1;
        this.u = this.p.map((pi, i) => {
          let u = [0, 0, 0];
          EDGES.forEach(([a, b, d]) => { if (a !== i && b !== i) return; const j = a === i ? b : a, z = V.sub(pi, this.p[j]); u = V.sub(u, V.mul(z, this.k1 * (V.dot(z, z) - d * d))); });
          if (this.k2) u = V.sub(u, V.mul(V.sub(pi, S.proj(pi).p), this.k2));
          const n = V.norm(u); return n > 0.5 ? V.mul(u, 0.5 / n) : u;
        });
      }
      this.p = this.p.map((q, i) => { const r = V.add(q, V.mul(this.u[i], dt)); r[2] = Math.max(0.02, r[2]); return r; });
      if (this.dead) { this.dead[2] = Math.max(0, this.dead[2] - 0.6 * dt); }
      this.t += dt;
      if (this.t - this.hist.t[this.hist.t.length - 1] >= 0.05) { this.rec(); this.p.forEach((q, i) => { const tr = this.trails[i]; if (V.norm(V.sub(q, tr[tr.length - 1])) > 0.01) tr.push(q.slice()); }); }
    }
    rec() {
      let ed = 0, es = 0; EDGES.forEach(([a, b, d]) => { ed += Math.abs(V.norm(V.sub(this.p[a], this.p[b])) - d); }); this.p.forEach(q => { es += Math.abs(V.norm(q) - R0); });
      this.hist.t.push(this.t); this.hist.ed.push(ed); this.hist.es.push(es);
    }
    fail(i) { if (this.failed !== null) return; this.failed = i; this.dead = this.p[i].slice(); this.failT = this.t; }
  }
  const COLS = ['--s1', '--s2', '--s3', '--s4', '--s5'];
  function drawForm(sc, F, o = {}) {
    const w = FORM.wire ? FORM.wire(S, 6, 40) : [];
    w.forEach(l => sc.polyline(l.filter(p => p[2] >= -1e-6), { color: '--border', width: 0.8, alpha: 0.7 }));
    for (let k = -4; k <= 4; k++) { sc.line([k * 0.25, -1, 0], [k * 0.25, 1, 0], { color: '--border', width: 0.5, alpha: 0.4 }); sc.line([-1, k * 0.25, 0], [1, k * 0.25, 0], { color: '--border', width: 0.5, alpha: 0.4 }); }
    EDGES.forEach(([a, b, d]) => { const bad = Math.abs(V.norm(V.sub(F.p[a], F.p[b])) - d) / d > 0.08; sc.line(F.p[a], F.p[b], { color: bad ? '--s2' : '--s3', width: 1.1, alpha: 0.55 }); });
    F.trails.forEach((tr, i) => { if (tr.length > 1) sc.polyline(tr, { color: COLS[i], width: 1, alpha: 0.45 }); });
    F.p.forEach((q, i) => {
      const twin = F.failed === i;
      sc.drone(q, { color: COLS[i], size: 0.06, alpha: twin ? 0.08 : 0.3 });
      if (o.labels) sc.text(q, twin ? T('gemelo', 'twin') : `${i + 1}`, { dy: -13, size: 10, color: COLS[i] });
    });
    if (F.dead) { sc.drone(F.dead, { color: '--muted', size: 0.06, alpha: 0.2 }); if (o.labels) sc.text(F.dead, T('real (fallo)', 'real (failed)'), { dy: 16, size: 10, color: '--muted' }); }
  }

  /* Portada */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -40, el: 22, radius: 1.1, target: [0, 0, 0.35], autoRotate: IP.reducedMotion() ? 0 : 8 });
    let seed = 3, F = new Form(0.6, 0.8, seed);
    IP.animate(cv.parentElement, (dt) => {
      if (F.t < 14) { for (let n = 0; n < 4; n++) F.step(Math.min(dt, 0.05) / 4 * 1.5); } else F = new Form(0.6, 0.8, ++seed);
      sc.begin(); drawForm(sc, F); sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 720],
    nodes: [
      { id: 'smar', label: T('Sistemas multi-agente\nrobóticos (SMAR)', 'Robotic multi-agent\nsystems (RMAS)'), kind: 'problem', x: 160, y: 80, mx: 110, my: 60, text: T('<p>Combinan robots (movimiento, interacción con el entorno) con agentes software (más capacidad de cómputo). Los heterogéneos son más flexibles que los homogéneos.</p>', '<p>They combine robots (motion, interaction with the environment) with software agents (more computing power). Heterogeneous ones are more flexible than homogeneous ones.</p>') },
      { id: 'rp', label: T('Robotic Park:\n6 propiedades', 'Robotic Park:\n6 properties'), kind: 'method', x: 520, y: 80, mx: 310, my: 60, href: '#plataforma', text: T('<p>Heterogeneidad, flexibilidad, interoperabilidad, elasticidad, diseño experimental accesible y modularidad, todo sobre ROS 2.</p>', '<p>Heterogeneity, flexibility, interoperability, elasticity, accessible experiment design and modularity, all on ROS 2.</p>') },
      { id: 'dt', label: T('Gemelos digitales\ny realidad mixta', 'Digital twins\nand mixed reality'), kind: 'method', x: 880, y: 80, mx: 110, my: 180, href: '#formacion', text: T('<p>Más agentes de los que caben en el laboratorio, sensores virtuales más complejos y un gemelo de respaldo si un robot real falla en una experiencia remota.</p>', '<p>More agents than fit in the lab, more complex virtual sensors and a backup twin if a real robot fails during a remote experiment.</p>') },
      { id: 'ind', label: T('Control individual\npor eventos', 'Event-based\nindividual control'), kind: 'theory', x: 300, y: 270, mx: 310, my: 180, href: '#agentes', text: T('<p>En el eje Z del Crazyflie, las ejecuciones del controlador bajan un 65,77 % con umbral fijo y un 93 % con umbral adaptativo, sin perder desempeño.</p>', '<p>On the Crazyflie Z axis, controller runs drop 65.77% with a fixed threshold and 93% with an adaptive one, with no loss of performance.</p>') },
      { id: 'form', label: T('Formación con\nκ₁ distancias + κ₂ geometría', 'Formation with\nκ₁ distances + κ₂ geometry'), kind: 'theory', x: 740, y: 270, mx: 110, my: 300, href: '#formacion', text: T('<p>Ley de Krick et al. ampliada con un término hacia el punto más cercano de la superficie deseada (multiplicadores de Lagrange).</p>', '<p>Krick et al.\'s law extended with a term towards the closest point of the desired surface (Lagrange multipliers).</p>') },
      { id: 'sc', label: T('Webots: 30 agentes\n≈ Gazebo con 15', 'Webots: 30 agents\n≈ Gazebo with 15'), kind: 'result', x: 520, y: 440, mx: 310, my: 300, href: '#escalabilidad', text: T('<p>En realidad mixta, Webots escala mejor: más agentes y menos consumo de CPU.</p>', '<p>In mixed reality Webots scales better: more agents and lower CPU use.</p>') },
      { id: 'sm', label: T('10 Hz · 2 cm\n−80 % mensajes', '10 Hz · 2 cm\n−80% messages'), kind: 'result', x: 880, y: 440, mx: 210, my: 420, href: '#escalabilidad', text: T('<p>Frecuencia periódica óptima de 10 Hz; con eventos de 2 cm la comunicación baja un 89 % (centralizada), 80 % (ROS 2) y 82 % (microcontroladores).</p>', '<p>Optimal periodic frequency of 10 Hz; with 2 cm events communication drops 89% (centralised), 80% (ROS 2) and 82% (microcontrollers).</p>') }
    ],
    edges: [{ from: 'smar', to: 'rp' }, { from: 'rp', to: 'dt' }, { from: 'rp', to: 'ind' }, { from: 'rp', to: 'form' }, { from: 'dt', to: 'form' }, { from: 'form', to: 'sc' }, { from: 'form', to: 'sm' }, { from: 'ind', to: 'sc', bend: 0 }]
  }, { panel: $('#cmapPanel'), initial: 'rp' });

  /* Propiedades */
  (function feats() {
    const F = [
      ['het', T('Heterogeneidad', 'Heterogeneity'), T('aéreos y móviles', 'aerial and mobile'), T('<p>Agentes de distinta naturaleza (aéreos y móviles), con distintos sistemas de posicionamiento, capacidad sensorial o tipo de locomoción (diferencial y Ackermann).</p>', '<p>Agents of different nature (aerial and mobile), with different positioning systems, sensing capabilities or locomotion (differential and Ackermann).</p>')],
      ['flex', T('Flexibilidad', 'Flexibility'), T('real, virtual o híbrido', 'real, virtual or hybrid'), T('<p>Se trabaja igual en el entorno físico, en el virtual o en experiencias híbridas de realidad mixta. Los agentes simulados funcionan en tiempo real.</p>', '<p>Work is the same in the physical environment, in the virtual one or in hybrid mixed-reality experiments. Simulated agents run in real time.</p>')],
      ['inter', T('Interoperabilidad', 'Interoperability'), T('indistinguibles', 'indistinguishable'), T('<p>En realidad mixta, la naturaleza real o virtual de cada agente es indistinguible para el resto del sistema.</p>', '<p>In mixed reality, whether each agent is real or virtual is indistinguishable for the rest of the system.</p>')],
      ['elas', T('Elasticidad', 'Elasticity'), T('arquitectura por software', 'architecture in software'), T('<p>Se conmuta entre control y comunicación centralizados, descentralizados o distribuidos sin tocar el hardware: clave para experiencias remotas sin asistencia técnica presencial. ROS 2 agrupa los nodos de cada agente en subespacios.</p>', '<p>Control and communication switch between centralised, decentralised or distributed without touching the hardware: key for remote experiments with no on-site technical support. ROS 2 groups each agent\'s nodes in namespaces.</p>')],
      ['acc', T('Diseño accesible', 'Accessible design'), T('un fichero de configuración', 'one configuration file'), T('<p>Una experiencia completa se define en un único fichero de configuración editable por el usuario: no hacen falta conocimientos de programación.</p>', '<p>A whole experiment is defined in a single user-editable configuration file: no programming knowledge is needed.</p>')],
      ['mod', T('Modularidad', 'Modularity'), T('piezas intercambiables', 'swappable pieces'), T('<p>Nomenclaturas y tipos estándar: se puede reemplazar un sistema de posicionamiento o un controlador sin reconfigurar el resto. Facilita el trabajo colaborativo.</p>', '<p>Standard naming and types: a positioning system or a controller can be replaced without reconfiguring the rest. It eases collaborative work.</p>')]
    ];
    $('#feats').innerHTML = F.map(f => `<button class="feat" type="button" data-id="${f[0]}"><b>${f[1]}</b><i>${f[2]}</i></button>`).join('');
    const show = (id) => { const f = F.find(x => x[0] === id); $('#featInfo').innerHTML = `<h3>${f[1]}</h3>${f[3]}`; IP.$$('.feat').forEach(b => b.classList.toggle('on', b.dataset.id === id)); };
    IP.$$('.feat').forEach(b => b.addEventListener('click', () => show(b.dataset.id)));
    show('elas');
  })();

  /* Elasticidad: tres arquitecturas */
  (function arch() {
    let cur = 'c';
    const node = (x, y, w, l, s, hl) => `<rect x="${x}" y="${y}" width="${w}" height="44" rx="9" fill="${hl ? 'var(--primary-soft)' : 'var(--surface)'}" stroke="${hl ? 'var(--primary)' : 'var(--border)'}" stroke-width="${hl ? 2 : 1.2}"/><text x="${x + w / 2}" y="${y + (s ? 19 : 27)}" text-anchor="middle">${l}</text>${s ? `<text class="s" x="${x + w / 2}" y="${y + 35}" text-anchor="middle">${s}</text>` : ''}`;
    function draw() {
      const ctlPC = cur === 'c', ctlROS = cur === 'r', ctlMCU = cur === 'm';
      const agents = [0, 1, 2].map(k => {
        const x = 40 + k * 230;
        return node(x, 190, 190, `${T('Agente', 'Agent')} ${k + 1}`, ctlMCU ? T('control de formación a bordo', 'on-board formation control') : T('control individual', 'individual control'), ctlMCU) +
          (ctlROS ? node(x, 110, 190, `${T('Nodo', 'Node')} ${T('coordinación', 'coordination')} ${k + 1}`, 'ROS 2', true) : '');
      }).join('');
      const pc = node(250, 20, 220, ctlPC ? T('Controlador central', 'Central controller') : 'ROS 2 · Vicon', ctlPC ? T('calcula todas las consignas', 'computes every setpoint') : T('posiciones de todos', 'everyone\'s positions'), ctlPC);
      const links = [0, 1, 2].map(k => { const x = 135 + k * 230; return ctlROS ? `<path d="M${x},154 L${x},188" stroke="var(--primary)" stroke-width="2"/><path d="M360,64 L${x},108" stroke="var(--axis)" stroke-width="1.4" stroke-dasharray="4 4"/>` : `<path d="M360,64 L${x},188" stroke="${ctlPC ? 'var(--primary)' : 'var(--axis)'}" stroke-width="${ctlPC ? 2 : 1.4}" ${ctlPC ? '' : 'stroke-dasharray="4 4"'}/>`; }).join('');
      const peer = ctlMCU || ctlROS ? `<path d="M230,${ctlROS ? 132 : 212} L270,${ctlROS ? 132 : 212}" stroke="var(--accent)" stroke-width="2.4"/><path d="M460,${ctlROS ? 132 : 212} L500,${ctlROS ? 132 : 212}" stroke="var(--accent)" stroke-width="2.4"/><text class="s" x="365" y="${ctlROS ? 100 : 252}" text-anchor="middle">${T('intercambio entre vecinos', 'neighbour exchange')}</text>` : '';
      $('#arch').innerHTML = `<svg viewBox="0 0 720 260">${links}${peer}${pc}${agents}</svg>`;
    }
    IP.seg($('#archSeg'), [{ value: 'c', label: T('Centralizada', 'Centralised') }, { value: 'r', label: T('Distribuida en ROS 2', 'Distributed in ROS 2') }, { value: 'm', label: T('Distribuida en microcontroladores', 'Distributed on microcontrollers') }], cur, (v) => { cur = v; draw(); });
    draw();
  })();

  /* Control de altitud por eventos */
  (function alt() {
    const G = { kp: 15000, ki: 3500, kd: 9000, nd: 20 }, ref = (t) => (t < 0.2 ? 0 : t < 15 ? 1 : 0.6);
    const pl = new IP.Plot($('#zp'), { height: 270, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', yunit: 'm' });
    const ctl = IP.controls($('#zCtl'), [
      { id: 'c0', label: T('Umbral fijo', 'Fixed threshold'), sym: 'c₀', min: 0.002, max: 0.03, step: 0.001, value: 0.008, unit: 'm', digits: 3 },
      { id: 'a', label: T('Peso relativo (adaptativo)', 'Relative weight (adaptive)'), sym: 'a', min: 0, max: 0.05, step: 0.005, value: 0.015, digits: 3 },
      { id: 'show', type: 'select', label: T('Mostrar', 'Show'), value: 'adaptive', options: [{ value: 'periodic', label: T('PID periódico', 'Periodic PID') }, { value: 'fixed', label: T('Eventos · umbral fijo', 'Events · fixed threshold') }, { value: 'adaptive', label: T('Eventos · umbral adaptativo', 'Events · adaptive threshold') }] }
    ], draw);
    function draw() {
      const v = ctl.values, b = { gains: G, ref, T: 30, noise: 0.006, seed: 7, c0: v.c0, a: v.a, l: 20 };
      const Rr = { periodic: ALT.simulate({ ...b, trigger: 'periodic' }), fixed: ALT.simulate({ ...b, trigger: 'fixed' }), adaptive: ALT.simulate({ ...b, trigger: 'relative' }) };
      const r = Rr[v.show], dec = (a) => a.filter((_, k) => k % 4 === 0);
      pl.overlays = { markers: v.show === 'periodic' ? [] : r.evT.map((t, k) => ({ x: t, y: r.evZ[k], r: 2, color: '--s2', scale: false })) };
      pl.setSeries([{ name: T('referencia', 'reference'), color: '--muted', x: dec(r.t), y: dec(r.ref), width: 1.4, dash: [5, 4] }, { name: 'z', color: '--s1', x: dec(r.t), y: dec(r.z), width: 2 }]);
      const n0 = Rr.periodic.metrics.events, red = (k) => 100 * (1 - Rr[k].metrics.events / n0);
      const row = (n, val, cl, pap) => `<div class="lbar"><span>${n}</span><div class="tr"><i class="${cl}" style="width:${Math.max(1.5, val)}%"></i></div><span>${fmt(val, 1)} %</span></div>` + (pap !== undefined ? `<div class="lbar"><span class="ip-muted">${T('artículo', 'paper')}</span><div class="tr"><i class="k" style="width:${pap}%"></i></div><span>${fmt(pap, 2)} %</span></div>` : '');
      $('#zBars').innerHTML = `<div class="ip-plot-title">${T('Reducción de ejecuciones frente al PID periódico', 'Reduction of runs vs the periodic PID')}</div><div class="lbars">${row(T('Umbral fijo', 'Fixed threshold'), red('fixed'), '', PAPER.zRed.fixed)}${row(T('Adaptativo', 'Adaptive'), red('adaptive'), 'r', PAPER.zRed.adaptive)}</div>
        <div class="ip-readouts" style="margin-top:12px;grid-template-columns:1fr 1fr"><div class="ip-readout"><span>${T('Ejecuciones', 'Runs')}</span><b>${r.metrics.events}</b></div><div class="ip-readout"><span>IAE</span><b>${fmt(r.metrics.iae, 2)}</b></div></div>`;
    }
    draw();
  })();

  /* Simulador de formación */
  (function formation() {
    const sc = new IP.Scene3D($('#fcv'), { az: -40, el: 22, radius: 1.15, target: [0, 0, 0.35] });
    const pl = new IP.Plot($('#fp'), { height: 200, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', yunit: 'm' });
    const ctl = IP.controls($('#fCtl'), [
      { id: 'k1', label: T('Peso de la coordinación', 'Coordination weight'), sym: 'κ₁', min: 0, max: 2, step: 0.05, value: 0.6, digits: 2 },
      { id: 'k2', label: T('Peso de la geometría', 'Geometry weight'), sym: 'κ₂', min: 0, max: 2, step: 0.05, value: 0.8, digits: 2 }
    ], () => { F.k1 = ctl.values.k1; F.k2 = ctl.values.k2; });
    let seed = 7, F;
    const launch = (n) => { if (n) seed++; F = new Form(ctl.values.k1, ctl.values.k2, seed); };
    launch();
    $('#fRun').addEventListener('click', () => launch(true));
    $('#fFail').addEventListener('click', () => F.fail(2));
    IP.animate($('#formacion'), (dt) => {
      if (F.t < 25) for (let n = 0; n < 4; n++) F.step(Math.min(dt, 0.05) / 4 * 1.5);
      sc.begin(); drawForm(sc, F, { labels: true }); sc.draw(dt);
      $('#fT').textContent = `t = ${fmt(F.t, 1)} s` + (F.failed !== null ? ` · ${T('gemelo activo', 'twin active')}` : '');
      pl.opts.xlim = [0, 25];
      pl.overlays = F.failed !== null ? { vlines: [{ x: F.failT, color: '--s2', label: T('fallo', 'failure') }] } : {};
      pl.setSeries([{ name: 'Σ|d − d*|', color: '--s3', x: F.hist.t, y: F.hist.ed, width: 2 }, { name: 'Σ|‖p‖ − R|', color: '--s1', x: F.hist.t, y: F.hist.es, width: 2 }]);
    }).start();
  })();

  /* Escalabilidad (Tabla 1) y muestreo */
  (function scal() {
    const t = PAPER.table1, N = t.map(r => r[1]);
    const a = new IP.Plot($('#rtf'), { height: 240, xlabel: T('agentes N', 'agents N'), xname: 'N', yunit: '' });
    a.overlays = { hlines: [{ y: 1, color: '--muted', label: T('tiempo real', 'real time') }] };
    a.setSeries([{ name: 'Gazebo', color: '--s2', x: N.filter((_, k) => t[k][3] !== null), y: t.filter(r => r[3] !== null).map(r => r[3]), width: 2.2 }, { name: 'Webots', color: '--s1', x: N, y: t.map(r => r[4]), width: 2.2 }]);
    const c = new IP.Plot($('#cpu'), { height: 240, xlabel: T('agentes N', 'agents N'), xname: 'N', yunit: '%' });
    c.setSeries([{ name: 'Gazebo', color: '--s2', x: N, y: t.map(r => r[5]), width: 2.2 }, { name: 'Webots', color: '--s1', x: N, y: t.map(r => r[6]), width: 2.2 }]);
    $('#tab1').innerHTML = `<table class="ip-table"><thead><tr><th>Id</th><th>N</th><th>${T('Reales', 'Real')}</th><th>RTF<sub>G</sub></th><th>RTF<sub>W</sub></th><th>%CPU<sub>G</sub></th><th>%CPU<sub>W</sub></th></tr></thead><tbody>${t.map(r => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td><td class="num">${r[3] === null ? '—' : fmt(r[3], 2)}</td><td class="num">${fmt(r[4], 2)}</td><td class="num">${fmt(r[5], 1)}</td><td class="num">${fmt(r[6], 1)}</td></tr>`).join('')}</tbody></table>`;
    $('#sampBars').innerHTML = '<div class="lbars">' + PAPER.samp.map(([n, v], k) => `<div class="lbar"><span>${n}</span><div class="tr"><i class="${['', 'r', 'k'][k]}" style="width:${v}%"></i></div><span>−${v} %</span></div>`).join('') + '</div>';
  })();

  IP.quiz($('#quizBox'), [
    { q: T('¿Qué significa que Robotic Park sea «elástica»?', 'What does it mean that Robotic Park is "elastic"?'), options: [T('Que se puede cambiar entre arquitectura centralizada y distribuida sólo por software', 'That it can switch between centralised and distributed architecture in software alone'), T('Que admite robots blandos', 'That it supports soft robots'), T('Que el laboratorio se puede ampliar', 'That the lab can be enlarged')], answer: 0, explain: T('La arquitectura depende sólo de qué nodos se ejecutan en cada unidad de cómputo; es clave para experiencias remotas.', 'The architecture only depends on which nodes run on each computing unit; it is key for remote experiments.') },
    { q: T('En la ley de formación, ¿qué hace el término κ₂(p_i − p*_i)?', 'In the formation law, what does the κ₂(p_i − p*_i) term do?'), options: [T('Atrae cada agente hacia el punto más cercano de la geometría deseada', 'It pulls each agent towards the closest point of the desired geometry'), T('Mantiene las distancias entre vecinos', 'It keeps the distances between neighbours'), T('Evita colisiones', 'It avoids collisions')], answer: 0, explain: T('p*_i se calcula con multiplicadores de Lagrange. Sin él (κ₂ = 0) la formación respeta las distancias pero puede quedar en cualquier sitio y orientación.', 'p*_i is computed with Lagrange multipliers. Without it (κ₂ = 0) the formation respects the distances but may end up anywhere and with any orientation.') },
    { q: T('¿Para qué sirve un gemelo digital en una experiencia remota?', 'What is a digital twin for in a remote experiment?'), options: [T('Para sustituir a un robot real que falla y no romper la formación', 'To replace a real robot that fails without breaking the formation'), T('Para grabar vídeo', 'To record video'), T('Para cargar la batería', 'To charge the battery')], answer: 0, explain: T('Además, mejora la sensorización del agente físico con sensores virtuales y le permite percibir agentes que sólo existen en simulación.', 'It also extends the physical agent with virtual sensors and lets it perceive agents that only exist in simulation.') },
    { q: T('Según la Tabla 1, ¿qué simulador escala mejor?', 'According to Table 1, which simulator scales better?'), options: ['Gazebo', 'Webots', 'Matlab/Simulink'], answer: 1, explain: T('Webots mantiene RTF = 0,83 con 30 agentes, mientras Gazebo cae a 0,47 y no funciona con 40.', 'Webots keeps RTF = 0.83 with 30 agents, while Gazebo drops to 0.47 and fails with 40.') }
  ]);
})();
