/* ============================================================
   Robotic Park Lab — Configurador de experimentos (interfaz)
   Estado en `cfg` (ver RPGen.defaultConfig). Toda la generación
   de ficheros está en generador.js; aquí solo hay formularios,
   vista previa 3D, línea temporal y descarga.
   ============================================================ */
(function () {
  'use strict';
  const IP = window.IP, G = window.RPGen;
  const $ = (s, r = document) => r.querySelector(s);
  const T = IP.t, EN = IP.lang === 'en', Li = EN ? 1 : 0;
  const STORE = 'rp-configurador-v1';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ------------------------------------------------------------------ estado
  let cfg = G.defaultConfig();
  let activePreset = 'dome';
  G.PRESETS.dome.apply(cfg);
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && saved.version === 1) { cfg = merge(G.defaultConfig(), saved); activePreset = null; }
  } catch (e) { /* sin almacenamiento: configuración por defecto */ }
  G.syncRobots(cfg);

  function merge(base, o) {
    const out = Object.assign(base, o);
    ['fleet', 'lowlevel', 'task', 'env'].forEach(k => { out[k] = Object.assign(G.defaultConfig()[k], o[k] || {}); });
    out.robots = Array.isArray(o.robots) ? o.robots : [];
    out.commands = Array.isArray(o.commands) && o.commands.length ? o.commands : null;
    return out;
  }

  // ------------------------------------------------------------------ utilidades de formulario
  const el = (tag, attrs = {}, html) => IP.el(tag, attrs, html);
  function field(label, input, cls = '', help) {
    const f = el('label', { class: 'cfg-field ' + cls });
    f.append(el('span', {}, label), input);
    if (help) f.append(el('span', { class: 'cfg-help' }, help));
    return f;
  }
  function num(label, get, set, o = {}) {
    const i = el('input', { type: 'number', step: o.step ?? 0.01, min: o.min ?? '', max: o.max ?? '', value: get() });
    i.addEventListener('input', () => { const v = parseFloat(i.value); if (isFinite(v)) { set(o.int ? Math.round(v) : v); changed(o.structural); } });
    return field(label + (o.unit ? ` (${o.unit})` : ''), i, o.cls || 'narrow', o.help);
  }
  function sel(label, opts, get, set, o = {}) {
    const s = el('select');
    opts.forEach(([v, es, en, dis]) => { const op = el('option', { value: v }, EN ? (en ?? es) : es); if (dis) op.disabled = true; s.append(op); });
    s.value = get();
    s.addEventListener('change', () => { set(s.value); changed(o.structural); if (o.rerender) o.rerender(); });
    return field(label, s, o.cls || '', o.help);
  }
  function chk(label, get, set, o = {}) {
    const l = el('label'); const i = el('input', { type: 'checkbox' }); i.checked = !!get();
    i.addEventListener('change', () => { set(i.checked); changed(o.structural); if (o.rerender) o.rerender(); });
    l.append(i, document.createTextNode(label)); return l;
  }

  // ------------------------------------------------------------------ 1. plantillas
  function renderPresets() {
    const box = $('#presets'); box.innerHTML = '';
    const desc = {
      dome: [T('8 Crazyflie sobre una semiesfera, ley PRF con proyección de Lagrange.', '8 Crazyflies on a hemisphere, PRF law with Lagrange projection.')],
      ring: [T('6 drones en anillo; ley de gradiente y envío basado en eventos.', '6 drones in a ring; gradient law and event-based transmission.')],
      hybrid: [T('4 drones y 3 Khepera IV en una misma formación por distancias.', '4 drones and 3 Khepera IV in one distance-based formation.')],
      herding: [T('5 drones pastores guían a un Khepera hacia un objetivo.', '5 herder drones steer a Khepera to a goal.')],
      shield: [T('12 drones, malla triangulada guiada por dos líderes.', '12 drones, triangulated mesh driven by two leaders.')],
      teleop: [T('Un dron recorre puntos de paso; ideal para empezar.', 'One drone flies through waypoints; good to start.')],
    };
    Object.entries(G.PRESETS).forEach(([k, p]) => {
      const b = el('button', { type: 'button', class: 'cfg-preset' + (k === activePreset ? ' is-on' : '') }, `${p.label[Li]}<small>${desc[k] || ''}</small>`);
      b.addEventListener('click', () => {
        const c = G.defaultConfig(); p.apply(c); c.robots = []; cfg = c; activePreset = k;
        G.syncRobots(cfg); renderAll();
      });
      box.append(b);
    });
    const n = $('#expName'); n.value = cfg.name;
    n.oninput = () => { cfg.name = n.value; changed(); };
    const d = $('#expDesc'); d.value = cfg.description || '';
    d.oninput = () => { cfg.description = d.value; changed(); };
  }

  // ------------------------------------------------------------------ 2. robots
  const TYPES = [['virtual', 'Virtual', 'Virtual'], ['physical', 'Real', 'Real'], ['digital_twin', 'Gemelo digital', 'Digital twin']];
  function renderFleet() {
    const a = $('#fleetCtl'); a.innerHTML = '';
    a.append(
      num('Crazyflie 2.1', () => cfg.fleet.crazyflie, v => { cfg.fleet.crazyflie = IP.clamp(v, 0, 40); }, { step: 1, min: 0, max: 40, int: true, structural: true }),
      num('Khepera IV', () => cfg.fleet.khepera, v => { cfg.fleet.khepera = IP.clamp(v, 0, 20); }, { step: 1, min: 0, max: 20, int: true, structural: true }),
      sel(T('Tipo de los robots nuevos', 'Type of new robots'), TYPES, () => cfg.fleet.type, v => { cfg.fleet.type = v; }),
      el('div', { class: 'cfg-field narrow' })
    );
    const allBtn = el('button', { type: 'button', class: 'ip-btn small ghost' }, T('Aplicar a todos', 'Apply to all'));
    allBtn.addEventListener('click', () => { cfg.robots.forEach(r => { r.type = cfg.fleet.type; }); renderRobots(); changed(); });
    a.lastChild.append(el('span', {}, '&nbsp;'), allBtn);
    const b = $('#fleetCtl2'); b.innerHTML = '';
    b.append(
      sel(T('Posiciones iniciales', 'Start positions'), [['circle', 'En círculo', 'Circle'], ['grid', 'En rejilla', 'Grid'], ['line', 'En línea', 'Line']],
        () => cfg.fleet.layout, v => { cfg.fleet.layout = v; cfg.robots.forEach(r => { r.manual = false; }); }, { structural: true }),
      num(T('Radio del círculo', 'Circle radius'), () => cfg.fleet.radius, v => { cfg.fleet.radius = v; cfg.robots.forEach(r => { r.manual = false; }); }, { unit: 'm', step: 0.1, min: 0.2, structural: true }),
      num(T('Separación', 'Spacing'), () => cfg.fleet.spacing, v => { cfg.fleet.spacing = v; cfg.robots.forEach(r => { r.manual = false; }); }, { unit: 'm', step: 0.05, min: 0.2, structural: true })
    );
  }
  function renderRobots() {
    const t = $('#robotTable');
    t.innerHTML = `<thead><tr><th>${T('Nombre', 'Name')}</th><th>${T('Robot', 'Robot')}</th><th>${T('Tipo', 'Type')}</th><th>x (m)</th><th>y (m)</th><th>${T('Radio / IP', 'Radio / IP')}</th><th></th></tr></thead>`;
    const tb = el('tbody');
    cfg.robots.forEach((r, i) => {
      const tr = el('tr');
      const air = G.KINDS[r.kind].air;
      tr.append(el('td', { class: 'cfg-name' }, r.name), el('td', {}, `<span class="cfg-tag ${air ? 'air' : 'gnd'}">${G.KINDS[r.kind].label[Li]}</span>`));
      const ty = el('select'); TYPES.forEach(([v, es, en]) => ty.append(el('option', { value: v }, EN ? en : es))); ty.value = r.type;
      ty.addEventListener('change', () => { r.type = ty.value; changed(); });
      tr.append(el('td', {}, '')); tr.lastChild.append(ty);
      ['x', 'y'].forEach(k => {
        const inp = el('input', { type: 'number', step: 0.05, value: r[k] });
        inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (isFinite(v)) { r[k] = v; r.manual = true; changed(); } });
        const td = el('td'); td.append(inp); tr.append(td);
      });
      const addr = el('input', { type: 'text', value: air ? r.uri : r.ip, spellcheck: 'false', title: air ? 'URI Crazyradio' : 'IP' });
      addr.style.minWidth = air ? '210px' : '120px';
      addr.addEventListener('input', () => { if (air) r.uri = addr.value.trim(); else r.ip = addr.value.trim(); changed(); });
      const td = el('td'); td.append(addr); tr.append(td);
      const x = el('button', { type: 'button', class: 'cfg-x', title: T('Quitar', 'Remove'), 'aria-label': T('Quitar', 'Remove') }, '✕');
      x.addEventListener('click', () => { cfg.robots.splice(i, 1); cfg.fleet[r.kind] = Math.max(0, cfg.fleet[r.kind] - 1); G.syncRobots(cfg); renderFleet(); renderRobots(); structural(); });
      const td2 = el('td'); td2.append(x); tr.append(td2);
      tb.append(tr);
    });
    t.append(tb);
  }

  // ------------------------------------------------------------------ 3. control de bajo nivel
  function renderLowLevel() {
    const L = cfg.lowlevel, a = $('#llCtl'), b = $('#llCtl2'); a.innerHTML = ''; b.innerHTML = '';
    a.append(
      sel(T('Controlador del Crazyflie', 'Crazyflie controller'), [['pid', 'PID en cascada (posición → actitud → velocidad angular)', 'Cascaded PID (position → attitude → rate)'], ['ipc', 'IPC (controlador alternativo del driver)', 'IPC (driver alternative controller)']], () => L.cfController, v => { L.cfController = v; }),
      sel(T('Controlador del Khepera IV', 'Khepera IV controller'), [['ipc', 'IPC (por defecto)', 'IPC (default)'], ['pid', 'PID', 'PID']], () => L.khController, v => { L.khController = v; }),
      sel(T('Muestreo del controlador', 'Controller sampling'), [['Continuous', 'Periódico', 'Periodic'], ['EventBased', 'Basado en eventos', 'Event-based']], () => L.protocol, v => { L.protocol = v; }, { rerender: renderLowLevel }),
    );
    if (L.protocol === 'EventBased') a.append(num(T('Umbral c₀', 'Threshold c₀'), () => L.co, v => { L.co = v; }, { step: 0.005, min: 0 }), num(T('Umbral relativo a', 'Relative threshold a'), () => L.ai, v => { L.ai = v; }, { step: 0.01, min: 0 }));
    b.append(
      sel(T('Envío de la posición', 'Pose transmission'), [['Continuous', 'Continuo', 'Continuous'], ['EventBased', 'Basado en eventos (send-on-delta)', 'Event-based (send-on-delta)']], () => L.comm, v => { L.comm = v; }, { rerender: renderLowLevel }),
    );
    if (L.comm === 'EventBased') b.append(num(T('Umbral de envío', 'Send threshold'), () => L.commCo, v => { L.commCo = v; }, { unit: 'm', step: 0.005, min: 0 }));
    b.append(
      num(T('Periodo local_pose', 'local_pose period'), () => L.poseT, v => { L.poseT = v; }, { unit: 'ms', step: 10, min: 10, int: true }),
      sel(T('Posicionamiento (reales)', 'Positioning (real)'), [['Intern', 'A bordo (Lighthouse/flow)', 'Onboard (Lighthouse/flow)'], ['Vicon', 'Vicon (externo)', 'Vicon (external)']], () => L.positioning, v => { L.positioning = v; }),
    );
    const c = el('div', { class: 'cfg-checks' });
    c.append(
      chk(T('Publicar trayectoria (path)', 'Publish path'), () => L.path, v => { L.path = v; }),
      chk(T('Publicar velocidad (local_twist)', 'Publish velocity (local_twist)'), () => L.twist, v => { L.twist = v; }),
      chk(T('Publicar motores (Crazyflie)', 'Publish motors (Crazyflie)'), () => L.motors, v => { L.motors = v; }),
    );
    b.after(c); if (c.previousElementSibling !== b) { /* noop */ }
    // evita acumular filas de checks al rerenderizar
    const extra = $('#control').querySelectorAll('.cfg-checks'); extra.forEach((e, i) => { if (i < extra.length - 1) e.remove(); });
  }

  // ------------------------------------------------------------------ 4. tarea
  const MODES = [
    ['distance', 'Formación por distancias', 'Distance-based formation', 'Distribuida: cada robot usa solo sus vecinos.', 'Distributed: each robot only uses its neighbours.'],
    ['herding', 'Pastoreo (herding)', 'Herding', 'Centralizada: drones guían a un Khepera.', 'Centralized: drones steer a Khepera.'],
    ['triangulated', 'Triangulada con líderes', 'Leader-based triangulated', 'Centralizada: malla 3D y dos líderes.', 'Centralized: 3D mesh and two leaders.'],
    ['none', 'Sin formación', 'No formation', 'Solo órdenes y puntos de paso.', 'Orders and waypoints only.'],
  ];
  function renderTask() {
    const t = cfg.task, m = $('#taskModes'); m.innerHTML = '';
    MODES.forEach(([k, es, en, des, den]) => {
      const b = el('button', { type: 'button', class: 'cfg-mode' + (t.mode === k ? ' is-on' : '') }, `${EN ? en : es}<small>${EN ? den : des}</small>`);
      b.addEventListener('click', () => { t.mode = k; if (k === 'triangulated' && t.shape === 'line') t.shape = 'sphere'; renderTask(); structural(); });
      m.append(b);
    });
    const body = $('#taskBody'); body.innerHTML = '';
    const nG = cfg.robots.filter(r => !G.KINDS[r.kind].air).length;
    const row = () => { const r = el('div', { class: 'cfg-row' }); body.append(r); return r; };

    if (t.mode === 'none') {
      body.append(el('p', { class: 'ip-muted ip-small' }, T('Los robots no ejecutan ninguna ley de formación: se mueven con las órdenes de la sección 6 (despegar, ir a una posición, aterrizar…).', 'Robots run no formation law: they move with the commands in section 6 (take off, go to a position, land…).')));
      return;
    }
    if (t.mode === 'herding') {
      body.append(el('p', { class: 'ip-muted ip-small' }, T('Usa <code>multi_agent_pkg/affine_formation_node</code>: los drones (pastores) forman un anillo alrededor del primer Khepera (oveja, reactivo) y lo empujan hacia la posición que le envíes en la sección 6.', 'Uses <code>multi_agent_pkg/affine_formation_node</code>: the drones (herders) form a ring around the first Khepera (sheep, reactive) and push it towards the position you send in section 6.')));
      const r = row();
      r.append(num(T('Radio del anillo', 'Ring radius'), () => t.R, v => { t.R = v; }, { unit: 'm', step: 0.05, min: 0.3 }),
        num(T('Altura de vuelo', 'Flight height'), () => t.height, v => { t.height = v; }, { unit: 'm', step: 0.05, min: 0.6, max: 3 }));
      return;
    }
    // forma
    const shapes = Object.entries(G.SHAPES).filter(([k]) => t.mode !== 'triangulated' || k !== 'line').map(([k, s]) => [k, s.label[0], s.label[1]]);
    const r1 = row();
    r1.append(sel(T('Forma objetivo', 'Target shape'), shapes, () => t.shape, v => {
      t.shape = v;
      const law = G.LAWS[t.law]; if (law && law.shapes && !law.shapes.includes(v)) t.law = 'gradient';
      if (v === 'custom' && (!t.targets || t.targets.length !== cfg.robots.length)) t.targets = G.targets(Object.assign(clone(cfg), { task: Object.assign(clone(t), { shape: 'sphere' }) })).map(p => p.map(x => +x.toFixed(2)));
    }, { rerender: renderTask, structural: true, cls: 'grow' }));
    const r2 = row();
    const P = (lab, k, o = {}) => num(lab, () => t[k], v => { t[k] = v; }, Object.assign({ unit: 'm', step: 0.05, structural: true }, o));
    if (t.shape === 'ring') r2.append(P(T('Radio', 'Radius'), 'R', { min: 0.2 }), P(T('Altura', 'Height'), 'height', { min: 0.6, max: 3 }));
    if (t.shape === 'line' || t.shape === 'grid') r2.append(P(T('Separación', 'Spacing'), 'spacing', { min: 0.25 }), P(T('Altura', 'Height'), 'height', { min: 0.6, max: 3 }));
    if (t.shape === 'sphere') r2.append(P(T('Radio R', 'Radius R'), 'R', { min: 0.3 }), P(T('Centro z', 'Centre z'), 'cz'));
    if (t.shape === 'cone') r2.append(P(T('Radio de la base a', 'Base radius a'), 'a', { min: 0.2 }), P(T('Altura c', 'Height c'), 'c', { min: 0.3 }), P(T('Base z', 'Base z'), 'cz'));
    if (t.shape === 'ellipsoid') r2.append(P('a (x)', 'ea', { min: 0.2 }), P('b (y)', 'eb', { min: 0.2 }), P('c (z)', 'ec', { min: 0.2 }), P(T('Centro z', 'Centre z'), 'cz'));
    if (t.shape !== 'custom') r2.append(P(T('Centro x', 'Centre x'), 'cx'), P(T('Centro y', 'Centre y'), 'cy'));
    if (nG && t.mode === 'distance' && t.shape !== 'custom') {
      const r3 = row();
      r3.append(sel(T('Khepera en el suelo', 'Kheperas on the floor'), [['ring', 'Anillo', 'Ring'], ['line', 'Línea', 'Line'], ['grid', 'Rejilla', 'Grid']], () => t.groundShape, v => { t.groundShape = v; }, { structural: true }),
        P(T('Radio del anillo (suelo)', 'Floor ring radius'), 'groundR', { min: 0.2 }));
    }
    if (t.shape === 'custom') {
      body.append(el('h3', {}, T('Posiciones objetivo', 'Target positions')));
      const tw = el('div', { class: 'ip-table-wrap' }), tb = el('table', { class: 'ip-table cfg-table' });
      tb.innerHTML = `<thead><tr><th>${T('Robot', 'Robot')}</th><th>x</th><th>y</th><th>z</th></tr></thead>`;
      const body2 = el('tbody');
      if (!t.targets) t.targets = [];
      cfg.robots.forEach((r, i) => {
        if (!t.targets[i]) t.targets[i] = [r.x, r.y, G.KINDS[r.kind].air ? 1.0 : 0];
        const tr = el('tr'); tr.append(el('td', { class: 'cfg-name' }, r.name));
        [0, 1, 2].forEach(k => {
          const inp = el('input', { type: 'number', step: 0.05, value: t.targets[i][k] });
          inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (isFinite(v)) { t.targets[i][k] = v; structural(); } });
          const td = el('td'); td.append(inp); tr.append(td);
        });
        body2.append(tr);
      });
      t.targets.length = cfg.robots.length;
      tb.append(body2); tw.append(tb); body.append(tw);
    }

    if (t.mode === 'triangulated') {
      body.append(el('p', { class: 'ip-muted ip-small' }, T('Usa <code>multi_agent_pkg/triangulated_formation_node</code>. La malla se obtiene por triangulación de Delaunay de las posiciones objetivo; los dos líderes fijan traslación, giro y escala, y reciben su posición en la sección 6.', 'Uses <code>multi_agent_pkg/triangulated_formation_node</code>. The mesh comes from a Delaunay triangulation of the target positions; the two leaders fix translation, rotation and scale, and get their position in section 6.')));
      const drones = cfg.robots.filter(r => G.KINDS[r.kind].air).map((r, i) => [String(i + 1), r.name, r.name]);
      const r4 = row();
      [0, 1].forEach(k => r4.append(sel(T('Líder ', 'Leader ') + (k + 1), drones, () => String((t.leaders || [1, 2])[k]), v => { t.leaders = (t.leaders || [1, 2]).slice(); t.leaders[k] = +v; }, { structural: true })));
      r4.append(num(T('Ganancia de la malla', 'Mesh gain'), () => t.meshGain, v => { t.meshGain = v; }, { step: 0.5, min: 0.1 }));
      const c = el('div', { class: 'cfg-checks' }); c.append(chk(T('Activar incertidumbre en la malla', 'Enable mesh uncertainty'), () => t.uncertainty, v => { t.uncertainty = v; })); body.append(c);
      return;
    }

    // topología y ley (formación por distancias)
    body.append(el('h3', {}, T('Topología de comunicación', 'Communication topology')));
    const r5 = row();
    r5.append(sel(T('Vecinos de cada robot', 'Neighbours of each robot'), [['delaunay', 'Triangulación de Delaunay', 'Delaunay triangulation'], ['knn', 'k vecinos más cercanos', 'k nearest neighbours'], ['ring', 'Anillo (ciclo)', 'Ring (cycle)'], ['complete', 'Todos con todos', 'All-to-all']], () => t.topology, v => { t.topology = v; }, { rerender: renderTask, structural: true }));
    if (t.topology === 'knn') r5.append(num('k', () => t.k, v => { t.k = IP.clamp(v, 1, 12); }, { step: 1, min: 1, max: 12, int: true, structural: true }));
    const sh = G.SHAPES[t.shape];
    if (sh && sh.surface) {
      const c = el('div', { class: 'cfg-checks' });
      c.append(chk(T('Restricción de superficie (agente virtual «' + sh.surface + '» en la relación)', 'Surface constraint (virtual "' + sh.surface + '" agent in the relationship)'), () => t.constraint, v => { t.constraint = v; if (!v && G.LAWS[t.law].shapes) t.law = 'gradient'; }, { rerender: renderTask, structural: true }));
      body.append(c);
    }
    body.append(el('h3', {}, T('Ley de control de formación', 'Formation control law')));
    const laws = Object.entries(G.LAWS).map(([k, l]) => [k, l.label[0], l.label[1], l.shapes && (!l.shapes.includes(t.shape) || !t.constraint)]);
    const r6 = row();
    r6.append(sel(T('Ley', 'Law'), laws, () => t.law, v => { t.law = v; }, { rerender: renderTask, cls: 'grow', help: T('Las leyes con multiplicadores de Lagrange (ECC 2026) requieren esfera o cono con restricción de superficie.', 'Lagrange-multiplier laws (ECC 2026) need a sphere or cone with the surface constraint.') }));
    const r7 = row();
    if (t.law !== 'ML3') r7.append(sel(T('Salida de la ley', 'Law output'), [['v', 'Velocidad (_v)', 'Velocity (_v)'], ['p', 'Posición (_p)', 'Position (_p)']], () => t.output, v => { t.output = v; }));
    r7.append(
      num(T('Ganancia κ', 'Gain κ'), () => t.gain, v => { t.gain = v; }, { step: 0.01, min: 0 }),
      num(T('Límite de salida', 'Output limit'), () => t.upper, v => { t.upper = Math.abs(v); }, { step: 0.05, min: 0, unit: 'm/s' }),
      num(T('Periodo', 'Period'), () => t.period, v => { t.period = v; }, { step: 0.05, min: 0.02, unit: 's' }),
    );
    const r8 = row();
    r8.append(sel(T('Activación de la ley', 'Law triggering'), [['Continuous', 'Periódica', 'Periodic'], ['EventBased', 'Basada en eventos', 'Event-based']], () => t.protocol, v => { t.protocol = v; }, { rerender: renderTask }));
    if (t.protocol === 'EventBased') r8.append(num(T('Umbral c₀', 'Threshold c₀'), () => t.co, v => { t.co = v; }, { step: 0.005, min: 0 }), num(T('Umbral relativo a', 'Relative threshold a'), () => t.ai, v => { t.ai = v; }, { step: 0.01, min: 0 }));
  }

  // ------------------------------------------------------------------ 5. entorno
  function renderEnv() {
    const e = cfg.env, a = $('#envCtl'); a.innerHTML = '';
    a.append(
      sel(T('Simulador', 'Simulator'), [['Webots', 'Webots R2025a', 'Webots R2025a'], ['Gazebo', 'Gazebo (sin robots en el lanzador común)', 'Gazebo (no robots in the common launcher)']], () => e.tool, v => { e.tool = v; }),
      sel(T('Mundo', 'World'), [['lab', 'Laboratorio Robotic Park (malla 3D)', 'Robotic Park lab (3D mesh)'], ['empty', 'Suelo vacío', 'Empty floor']], () => e.world, v => { e.world = v; }),
      sel('Vicon', [['auto', 'Automático (si hay robots reales con Vicon)', 'Automatic (if real robots use Vicon)'], ['yes', 'Lanzar siempre', 'Always launch'], ['no', 'No lanzar', 'Do not launch']], () => e.vicon, v => { e.vicon = v; }),
    );
    const c = $('#envChecks'); c.innerHTML = '';
    c.append(
      chk('RViz', () => e.rviz, v => { e.rviz = v; }),
      chk(T('RQT (perspectiva por defecto)', 'RQT (default perspective)'), () => e.rqt, v => { e.rqt = v; }),
      chk(T('Monitor de CPU', 'CPU monitor'), () => e.cpu, v => { e.cpu = v; }),
      chk(T('Grabar rosbag', 'Record rosbag'), () => e.log, v => { e.log = v; }, { rerender: renderEnv }),
    );
    if (e.log) c.append(chk(T('Grabar todos los topics (-a)', 'Record all topics (-a)'), () => e.logAll, v => { e.logAll = v; }));
  }

  // ------------------------------------------------------------------ 6. órdenes
  const ORDER_KEYS = Object.keys(G.ORDERS);
  function parseOrder(v) {
    v = String(v);
    if (ORDER_KEYS.includes(v) && !G.ORDERS[v].arg) return { key: v, arg: '' };
    if (/^led-/.test(v)) return { key: 'led', arg: v.slice(4) };
    if (/^ellipsoid_/.test(v)) return { key: 'ellipsoid', arg: v.slice(10) };
    if (/^remove_/.test(v)) return { key: 'remove', arg: v.slice(7) };
    if (/^add_/.test(v)) return { key: 'add', arg: v.slice(4) };
    return { key: 'custom', arg: v };
  }
  function composeOrder(key, arg) {
    if (key === 'led') return 'led-' + (arg || '1');
    if (key === 'ellipsoid') return 'ellipsoid_' + (arg || '1.2-0.8-0.8');
    if (key === 'remove') return 'remove_' + (arg || 'dron02');
    if (key === 'add') return 'add_' + (arg || 'dron02_1.0');
    if (key === 'custom') return arg || 'take_off';
    return key;
  }
  function materialize() { if (!cfg.commands) cfg.commands = clone(G.defaultCommands(cfg)); }
  function renderCommands() {
    const cmds = G.commandsOf(cfg), t = $('#cmdTable');
    $('#cmdMode').textContent = cfg.commands ? T('Secuencia personalizada', 'Custom sequence') : T('Automática: sigue a la formación', 'Automatic: follows the formation');
    t.innerHTML = `<thead><tr><th>#</th><th>${T('Cuándo', 'When')}</th><th>${T('Destino', 'Target')}</th><th>${T('Acción', 'Action')}</th><th>${T('Valor', 'Value')}</th><th></th></tr></thead>`;
    const tb = el('tbody');
    const targets = [['swarm', T('swarm (todos)', 'swarm (all)')]].concat(cfg.robots.map(r => [r.name, r.name]));
    const edit = (fn) => { materialize(); fn(cfg.commands); renderCommands(); changed(); };
    cmds.forEach((c, i) => {
      const tr = el('tr');
      tr.append(el('td', {}, String(i + 1)));
      // cuándo
      const w = el('td'), wrap = el('div', { class: 'cfg-ord' });
      const trig = el('select'); [['time', T('tras', 'after')], ['ready', T('al «ready»', 'on "ready"')]].forEach(([v, l]) => trig.append(el('option', { value: v }, l)));
      trig.value = c.trigger || 'time';
      trig.addEventListener('change', () => edit(cs => { cs[i].trigger = trig.value; }));
      wrap.append(trig);
      if (trig.value === 'time') {
        const d = el('input', { type: 'number', step: 0.5, min: 0, value: c.delay, title: T('segundos desde la orden anterior', 'seconds since the previous command') });
        d.addEventListener('change', () => edit(cs => { cs[i].delay = Math.max(0, parseFloat(d.value) || 0); }));
        wrap.append(d, el('span', { class: 'ip-muted' }, 's'));
      }
      w.append(wrap); tr.append(w);
      // destino
      const tg = el('select'); targets.forEach(([v, l]) => tg.append(el('option', { value: v }, l))); tg.value = c.target;
      if (tg.value !== c.target) { tg.append(el('option', { value: c.target }, c.target + ' ⚠')); tg.value = c.target; }
      tg.addEventListener('change', () => edit(cs => { cs[i].target = tg.value; }));
      const td1 = el('td'); td1.append(tg); tr.append(td1);
      // acción
      const k = el('select'); [['order', T('orden', 'order')], ['goal', T('ir a posición', 'go to position')]].forEach(([v, l]) => k.append(el('option', { value: v }, l))); k.value = c.kind;
      k.addEventListener('change', () => edit(cs => {
        cs[i].kind = k.value;
        if (k.value === 'goal') { const rb = cfg.robots.find(r => r.name === cs[i].target); cs[i].value = rb ? [rb.x, rb.y, G.KINDS[rb.kind].air ? 1.0 : 0] : [0, 0, 1.0]; }
        else cs[i].value = 'take_off';
      }));
      const td2 = el('td'); td2.append(k); tr.append(td2);
      // valor
      const td3 = el('td');
      if (c.kind === 'goal') {
        const box = el('div', { class: 'cfg-xyz' });
        [0, 1, 2].forEach(j => {
          const inp = el('input', { type: 'number', step: 0.05, value: (c.value || [0, 0, 0])[j], 'aria-label': 'xyz'[j] });
          inp.addEventListener('change', () => edit(cs => { const v = (cs[i].value || [0, 0, 0]).slice(); v[j] = parseFloat(inp.value) || 0; cs[i].value = v; }));
          box.append(inp);
        });
        td3.append(box);
      } else {
        const box = el('div', { class: 'cfg-ord' });
        const po = parseOrder(c.value);
        const isGround = c.target !== 'swarm' && !G.KINDS[(cfg.robots.find(r => r.name === c.target) || { kind: 'crazyflie' }).kind].air;
        const os = el('select');
        ORDER_KEYS.forEach(key => { const o = G.ORDERS[key]; const op = el('option', { value: key }, o.label[Li]); if (isGround && o.air) op.disabled = true; os.append(op); });
        os.value = po.key;
        os.addEventListener('change', () => edit(cs => { cs[i].value = composeOrder(os.value, ''); }));
        box.append(os);
        if (G.ORDERS[po.key].arg) {
          const arg = el('input', { type: 'text', value: po.arg, spellcheck: 'false' }); arg.style.width = '120px';
          arg.addEventListener('change', () => edit(cs => { cs[i].value = composeOrder(po.key, arg.value.trim()); }));
          box.append(arg);
        }
        td3.append(box);
      }
      tr.append(td3);
      // mover / borrar
      const td4 = el('td'), ctl = el('div', { class: 'cfg-ord' });
      const up = el('button', { type: 'button', class: 'cfg-x', title: T('Subir', 'Up') }, '↑');
      up.addEventListener('click', () => { if (i) edit(cs => { [cs[i - 1], cs[i]] = [cs[i], cs[i - 1]]; }); });
      const dn = el('button', { type: 'button', class: 'cfg-x', title: T('Bajar', 'Down') }, '↓');
      dn.addEventListener('click', () => { if (i < cmds.length - 1) edit(cs => { [cs[i + 1], cs[i]] = [cs[i], cs[i + 1]]; }); });
      const rm = el('button', { type: 'button', class: 'cfg-x', title: T('Quitar', 'Remove') }, '✕');
      rm.addEventListener('click', () => edit(cs => { cs.splice(i, 1); }));
      ctl.append(up, dn, rm); td4.append(ctl); tr.append(td4);
      tb.append(tr);
    });
    const last = el('tr', { class: 'ip-muted' }); last.innerHTML = `<td>${cmds.length + 1}</td><td>${T('tras', 'after')} 10 s</td><td>swarm</td><td>${T('orden', 'order')}</td><td>end <span class="ip-small">(${T('automática', 'automatic')})</span></td><td></td>`;
    tb.append(last); t.append(tb);
    renderTimeline(cmds);
  }
  function renderTimeline(cmds) {
    const box = $('#timeline'); box.innerHTML = '';
    let t = 0; const ev = [];
    cmds.forEach(c => { t += c.trigger === 'ready' ? 5 : (Number(c.delay) || 0); ev.push({ t, c }); });
    t += 10; ev.push({ t, c: { kind: 'end', value: 'end', target: 'swarm' } });
    const tot = Math.max(t, 1);
    box.append(el('div', { class: 'axis' }));
    const step = tot > 120 ? 30 : tot > 60 ? 10 : 5;
    for (let s = 0; s <= tot; s += step) box.append(el('span', { class: 'tick', style: `left:${s / tot * 100}%` }, s + ' s'));
    let lastX = -100;
    ev.forEach(({ t: tt, c }) => {
      const x = tt / tot * 100;
      const lbl = c.kind === 'goal' ? '→ ' + c.target : String(c.value);
      box.append(el('span', { class: 'ev ' + (c.kind === 'goal' ? 'goal' : c.kind === 'end' ? 'end' : 'order'), style: `left:${x}%`, title: `t≈${tt.toFixed(1)} s · ${c.target} · ${lbl}` }));
      if (c.kind !== 'goal' && x - lastX > 9) { box.append(el('span', { class: 'lab', style: `left:${x}%` }, lbl)); lastX = x; }
    });
  }

  // ------------------------------------------------------------------ 7. ficheros
  let built = null, curFile = 0;
  function renderFiles() {
    built = G.build(cfg, IP.lang);
    const tabs = $('#fileTabs'); tabs.innerHTML = '';
    built.files.forEach((f, i) => {
      const b = el('button', { type: 'button', role: 'tab', class: i === curFile ? 'is-on' : '' }, f.path.split('/').pop());
      b.title = f.path;
      b.addEventListener('click', () => { curFile = i; renderFiles(); });
      tabs.append(b);
    });
    const f = built.files[Math.min(curFile, built.files.length - 1)];
    $('#fileView').textContent = '# ' + f.path + '\n' + f.content;
    const ws = $('#wsPath'); if (document.activeElement !== ws) ws.value = cfg.ws;
    const can = !built.errors.length;
    ['#dlZip', '#dlZip2'].forEach(s => { $(s).disabled = !can; $(s).title = can ? '' : T('Corrige los errores marcados en rojo', 'Fix the errors marked in red'); });
  }

  // ------------------------------------------------------------------ resumen y avisos
  function renderStatus() {
    const R = cfg.robots, t = cfg.task;
    const n = (k) => R.filter(r => r.kind === k).length;
    const modeTxt = { virtual: T('virtual', 'virtual'), physical: T('real', 'real'), hybrid: T('híbrido', 'hybrid') }[G.experimentMode(cfg)];
    const taskTxt = { distance: T('formación por distancias', 'distance formation'), herding: T('pastoreo', 'herding'), triangulated: T('formación triangulada', 'triangulated formation'), none: T('sin formación', 'no formation') }[t.mode];
    const T0 = G.targets(cfg), E = G.formationEdges(cfg, T0);
    $('#summary').innerHTML = `<b>${G.safeName(cfg.name)}</b><br>${n('crazyflie')} Crazyflie · ${n('khepera')} Khepera IV · ${T('modo', 'mode')} <b>${modeTxt}</b><br>${taskTxt}${t.mode === 'distance' ? ` · ${G.SHAPES[t.shape].label[Li].toLowerCase()} · ${E.length} ${T('enlaces', 'links')} · ${t.law}${t.law === 'ML3' ? '' : '_' + t.output}` : ''}<br>${G.commandsOf(cfg).length + 1} ${T('órdenes', 'commands')} · ${cfg.env.tool}`;
    const m = $('#msgs'); m.innerHTML = '';
    built.errors.forEach(x => m.append(el('li', { class: 'err' }, '✕ ' + x)));
    built.warnings.forEach(x => m.append(el('li', { class: 'warn' }, '⚠ ' + x)));
    if (!built.errors.length && !built.warnings.length) m.append(el('li', { class: 'ok' }, '✓ ' + T('Configuración lista para descargar.', 'Configuration ready to download.')));
  }

  // ------------------------------------------------------------------ vista previa 3D
  const sc = new IP.Scene3D($('#cv'), { az: -38, el: 24, radius: 1.75, target: [0, 0, 0.5] });
  let view = 'both', playing = false, u = 1;
  IP.seg($('#viewSeg'), [{ value: 'both', label: T('Ambos', 'Both') }, { value: 'start', label: T('Inicio', 'Start') }, { value: 'target', label: T('Objetivo', 'Target') }], view, (v) => { view = v; });
  const slider = $('#playT');
  slider.addEventListener('input', () => { u = parseFloat(slider.value); playing = false; });
  $('#play').addEventListener('click', () => { u = 0; playing = true; });
  const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  let cache = null;
  function sceneData() {
    if (cache) return cache;
    const Tg = G.targets(cfg).map(p => p || [0, 0, 0]);
    const tgt = cfg.task.mode === 'none' ? cfg.robots.map(r => [r.x, r.y, G.KINDS[r.kind].air ? 1.1 : 0]) : Tg;
    cache = { tgt, E: G.formationEdges(cfg, tgt) };
    return cache;
  }
  function surfaceWire(t) {
    const segs = [];
    const add = (f, nu = 24, nv = 6) => {
      for (let j = 1; j <= nv; j++) { const ring = []; for (let i = 0; i <= nu; i++) ring.push(f(i / nu, j / nv)); segs.push(ring); }
      for (let i = 0; i < 12; i++) { const mer = []; for (let j = 0; j <= nv; j++) mer.push(f(i / 12, j / nv)); segs.push(mer); }
    };
    if (t.shape === 'sphere') add((s, v) => { const th = s * 2 * Math.PI, ph = (1 - v) * Math.PI / 2; return [t.cx + t.R * Math.cos(ph) * Math.cos(th), t.cy + t.R * Math.cos(ph) * Math.sin(th), t.cz + t.R * Math.sin(ph)]; });
    if (t.shape === 'ellipsoid') add((s, v) => { const th = s * 2 * Math.PI, ph = (1 - v) * Math.PI / 2; return [t.cx + t.ea * Math.cos(ph) * Math.cos(th), t.cy + t.eb * Math.cos(ph) * Math.sin(th), t.cz + t.ec * Math.sin(ph)]; });
    if (t.shape === 'cone') add((s, v) => { const th = s * 2 * Math.PI, h = v; return [t.cx + t.a * (1 - h) * Math.cos(th), t.cy + t.a * (1 - h) * Math.sin(th), t.cz + t.c * h]; });
    return segs.map(r => r.filter(p => p[2] > -0.01));
  }
  IP.animate($('#cv').parentElement, (dt) => {
    if (playing) { u = Math.min(1, u + dt / 5); slider.value = u; if (u >= 1) playing = false; }
    const { tgt, E } = sceneData(), R = cfg.robots;
    sc.begin();
    for (let k = -2; k <= 2; k += 0.5) {
      sc.line([k, -2, 0], [k, 2, 0], { color: '--border', width: 1, scaleWidth: false });
      sc.line([-2, k, 0], [2, k, 0], { color: '--border', width: 1, scaleWidth: false });
    }
    sc.line([0, 0, 0], [0.4, 0, 0], { color: '--danger', width: 2 }); sc.line([0, 0, 0], [0, 0.4, 0], { color: '--ok', width: 2 });
    if (cfg.task.mode === 'distance' || cfg.task.mode === 'triangulated') {
      surfaceWire(cfg.task).forEach(r => sc.polyline(r, { color: '--s3', width: 1, alpha: 0.22, scaleWidth: false }));
    }
    const showStart = view !== 'target', showTgt = view !== 'start';
    // posiciones animadas: despegue (0-0.3) y desplazamiento al objetivo (0.3-1)
    const cur = R.map((r, i) => {
      const air = G.KINDS[r.kind].air, s0 = [r.x, r.y, air ? 0.03 : 0], to = tgt[i] || s0;
      if (view === 'start') return s0;
      if (view === 'target') return to;
      const a = ease(IP.clamp(u / 0.3, 0, 1)), b = ease(IP.clamp((u - 0.3) / 0.7, 0, 1));
      const up = air ? [r.x, r.y, 0.03 + (1.1 - 0.03) * a] : s0;
      return [up[0] + (to[0] - up[0]) * b, up[1] + (to[1] - up[1]) * b, up[2] + (to[2] - up[2]) * b];
    });
    if (showTgt) {
      E.forEach(([i, j]) => sc.line(tgt[i], tgt[j], { color: '--s3', width: 1.2, dash: [4, 4], alpha: 0.7 }));
      tgt.forEach(p => sc.point(p, { r: 3, color: '--s3', alpha: 0.6 }));
    }
    if (view === 'both' && u > 0.3) E.forEach(([i, j]) => sc.line(cur[i], cur[j], { color: '--accent', width: 1.6, alpha: Math.min(1, (u - 0.3) * 3) }));
    if (showStart || view === 'both') {
      R.forEach((r, i) => {
        const p = cur[i], air = G.KINDS[r.kind].air, real = r.type !== 'virtual';
        if (air) sc.drone(p, { color: '--s1', size: 0.07, alpha: real ? 0.55 : 0.2, dot: 3 });
        else sc.rover(p, 0, { color: '--s2', size: 0.08, virtual: !real });
        if (real) sc.point(p, { r: 7, color: 'transparent', stroke: IP.css('--text'), strokeWidth: 1.4, alpha: 0.9 });
        if (R.length <= 16) sc.text([p[0], p[1], p[2] + 0.14], r.name, { size: 10, color: '--muted' });
      });
    }
    sc.draw(dt);
  }).start();

  // ------------------------------------------------------------------ ciclo de actualización
  let tFiles = 0, tSave = 0;
  function changed(isStructural) {
    if (isStructural) return structural();
    activePreset = null;
    cache = null;
    clearTimeout(tFiles);
    tFiles = setTimeout(() => { renderFiles(); renderStatus(); if (!cfg.commands) renderCommands(); else renderTimeline(G.commandsOf(cfg)); }, 120);
    clearTimeout(tSave);
    tSave = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) { /* sin almacenamiento */ } }, 400);
  }
  function structural() {
    G.syncRobots(cfg);
    renderRobots();
    if (!$('#taskBody').contains(document.activeElement)) renderTask();
    renderCommands();
    changed();
  }
  function renderAll() {
    cache = null;
    renderPresets(); renderFleet(); renderRobots(); renderLowLevel(); renderTask(); renderEnv(); renderCommands();
    renderFiles(); renderStatus();
    try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) { /* */ }
  }

  // ------------------------------------------------------------------ botones
  $('#addCmd').addEventListener('click', () => { materialize(); cfg.commands.push({ delay: 5, trigger: 'time', target: 'swarm', kind: 'order', value: 'formation_stop' }); renderCommands(); changed(); });
  $('#resetCmd').addEventListener('click', () => { cfg.commands = null; renderCommands(); changed(); });
  $('#wsPath').addEventListener('input', (e) => { cfg.ws = e.target.value.trim() || '~/roboticpark_ws'; changed(); });
  function save(name, data, type) {
    const blob = new Blob([data], { type });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function downloadZip() {
    built = G.build(cfg, IP.lang);
    if (built.errors.length) { renderStatus(); $('#msgs').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const files = built.files.map(f => ({ path: built.name + '/' + f.path, content: f.content, exec: f.exec }));
    save(built.name + '.zip', window.RPZip.make(files), 'application/zip');
  }
  $('#dlZip').addEventListener('click', downloadZip);
  $('#dlZip2').addEventListener('click', downloadZip);
  $('#dlJson').addEventListener('click', () => { const f = G.build(cfg, IP.lang).files.find(x => x.path === 'experimento.json'); save(G.safeName(cfg.name) + '.json', f.content, 'application/json'); });
  $('#copyFile').addEventListener('click', async (e) => {
    const f = built.files[curFile], b = e.currentTarget, old = b.innerHTML;
    try { await navigator.clipboard.writeText(f.content); b.textContent = T('¡Copiado!', 'Copied!'); } catch (er) { b.textContent = T('No se pudo copiar', 'Could not copy'); }
    setTimeout(() => { b.innerHTML = old; }, 1500);
  });
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const o = JSON.parse(await file.text());
      if (!o || !o.fleet || !o.task) throw new Error('formato');
      cfg = merge(G.defaultConfig(), o); activePreset = null;
      G.syncRobots(cfg); renderAll();
      $('#plantillas').scrollIntoView({ behavior: 'smooth' });
    } catch (er) {
      alert(T('El fichero no es una configuración del configurador (experimento.json).', 'The file is not a configurator configuration (experimento.json).'));
    }
    e.target.value = '';
  });

  IP.page();
  renderAll();
})();
