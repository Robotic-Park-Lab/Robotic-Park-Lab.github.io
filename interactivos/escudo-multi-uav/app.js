/* ============================================================
   Página interactiva: Distributed multi-UAV shield formation
   based on virtual surface constraints (RAS, 2024)
   Usa ip.js, scene3d.js y formacion.js (objeto FORM).
   ============================================================ */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, V = FORM.v, T = IP.t;
  IP.page();

  const RING_COLORS = ['--s1', '--s2', '--s3', '--s4', '#e6a817', '#16a085', '#c0392b', '--s5'];
  const ringColor = (k) => RING_COLORS[k % RING_COLORS.length];
  const sizeOf = (S) => Math.max(S.prm.a || S.prm.R || 1, S.prm.b || 0, S.prm.c || 0, S.hmax);
  const LREF = 12;            // escala de los ejemplos del artículo (semielipsoide 10 × 15 × 12)
  /** Ganancias del artículo reescaladas para que la escala de tiempo no dependa del tamaño. */
  const gains = (S, k1, k2) => { const L = sizeOf(S); return { k1: k1 * (LREF / L) ** 2, k2: k2 * (L / LREF) ** 2, k3: 1e-3 * (L / LREF) ** 3 }; };
  const edgeErrColor = (F, P) => (k, [i, j]) => {
    const e = Math.abs(V.norm(V.sub(P[i], P[j])) - F.dstar[k]) / F.dstar[k];
    return e > 0.12 ? '--s2' : null;
  };

  /* ------------------------------------------------------------
     Estado compartido: superficie y formación objetivo
     ------------------------------------------------------------ */
  const ST = { surf: { type: 'elipsoide', a: 10, b: 15, c: 12 }, N: 50, epsf: 0.3, listeners: [] };
  const makeS = (s = ST.surf) => s.type === 'esfera' ? FORM.surface('esfera', { R: s.a }) : FORM.surface(s.type, s);
  function rebuild() {
    ST.S = makeS();
    const L = sizeOf(ST.S);
    ST.F = FORM.buildShield(ST.S, ST.N, { eps: ST.epsf * FORM.rings(ST.S, ST.N).d, h0: 0.02 * ST.S.hmax });
    ST.badBefore = FORM.delaunay(ST.F).filter(x => !x.ok).length; ST.flips = 0;
    if (ST.flip) { const r = FORM.flipToDelaunay(ST.F); ST.F = r.F; ST.flips = r.flips; }
    ST.L = L;
    ST.listeners.forEach(f => f());
  }
  const onChange = (f) => ST.listeners.push(f);

  /* ------------------------------------------------------------
     0. Portada: escudo de 50 drones que se forma en bucle
     ------------------------------------------------------------ */
  (function hero() {
    const cv = $('#heroCanvas');
    const S = FORM.surface('elipsoide', { a: 10, b: 15, c: 12 });
    const F = FORM.buildShield(S, 50, { h0: 0.25 });
    const sc = new IP.Scene3D(cv, { az: -35, el: 24, radius: 15, target: [0, 0, 4.5], autoRotate: IP.reducedMotion() ? 0 : 9 });
    let sim, seed = 3;
    const restart = () => { sim = new FORM.Sim({ S, F, P0: FORM.perturb(F.P, 4, seed++), law: 'ras', k1: 0.1, k2: 1e3, k3: 1e-3, eps: 0.2, dt: 0.01 }); };
    restart();
    // colores claros sobre el fondo oscuro de la portada
    const cols = ['#4fb98a', '#f0a35f', '#6aa8ec', '#c08ad8', '#e6c34a'];
    IP.animate(cv.parentElement, (dt) => {
      if (sim.t < 22) sim.advance(dt * 2.5); else if (sim.t < 26) sim.t += dt; else restart();
      sc.begin();
      FORM.wire(S, 6, 40).forEach(l => sc.polyline(l, { color: 'rgba(200,230,215,0.35)', width: 0.8, zb: -1e3 }));
      F.edges.forEach(([i, j], k) => {
        const e = Math.abs(V.norm(V.sub(sim.p[i], sim.p[j])) - F.dstar[k]) / F.dstar[k];
        sc.line(sim.p[i], sim.p[j], { color: e > 0.12 ? '#f0a35f' : '#7fd1a8', width: 1.3, alpha: 0.85 });
      });
      sim.p.forEach((q, i) => sc.drone(q, { color: cols[F.level[i] % cols.length], size: 0.55, dot: 2.5, alpha: 0.3 }));
      sc.draw(dt);
    }).start();
  })();

  /* ------------------------------------------------------------
     1. Mapa conceptual
     ------------------------------------------------------------ */
  IP.conceptMap($('#cmap'), {
    view: [1040, 645], mobileView: [420, 800],
    nodes: [
      { id: 'prob', label: T('Proteger\nuna zona', 'Protect\nan area'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, href: '#superficie', text: T('<p>Desplegar un equipo de UAV alrededor de una infraestructura, formando un <b>escudo</b> para, por ejemplo, vigilar amenazas externas. Cada dron sólo mide distancias y posiciones relativas de sus vecinos en su propio sistema de referencia.</p>', '<p>Deploy a team of UAVs around an infrastructure, forming a <b>shield</b> to, for example, monitor external threats. Each drone only measures distances and relative positions of its neighbours in its own reference frame.</p>') },
      { id: 'surf', label: T('Escudo =\ncuádrica', 'Shield =\nquadric'), kind: 'theory', x: 520, y: 75, mx: 310, my: 60, href: '#superficie', text: T('<p>La forma del escudo es una superficie \\(p^\\top Q_1 p + Q_2 = 0\\) en forma normal (semielipsoide, cilindro, cono…), con \\(z \\ge 0\\).</p>', '<p>The shape of the shield is a surface \\(p^\\top Q_1 p + Q_2 = 0\\) in normal form (semi-ellipsoid, cylinder, cone…), with \\(z \\ge 0\\).</p>') },
      { id: 'alg', label: T('Algoritmo 1\nd y anillos', 'Algorithm 1\nd and rings'), kind: 'method', x: 890, y: 75, mx: 310, my: 170, href: '#construccion', text: T('<p>Igualando el área de la superficie con la de triángulos equiláteros de lado \\(d\\) se obtiene \\(d\\), y repitiendo la idea por encima de cada altura, los anillos \\(\\{n_k, d_k, h_k\\}\\). Sin resolver ningún problema de optimización.</p>', '<p>Equating the surface area with that of equilateral triangles of side \\(d\\) gives \\(d\\), and repeating the idea above each height gives the rings \\(\\{n_k, d_k, h_k\\}\\). Without solving any optimisation problem.</p>') },
      { id: 'links', label: T('Enlaces\nd ≤ d + ε', 'Links\nd ≤ d + ε'), kind: 'method', x: 890, y: 235, mx: 110, my: 170, href: '#construccion', text: T('<p>Vecinos del propio anillo, más los del anillo superior a distancia \\(\\le d + \\varepsilon\\), sin cruces en la proyección. Las distancias reales pasan a ser las objetivo \\(d^*_{ij}\\).</p>', '<p>Neighbours in the same ring, plus those of the upper ring at distance \\(\\le d + \\varepsilon\\), with no crossings in the projection. The actual distances become the targets \\(d^*_{ij}\\).</p>') },
      { id: 'del', label: T('Test local\nde Delaunay', 'Local Delaunay\ntest'), kind: 'theory', x: 520, y: 235, mx: 110, my: 280, href: '#delaunay', text: T('<p>El signo del determinante \\(|M_{ABCD}|\\) dice si un nodo D cae dentro de la circunferencia circunscrita del triángulo ABC (Teorema 1). Cada agente puede comprobarlo localmente.</p>', '<p>The sign of the determinant \\(|M_{ABCD}|\\) tells whether a node D lies inside the circumcircle of triangle ABC (Theorem 1). Each agent can check it locally.</p>') },
      { id: 'rig', label: T('Rigidez\nrango 3N − s', 'Rigidity\nrank 3N − s'), kind: 'theory', x: 150, y: 235, mx: 310, my: 280, href: '#rigidez', text: T('<p>La triangulación de Delaunay es rígida. Sobre la superficie, la matriz aumentada \\(J_R\\) tiene rango \\(3N-s\\): \\(s\\) cuenta los giros que permiten las simetrías de la cuádrica (Lema 4).</p>', '<p>The Delaunay triangulation is rigid. On the surface, the augmented matrix \\(J_R\\) has rank \\(3N-s\\): \\(s\\) counts the rotations allowed by the quadric\'s symmetries (Lemma 4).</p>') },
      { id: 'pot', label: T('Potencial W', 'Potential W'), kind: 'theory', x: 150, y: 400, mx: 110, my: 390, href: '#control', text: T('<p>\\(W\\) suma los errores de distancia al cuadrado y la distancia a la superficie, \\(f(p_i)^2\\). Es nulo sólo en el objetivo.</p>', '<p>\\(W\\) adds the squared distance errors and the distance to the surface, \\(f(p_i)^2\\). It is zero only at the target.</p>') },
      { id: 'law', label: T('Ley de\ngradiente', 'Gradient\nlaw'), kind: 'method', x: 520, y: 400, mx: 310, my: 390, href: '#control', text: T('<p>\\(u_i = -\\partial W/\\partial p_i\\): distribuida, sólo con posiciones relativas de los vecinos y la propia posición. Más un campo repulsivo para no cruzar \\(z = 0\\).</p>', '<p>\\(u_i = -\\partial W/\\partial p_i\\): distributed, using only neighbours\' relative positions and the agent\'s own position. Plus a repulsive field to avoid crossing \\(z = 0\\).</p>') },
      { id: 'stab', label: T('Estabilidad\nlocal', 'Local\nstability'), kind: 'result', x: 890, y: 400, mx: 310, my: 500, href: '#rigidez', text: T('<p>Teorema 2: el sistema es localmente asintóticamente estable en las distancias deseadas sobre la superficie, aunque no se cumplan las condiciones clásicas de rigidez mínima e infinitesimal.</p>', '<p>Theorem 2: the system is locally asymptotically stable at the desired distances on the surface, even though the classical minimal and infinitesimal rigidity conditions do not hold.</p>') },
      { id: 'sim', label: T('Simulación\nN = 50', 'Simulation\nN = 50'), kind: 'result', x: 300, y: 565, mx: 110, my: 610, href: '#control', text: T('<p>Con perturbaciones iniciales hasta \\(\\delta = 10\\), los errores \\(\\|e(z)\\|\\) y \\(\\|f(p)\\|\\) caen más del 99,7 % y 98,3 % en 8 s. Con \\(\\delta = 14\\) el resultado ya no es aceptable.</p>', '<p>With initial perturbations up to \\(\\delta = 10\\), the errors \\(\\|e(z)\\|\\) and \\(\\|f(p)\\|\\) drop by more than 99.7% and 98.3% in 8 s. With \\(\\delta = 14\\) the result is no longer acceptable.</p>') },
      { id: 'exp', label: T('12 Crazyflie\n6 reales + 6 virtuales', '12 Crazyflies\n6 real + 6 virtual'), kind: 'result', x: 740, y: 565, mx: 310, my: 610, href: '#experimento', text: T('<p>Validación en Robotic Park con una capa de coordinación a 10 Hz sobre el control de cada dron. Semiesfera de 1 m, 26 enlaces.</p>', '<p>Validation in Robotic Park with a 10 Hz coordination layer on top of each drone\'s control. 1 m hemisphere, 26 links.</p>') },
      { id: 'rep', label: T('Campo repulsivo\nz > 0', 'Repulsive field\nz > 0'), kind: 'method', x: 520, y: 565, mx: 110, my: 720, href: '#control', text: T('<p>Un potencial repulsivo clásico de evitación de obstáculos mantiene los drones por encima del plano \\(z=0\\) (y por debajo de la cota superior en cilindros y conos).</p>', '<p>A classical repulsive obstacle-avoidance potential keeps the drones above the plane \\(z=0\\) (and below the upper bound for cylinders and cones).</p>') }
    ],
    edges: [
      { from: 'prob', to: 'surf', label: T('se modela', 'modelled as') },
      { from: 'surf', to: 'alg', label: 'A, L_b, h_max' },
      { from: 'alg', to: 'links' },
      { from: 'links', to: 'del', label: T('se comprueba', 'checked') },
      { from: 'del', to: 'rig', label: T('grafo rígido', 'rigid graph') },
      { from: 'surf', to: 'pot', label: 'f(p)', bend: -0.18 },
      { from: 'links', to: 'pot', label: 'd*_ij', bend: 0.05 },
      { from: 'pot', to: 'law', label: '−∇W' },
      { from: 'law', to: 'stab' },
      { from: 'rig', to: 'stab', label: T('Lema 4', 'Lemma 4'), bend: 0.25 },
      { from: 'rep', to: 'law', label: '+ u_r' },
      { from: 'stab', to: 'exp', label: T('se valida', 'validated') },
      { from: 'law', to: 'sim', bend: 0.1 }
    ]
  }, { panel: $('#cmapPanel'), initial: 'alg' });

  /* ------------------------------------------------------------
     2. Superficie
     ------------------------------------------------------------ */
  (function surfaceSection() {
    const sc = new IP.Scene3D($('#surfCanvas'), { az: -40, el: 22, radius: 16, target: [0, 0, 4] });
    const ctl = IP.controls($('#surfControls'), [
      { id: 'type', type: 'select', label: T('Tipo de escudo', 'Shield type'), value: ST.surf.type, options: [
        { value: 'elipsoide', label: T('Semielipsoide', 'Semi-ellipsoid') }, { value: 'esfera', label: T('Semiesfera', 'Hemisphere') },
        { value: 'cilindro', label: T('Cilindro de altura c', 'Cylinder of height c') }, { value: 'cono', label: T('Cono de altura c', 'Cone of height c') }] },
      { id: 'a', label: T('Semieje a', 'Semi-axis a'), sym: 'a', min: 2, max: 20, step: 0.5, value: ST.surf.a, digits: 1, unit: 'm' },
      { id: 'b', label: T('Semieje b', 'Semi-axis b'), sym: 'b', min: 2, max: 20, step: 0.5, value: ST.surf.b, digits: 1, unit: 'm' },
      { id: 'c', label: T('Altura c', 'Height c'), sym: 'c', min: 2, max: 20, step: 0.5, value: ST.surf.c, digits: 1, unit: 'm' }
    ], IP.debounce(apply, 40));
    function apply() {
      const v = ctl.values;
      ST.surf = { type: v.type, a: v.a, b: v.type === 'elipsoide' ? v.b : v.a, c: v.type === 'esfera' ? v.a : v.c };
      ctl.el('b').closest('.ip-control').style.display = v.type === 'elipsoide' ? '' : 'none';
      ctl.el('c').closest('.ip-control').style.display = v.type === 'esfera' ? 'none' : '';
      rebuild();
    }
    ST.syncControls = () => { ['type', 'a', 'b', 'c'].forEach(k => ctl.set(k, ST.surf[k], true)); ctl.el('b').closest('.ip-control').style.display = ST.surf.type === 'elipsoide' ? '' : 'none'; ctl.el('c').closest('.ip-control').style.display = ST.surf.type === 'esfera' ? 'none' : ''; };
    const f2 = (x) => x === 0 ? '0' : fmt(x, Math.abs(x) < 0.01 ? 5 : 4);
    onChange(() => {
      const S = ST.S, q = S.q, s = ST.surf;
      $('#q1mat').innerHTML = [f2(q[0]), '0', '0', '0', f2(q[1]), '0', '0', '0', f2(q[2])].map(x => `<span>${x}</span>`).join('');
      $('#q2val').textContent = s.type === 'cono' ? T('(forma con término lineal)', '(form with a linear term)') : '−1';
      const notes = {
        elipsoide: T(`\\(\\tfrac{x^2}{a^2}+\\tfrac{y^2}{b^2}+\\tfrac{z^2}{c^2}=1\\), \\(z\\ge 0\\). Área ≈ ${fmt(S.capArea(0), 1)} m², borde L_b = ${fmt(S.perim(0), 2)} m.`, `\\(\\tfrac{x^2}{a^2}+\\tfrac{y^2}{b^2}+\\tfrac{z^2}{c^2}=1\\), \\(z\\ge 0\\). Area ≈ ${fmt(S.capArea(0), 1)} m², boundary L_b = ${fmt(S.perim(0), 2)} m.`),
        esfera: T(`\\(x^2+y^2+z^2=R^2\\), \\(z \\ge 0\\). Área = 2πR² = ${fmt(S.capArea(0), 1)} m².`, `\\(x^2+y^2+z^2=R^2\\), \\(z \\ge 0\\). Area = 2πR² = ${fmt(S.capArea(0), 1)} m².`),
        cilindro: T(`\\(\\tfrac{x^2+y^2}{a^2}=1\\), \\(0\\le z\\le c\\): cuádrica degenerada (q₃ = 0). Área lateral ${fmt(S.capArea(0), 1)} m².`, `\\(\\tfrac{x^2+y^2}{a^2}=1\\), \\(0\\le z\\le c\\): degenerate quadric (q₃ = 0). Lateral area ${fmt(S.capArea(0), 1)} m².`),
        cono: T(`\\(\\tfrac{x^2+y^2}{a^2}-\\tfrac{(z-c)^2}{c^2}=0\\), \\(0\\le z<c\\), vértice en \\(z=c\\) (excluido). Área lateral ${fmt(S.capArea(0), 1)} m².`, `\\(\\tfrac{x^2+y^2}{a^2}-\\tfrac{(z-c)^2}{c^2}=0\\), \\(0\\le z<c\\), apex at \\(z=c\\) (excluded). Lateral area ${fmt(S.capArea(0), 1)} m².`)
      };
      $('#surfNote').innerHTML = notes[s.type]; IP.math($('#surfNote'));
      sc.o.radius = sizeOf(S) * 1.05; sc.o.target = [0, 0, S.hmax * 0.35];
    });
    IP.animate($('#surfCanvas').parentElement, (dt) => {
      if (!ST.S) return;
      sc.begin(); FORM.drawScene(sc, { S: ST.S, P: [], wireRings: 9, wireAlpha: 0.7, ground: sizeOf(ST.S) * 1.1 }); sc.draw(dt);
    }).start();
  })();

  /* ------------------------------------------------------------
     3. Algoritmo 1: construcción del escudo
     ------------------------------------------------------------ */
  (function construction() {
    const sc = new IP.Scene3D($('#buildCanvas'), { az: -35, el: 24, radius: 16, target: [0, 0, 4] });
    const ctl = IP.controls($('#buildControls'), [
      { id: 'N', label: T('Número de drones', 'Number of drones'), sym: 'N', min: 4, max: 120, step: 1, value: ST.N, digits: 0 },
      { id: 'eps', label: T('Holgura de enlace ε / d', 'Link slack ε / d'), sym: 'ε', min: 0, max: 0.41, step: 0.01, value: ST.epsf, digits: 2, hint: T('Obs. 2: ε ≤ (√2 − 1)·d ≈ 0,41·d', 'Rem. 2: ε ≤ (√2 − 1)·d ≈ 0.41·d') },
      { id: 'flip', type: 'toggle', label: T('Corregir intercambiando diagonales (no está en el artículo)', 'Fix by swapping diagonals (not in the paper)'), value: false, hint: T('Si el test local detecta un triángulo no Delaunay, se cambia la arista compartida con su vecino (flip de Lawson).', 'If the local test detects a non-Delaunay triangle, the edge shared with its neighbour is swapped (Lawson flip).') }
    ], IP.debounce((v) => { ST.N = Math.round(v.N); ST.epsf = v.eps; ST.flip = v.flip; presetNote = ''; rebuild(); }, 40));
    let prog = 99, animating = false, presetNote = '';
    const PAPER = {
      t3: { surf: { type: 'elipsoide', a: 10, b: 15, c: 12 }, N: 50, note: T('Artículo (Tabla 3): d = 5,154; h = 0*, 5,078, 8,422, 10,750, 11,938; n = 16, 14, 11, 7, 2; d_k = 4,958, 5,134, 5,137, 5,042, 4,039.', 'Paper (Table 3): d = 5.154; h = 0*, 5.078, 8.422, 10.750, 11.938; n = 16, 14, 11, 7, 2; d_k = 4.958, 5.134, 5.137, 5.042, 4.039.') },
      t2: { surf: { type: 'esfera', a: 15, b: 15, c: 15 }, N: 50, note: T('Artículo (Tabla 2, N = 50): d = 6,27; f = 82 triángulos; e_b = 16 nodos en el borde; error de área 0,01.', 'Paper (Table 2, N = 50): d = 6.27; f = 82 triangles; e_b = 16 boundary nodes; area error 0.01.') },
      real: { surf: { type: 'esfera', a: 1, b: 1, c: 1 }, N: 12, note: T('Artículo (experimento): d = 0,97 m; anillos de 7 y 5 drones a 0,8 y 1,57 m (es decir, h = 0 y 0,77 m sobre el centro), d₀ = 0,9 m, d₁ = 0,80 m, 26 enlaces.', 'Paper (experiment): d = 0.97 m; rings of 7 and 5 drones at 0.8 and 1.57 m (i.e. h = 0 and 0.77 m above the centre), d₀ = 0.9 m, d₁ = 0.80 m, 26 links.') }
    };
    $('#buildPreset').addEventListener('change', (e) => {
      const p = PAPER[e.target.value]; if (!p) return;
      ST.surf = Object.assign({}, p.surf); ST.N = p.N; ctl.set('N', p.N, true); ST.syncControls && ST.syncControls();
      presetNote = p.note; rebuild(); e.target.value = '';
    });
    $('#buildAnim').addEventListener('click', () => { prog = 0; animating = true; });
    onChange(() => {
      const F = ST.F, S = ST.S, N = ST.N;
      sc.o.radius = sizeOf(S) * 0.95; sc.o.target = [0, 0, S.hmax * 0.45];
      const nb = F.rings[0].n, f = 2 * N - 2 - nb, Af = Math.sqrt(3) / 4 * F.d ** 2;
      const D = FORM.delaunay(F), bad = D.filter(x => !x.ok).length;
      const Ne = F.edges.length, okNe = Ne >= 2 * N - 2 && Ne <= 3 * N - 6;
      const c = (k, v, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${v}</b></div>`;
      $('#buildReadouts').innerHTML =
        c(T('d (ec. 15)', 'd (eq. 15)'), fmt(F.d, 3) + ' m', 'hl') + c(T('Nodos en el borde n_b', 'Boundary nodes n_b'), String(nb)) + c(T('Anillos', 'Rings'), String(F.rings.length)) +
        c(T('Aristas N_e', 'Edges N_e'), `${Ne}`, okNe ? 'hl' : 'bad') + c(T('Prop. 1: [2N−2, 3N−6]', 'Prop. 1: [2N−2, 3N−6]'), `[${2 * N - 2}, ${3 * N - 6}] ${okNe ? '✓' : '✗'}`, okNe ? '' : 'bad') +
        c(T('Triángulos f = 2N−2−e_b', 'Triangles f = 2N−2−e_b'), String(f)) + c(T('Error de área (A − f·A_f)/A', 'Area error (A − f·A_f)/A'), fmt((F.A - f * Af) / F.A, 4)) +
        c(T('Triángulos no Delaunay', 'Non-Delaunay triangles'), ST.flip ? T(`${ST.badBefore} → ${bad} (${ST.flips} cambios)`, `${ST.badBefore} → ${bad} (${ST.flips} swaps)`) : `${bad} ${T('de', 'of')} ${F.tri.length}`, bad ? 'bad' : 'hl');
      $('#ringTable').innerHTML = T('<thead><tr><th>Anillo k</th><th>Altura h_k (m)</th><th>Drones n_k</th><th>Separación d_k (m)</th></tr></thead><tbody>', '<thead><tr><th>Ring k</th><th>Height h_k (m)</th><th>Drones n_k</th><th>Spacing d_k (m)</th></tr></thead><tbody>') +
        F.rings.map((r, k) => `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${IP.color(ringColor(k))};margin-right:6px"></span>${k}</td><td class="num">${k === 0 ? '0*' : fmt(r.h, 3)}</td><td class="num">${r.n}</td><td class="num">${fmt(r.d, 3)}</td></tr>`).join('') + '</tbody>';
      $('#ringNote').innerHTML = (presetNote ? `<b>${presetNote}</b><br>` : '') + T('0*: el anillo inferior se sitúa en realidad un poco por encima de z = 0 por el campo repulsivo (Sec. 6.1).', '0*: the bottom ring actually sits slightly above z = 0 because of the repulsive field (Sec. 6.1).') +
        (bad && !ST.flip ? T(` El test local (Teorema 1) detecta ${bad} triángulo(s) con un nodo ligeramente dentro de su circunferencia: el algoritmo de enlaces no lo garantiza siempre. Puedes inspeccionarlos en la sección 4 o activar la corrección.`, ` The local test (Theorem 1) detects ${bad} triangle(s) with a node slightly inside its circle: the linking algorithm does not always guarantee it. You can inspect them in section 4 or enable the fix.`) : '');
      prog = animating ? prog : 99;
    });
    IP.animate($('#buildCanvas').parentElement, (dt) => {
      const F = ST.F; if (!F) return;
      const K = F.rings.length;
      if (animating) { prog += dt * 1.1; if (prog > K + 1) animating = false; }
      sc.begin();
      FORM.drawScene(sc, { S: ST.S, P: [], wireRings: 6, wireAlpha: 0.25, ground: sizeOf(ST.S) * 1.1 });
      const vis = F.P.map((_, i) => F.level[i] < prog);
      const drop = (i) => { const k = F.level[i], s = IP.clamp(prog - k, 0, 1), up = (1 - s) ** 2 * ST.S.hmax * 0.6; return [F.P[i][0], F.P[i][1], F.P[i][2] + up]; };
      F.edges.forEach(([i, j]) => { if (vis[i] && vis[j] && prog > Math.max(F.level[i], F.level[j]) + 0.6) sc.line(F.P[i], F.P[j], { color: '--s1', width: 1.4, alpha: 0.8 }); });
      // anillos (curva del corte) a medida que aparecen
      F.rings.forEach((r, k) => {
        if (prog < k) return; const { ax, ay } = ST.S.section(r.h); if (ax < 1e-6) return;
        const ring = []; for (let i = 0; i <= 64; i++) { const t = i / 64 * 2 * Math.PI; ring.push([ax * Math.cos(t), ay * Math.sin(t), r.h]); }
        sc.polyline(ring, { color: ringColor(k), width: 1, alpha: 0.5, dash: [4, 4] });
      });
      F.P.forEach((_, i) => { if (vis[i]) sc.drone(drop(i), { color: ringColor(F.level[i]), size: sizeOf(ST.S) * 0.035 }); });
      sc.draw(dt);
    }).start();
  })();

  /* ------------------------------------------------------------
     4. Delaunay: Fig. 1 y test 3D
     ------------------------------------------------------------ */
  (function delaunaySection() {
    // --- Fig. 1: las tres triangulaciones de {A, B, C, D, E}
    const pts = { A: [30, 175], B: [55, 35], C: [112, 112], D: [175, 30], E: [190, 170] };
    const cc2 = (a, b, c) => {
      const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
      const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
      const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
      return { x: ux, y: uy, r: Math.hypot(a[0] - ux, a[1] - uy) };
    };
    const TRI = [
      { tris: ['ABC', 'BDC', 'DEC', 'EAC'], hl: null, cap: 'Delaunay' },
      { tris: ['ABE', 'BDC', 'DEC', 'ECB'], hl: 'ABE', cap: T('C dentro del círculo de ABE', 'C inside the circle of ABE') },
      { tris: ['ADE', 'ABC', 'ACD', 'BDC'], hl: 'ADE', cap: T('B y C dentro del círculo de ADE', 'B and C inside the circle of ADE') }
    ];
    let svg = '';
    TRI.forEach((t, k) => {
      const ox = 10 + k * 200, oy = 5, S = 0.85;
      const P = (n) => [ox + pts[n][0] * S, oy + pts[n][1] * S];
      svg += `<g>`;
      if (t.hl) {
        const [a, b, c] = t.hl.split('').map(P), q = cc2(a, b, c);
        svg += `<circle cx="${q.x}" cy="${q.y}" r="${q.r}" fill="var(--danger-soft)" stroke="var(--danger)" stroke-dasharray="4 3" opacity="0.8"/>`;
        svg += `<polygon points="${[a, b, c].map(p => p.join(',')).join(' ')}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2"/>`;
      }
      const E = new Set(); t.tris.forEach(tr => [[0, 1], [1, 2], [2, 0]].forEach(([i, j]) => E.add([tr[i], tr[j]].sort().join(''))));
      E.forEach(e => { const [a, b] = e.split('').map(P); svg += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--s1)" stroke-width="1.6"/>`; });
      Object.keys(pts).forEach(n => {
        const p = P(n), inside = t.hl && !t.hl.includes(n) && (() => { const [a, b, c] = t.hl.split('').map(P), q = cc2(a, b, c); return Math.hypot(p[0] - q.x, p[1] - q.y) < q.r; })();
        svg += `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${inside ? 'var(--danger)' : 'var(--text)'}"/><text x="${p[0] + 7}" y="${p[1] - 6}">${n}</text>`;
      });
      svg += `<text class="cap" x="${ox + 85}" y="212" text-anchor="middle">${t.cap}</text></g>`;
    });
    $('#fig1').innerHTML = svg;

    // --- test 3D sobre la formación actual
    const sc = new IP.Scene3D($('#delCanvas'), { az: -30, el: 30, radius: 16, target: [0, 0, 4] });
    let ti = 0, Fd = null;
    const ctl = IP.controls($('#delControls'), [
      { id: 's', label: T('Acerca el nodo vecino D al circuncentro', 'Move neighbour node D towards the circumcentre'), min: 0, max: 1, step: 0.01, value: 0, digits: 2, hint: T('Cuando D entra en la circunferencia, |M_ABCD| cambia de signo y el triángulo deja de ser de Delaunay.', 'When D enters the circle, |M_ABCD| changes sign and the triangle is no longer Delaunay.') }
    ], () => update());
    function opposite(F, [a, b, c]) {
      for (const [x, y] of [[a, b], [b, c], [c, a]]) {
        const t2 = F.tri.find(t => t.includes(x) && t.includes(y) && !(t.includes(a) && t.includes(b) && t.includes(c)));
        if (t2) return t2.find(k => k !== x && k !== y);
      }
      let best = -1, bd = Infinity; F.P.forEach((p, k) => { if (k === a || k === b || k === c) return; const d = V.norm(V.sub(p, F.P[a])); if (d < bd) { bd = d; best = k; } });
      return best;
    }
    function current() {
      const F = ST.F; if (!F || !F.tri.length) return null;
      ti = ((ti % F.tri.length) + F.tri.length) % F.tri.length;
      const [a, b, c] = F.tri[ti], d = opposite(F, [a, b, c]);
      const cc = FORM.circumcircle(F.P[a], F.P[b], F.P[c]);
      const s = ctl.values.s, D = V.add(F.P[d], V.mul(V.sub(cc.m, F.P[d]), s));
      return { F, a, b, c, d, cc, D };
    }
    function update() {
      const q = current(); if (!q) return;
      const { F, a, b, c, d, cc, D } = q;
      const sc0 = Math.max(...F.P.map(V.norm));            // adimensionalizar como en FORM.delaunay
      const n = (p) => V.mul(p, 1 / sc0);
      const detM = FORM.inCap(n(F.P[a]), n(F.P[b]), n(F.P[c]), n(D));
      const lam = FORM.det([[...n(F.P[a]), 1], [...n(F.P[b]), 1], [...n(F.P[c]), 1], [...V.cross(V.sub(n(F.P[b]), n(F.P[a])), V.sub(n(F.P[c]), n(F.P[a]))), 0]]);
      const dist = V.norm(V.sub(D, cc.m)), inside = dist < cc.r - 1e-9;
      const others = F.P.map((p, k) => k).filter(k => k !== a && k !== b && k !== c && k !== d && V.norm(V.sub(F.P[k], cc.m)) < cc.r - 1e-9);
      Fd = { q, inside, others };
      const cl = (k, v, x = '') => `<div class="ip-readout ${x}"><span>${k}</span><b>${v}</b></div>`;
      $('#delReadouts').innerHTML = cl(T('|Λ| (Lema 2: < 0)', '|Λ| (Lemma 2: < 0)'), fmt(lam, 4), lam < 0 ? 'hl' : 'bad') + cl('|M_ABCD|', detM.toExponential(2).replace('.', ','), detM > 1e-7 ? 'bad' : 'hl') +
        cl('‖p_D − m_ABC‖', fmt(dist, 3) + ' m') + cl('r_ABC', fmt(cc.r, 3) + ' m') + cl(T('¿D dentro?', 'D inside?'), inside ? 'sí' : 'no', inside ? 'bad' : 'hl');
      $('#triBadge').textContent = T(`Triángulo ${ti + 1} de ${F.tri.length}: ${others.length || inside ? 'no Delaunay' : 'Delaunay ✓'}`, `Triangle ${ti + 1} of ${F.tri.length}: ${others.length || inside ? 'not Delaunay' : 'Delaunay ✓'}`);
      $('#triBadge').className = 'ip-pill ' + (others.length || inside ? 'danger' : '');
    }
    $('#triPrev').addEventListener('click', () => { ti--; ctl.set('s', 0, true); update(); });
    $('#triNext').addEventListener('click', () => { ti++; ctl.set('s', 0, true); update(); });
    onChange(() => { ti = 0; ctl.set('s', 0, true); sc.o.radius = sizeOf(ST.S) * 1.05; sc.o.target = [0, 0, ST.S.hmax * 0.35]; update(); });
    IP.animate($('#delCanvas').parentElement, (dt) => {
      if (!Fd) return;
      const { q, inside, others } = Fd, { F, a, b, c, d, cc, D } = q;
      sc.begin();
      FORM.drawScene(sc, { S: ST.S, P: [], wireRings: 5, wireAlpha: 0.2 });
      F.edges.forEach(([i, j]) => sc.line(i === d ? D : F.P[i], j === d ? D : F.P[j], { color: '--s1', width: 1, alpha: 0.5 }));
      sc.poly([F.P[a], F.P[b], F.P[c]], { fill: '--accent', alpha: 0.3, stroke: '--accent', width: 2.5 });
      const u = V.mul(V.sub(F.P[a], cc.m), 1 / cc.r), nrm = V.mul(cc.v, 1 / V.norm(cc.v)), w = V.cross(nrm, u), circ = [];
      for (let k = 0; k <= 72; k++) { const t = k / 72 * 2 * Math.PI; circ.push(V.add(cc.m, V.add(V.mul(u, cc.r * Math.cos(t)), V.mul(w, cc.r * Math.sin(t))))); }
      sc.polyline(circ, { color: '--accent', width: 2, dash: [6, 4] });
      sc.point(cc.m, { r: 4, color: '--accent' }); sc.text(cc.m, 'm_ABC', { dy: -12, color: '--accent' });
      F.P.forEach((p, k) => {
        const pos = k === d ? D : p;
        const col = k === d ? (inside ? '--danger' : '--s3') : (others.includes(k) ? '--danger' : (k === a || k === b || k === c ? '--accent' : '--s5'));
        sc.point(pos, { r: k === d || k === a || k === b || k === c ? 5 : 3, color: col });
      });
      sc.text(D, 'D', { dy: -12, color: inside ? '--danger' : '--s3' });
      ['A', 'B', 'C'].forEach((L, k) => sc.text(F.P[[a, b, c][k]], L, { dy: -12, color: '--accent' }));
      sc.draw(dt);
    }).start();
  })();

  /* ------------------------------------------------------------
     5. Ley de control (simulación en vivo)
     ------------------------------------------------------------ */
  (function controlSection() {
    const sc = new IP.Scene3D($('#ctlCanvas'), { az: -35, el: 24, radius: 16, target: [0, 0, 4] });
    const pE = new IP.Plot($('#ctlPlotE'), { height: 210, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', legend: false });
    const pF = new IP.Plot($('#ctlPlotF'), { height: 210, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', legend: false });
    const ctl = IP.controls($('#ctlControls'), [
      { id: 'delta', label: T('Perturbación inicial δ', 'Initial perturbation δ'), sym: 'δ', min: 1, max: 16, step: 1, value: 7, digits: 0, hint: T('|d_ij(0) − d*_ij| ≤ δ (en las unidades del ejemplo de 12 m).', '|d_ij(0) − d*_ij| ≤ δ (in the units of the 12 m example).') },
      { id: 'k1', label: T('Ganancia de formación', 'Formation gain'), sym: 'κ₁', min: 0.02, max: 0.4, step: 0.01, value: 0.1, digits: 2 },
      { id: 'k2', label: T('log₁₀ ganancia de superficie', 'log₁₀ surface gain'), sym: 'κ₂', min: 1, max: 4, step: 0.1, value: 3, digits: 1, format: (v) => '10^' + v.toFixed(1).replace('.', ',') },
      { id: 'speed', type: 'select', label: T('Velocidad de reproducción', 'Playback speed'), value: '3', options: [{ value: '1', label: '×1' }, { value: '3', label: '×3' }, { value: '6', label: '×6' }] }
    ]);
    let sim = null, running = false, seed = 11;
    function launch() {
      const S = ST.S, F = ST.F, v = ctl.values, g = gains(S, v.k1, Math.pow(10, v.k2));
      const rho = v.delta / 2 * sizeOf(S) / LREF;
      sim = new FORM.Sim({ S, F, P0: FORM.perturb(F.P, rho, seed++, 0.03 * S.hmax), law: 'ras', k1: g.k1, k2: g.k2, k3: g.k3, eps: 0.015 * S.hmax, dt: 0.005 });
      running = true; $('#ctlPause').textContent = T('Pausar', 'Pause');
    }
    $('#ctlRun').addEventListener('click', launch);
    $('#ctlPause').addEventListener('click', () => { running = !running; $('#ctlPause').textContent = running ? T('Pausar', 'Pause') : T('Continuar', 'Resume'); });
    onChange(() => { sc.o.radius = sizeOf(ST.S) * 1.05; sc.o.target = [0, 0, ST.S.hmax * 0.35]; launch(); });
    const at = (h, T) => { const i = h.t.findIndex(t => t >= T); return i < 0 ? NaN : i; };
    IP.animate($('#ctlCanvas').parentElement, (dt) => {
      if (!sim) return;
      if (running && sim.t < 30) sim.advance(Math.min(0.1, dt * parseFloat(ctl.values.speed)));
      const F = ST.F;
      sc.begin();
      FORM.drawScene(sc, { S: ST.S, F, P: sim.p, trails: sim.trails, wireRings: 5, wireAlpha: 0.22, colorOf: (i) => ringColor(F.level[i]), edgeColor: edgeErrColor(F, sim.p), droneSize: sizeOf(ST.S) * 0.03 });
      sc.draw(dt);
      $('#ctlTime').textContent = `t = ${fmt(sim.t, 1)} s`;
      const h = sim.hist, lg = (a) => a.map(x => Math.log10(Math.max(x, 1e-6)));
      pE.setSeries([{ name: '‖e(z)‖', color: '--s1', x: h.t, y: lg(h.ed2), width: 2 }]);
      pF.setSeries([{ name: '‖f(p)‖', color: '--s3', x: h.t, y: lg(h.es2), width: 2 }]);
      pE.opts.xlim = pF.opts.xlim = [0, 30];
      const red = (arr, T) => { const i = at(h, T); return Number.isFinite(i) ? fmt(100 * (1 - arr[i] / arr[0]), 2) + ' %' : '—'; };
      const c = (k, v, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${v}</b></div>`;
      $('#ctlReadouts').innerHTML = c('‖e(z(0))‖', fmt(h.ed2[0], 1)) + c('‖f(p(0))‖', fmt(h.es2[0], 3)) +
        c(T('Reducción ‖e‖ en t = 8 s', '‖e‖ reduction at t = 8 s'), red(h.ed2, 8), 'hl') + c(T('Reducción ‖f‖ en t = 8 s', '‖f‖ reduction at t = 8 s'), red(h.es2, 8), 'hl') +
        c(T('Reducción ‖e‖ en t = 30 s', '‖e‖ reduction at t = 30 s'), red(h.ed2, 29.9)) + c(T('Artículo, t = 8 s', 'Paper, t = 8 s'), T('99,7 % · 98,3 %', '99.7% · 98.3%'));
    }).start();
  })();

  /* ------------------------------------------------------------
     6. Rigidez y simetrías
     ------------------------------------------------------------ */
  (function rigidity() {
    const sc = new IP.Scene3D($('#rankCanvas'), { az: -35, el: 28, radius: 1.6, target: [0, 0, 0.4] });
    const SURF = {
      general: { label: T('Semielipsoide general (a ≠ b ≠ c)', 'General semi-ellipsoid (a ≠ b ≠ c)'), S: () => FORM.surface('elipsoide', { a: 1, b: 1.3, c: 0.9 }) },
      revol: { label: T('Elipsoide de revolución (a = b ≠ c)', 'Ellipsoid of revolution (a = b ≠ c)'), S: () => FORM.surface('elipsoide', { a: 1, b: 1, c: 0.8 }) },
      esfera: { label: T('Semiesfera (a = b = c)', 'Hemisphere (a = b = c)'), S: () => FORM.surface('esfera', { R: 1 }) },
      cilindro: { label: T('Cilindro', 'Cylinder'), S: () => FORM.surface('cilindro', { a: 1, c: 1.2 }) },
      cono: { label: T('Cono', 'Cone'), S: () => FORM.surface('cono', { a: 1, c: 1.3 }) }
    };
    const ctl = IP.controls($('#rankControls'), [
      { id: 'surf', type: 'select', label: T('Superficie', 'Surface'), value: 'esfera', options: Object.keys(SURF).map(k => ({ value: k, label: SURF[k].label })) },
      { id: 'N', label: T('Número de drones', 'Number of drones'), sym: 'N', min: 6, max: 40, step: 1, value: 12, digits: 0 }
    ], IP.debounce(compute, 40));
    let R = null;
    function compute() {
      const v = ctl.values, S = SURF[v.surf].S(), F = FORM.buildShield(S, Math.round(v.N), { h0: 0.02 }), r = FORM.rankJR(F, S);
      R = { S, F, r, kind: v.surf };
      const c = (k, val, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${val}</b></div>`;
      $('#rankReadouts').innerHTML = c(T('Columnas 3N', 'Columns 3N'), String(r.cols)) + c(T('Filas N_e + N', 'Rows N_e + N'), String(r.rows)) + c('rank J_R', String(r.rank), 'hl') + c('s = 3N − rank', String(r.s), 'hl');
      const notes = {
        general: T('s = 0: ningún movimiento conserva a la vez las distancias y la superficie. La formación final es única (salvo reflexiones).', 's = 0: no motion preserves both the distances and the surface. The final formation is unique (up to reflections).'),
        revol: T('s = 1: la formación puede girar alrededor del eje z sin violar ninguna restricción.', 's = 1: the formation can rotate about the z axis without violating any constraint.'),
        esfera: T('s = 3: puede girar alrededor de cualquier eje que pase por el centro (por eso, en el Ejemplo 2, la posición final depende de las condiciones iniciales).', 's = 3: it can rotate about any axis through the centre (that is why, in Example 2, the final position depends on the initial conditions).'),
        cilindro: T('s = 2: además del giro alrededor de z aparece la traslación vertical, porque q₃ = 0 (caso degenerado que el Lema 4 no trata). En la práctica la fijan las cotas 0 ≤ z ≤ c.', 's = 2: besides the rotation about z, vertical translation appears because q₃ = 0 (a degenerate case not covered by Lemma 4). In practice it is fixed by the bounds 0 ≤ z ≤ c.'),
        cono: T('s = 1: giro alrededor del eje del cono.', 's = 1: rotation about the cone axis.')
      };
      $('#rankNote').textContent = notes[v.surf];
    }
    compute();
    IP.animate($('#rankCanvas').parentElement, (dt, t) => {
      if (!R) return;
      const { S, F, kind } = R, ang = (R.r.s >= 1 ? 0.5 * Math.sin(t * 0.8) : 0), dz = kind === 'cilindro' ? 0.15 * Math.sin(t * 1.3) : 0;
      const rot = (p) => { const c = Math.cos(ang), s = Math.sin(ang); let q = [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2] + dz]; if (kind === 'esfera') { const b = 0.3 * Math.sin(t * 0.6), cb = Math.cos(b), sb = Math.sin(b); q = [q[0], cb * q[1] - sb * q[2], sb * q[1] + cb * q[2]]; } return q; };
      const P = F.P.map(rot);
      sc.begin(); FORM.drawScene(sc, { S, F, P, wireRings: 6, wireAlpha: 0.3, colorOf: (i) => ringColor(F.level[i]), droneSize: 0.05 }); sc.draw(dt);
    }).start();

    // Ejemplo 2: dos condiciones iniciales en la semiesfera R = 15, N = 12
    const S2 = FORM.surface('esfera', { R: 15 }), F2 = FORM.buildShield(S2, 12, { h0: 0.3 });
    const sc2 = new IP.Scene3D($('#ex2Canvas'), { az: -30, el: 35, radius: 16, target: [0, 0, 4] });
    let sims = [], sd = 21;
    function run2() {
      sims = [0, 1].map(k => {
        // condiciones iniciales a ras de suelo, desordenadas: cada simulación usa una semilla distinta
        // formación objetivo girada un ángulo aleatorio y perturbada (δ ≈ 7, como en el Ejemplo 1)
        let s = sd + k * 7919; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        const th = r() * 2 * Math.PI, c = Math.cos(th), si = Math.sin(th);
        const P0 = FORM.perturb(F2.P.map(p => [c * p[0] - si * p[1], si * p[0] + c * p[1], p[2]]), 3.5, sd + k, 0.5);
        return new FORM.Sim({ S: S2, F: F2, P0, law: 'ras', k1: 0.1, k2: 1e3, k3: 1e-3, eps: 0.2, dt: 0.005 });
      });
      sd += 3;
    }
    run2();
    $('#ex2Run').addEventListener('click', run2);
    IP.animate($('#ex2Canvas').parentElement, (dt) => {
      if (!sims.length) return;
      sims.forEach(s => { if (s.t < 20) s.advance(Math.min(0.1, dt * 2)); });
      sc2.begin();
      FORM.drawScene(sc2, { S: S2, P: [], wireRings: 5, wireAlpha: 0.25 });
      sims.forEach((s, k) => FORM.drawScene(sc2, { S: null, wire: false, F: F2, P: s.p, trails: s.trails, colorOf: () => (k ? '#3498db' : '#e74c3c'), edgeColor: () => (k ? '#3498db' : '#e74c3c'), droneSize: 0.7 }));
      sc2.draw(dt);
      if (sims[0].t >= 19.9) {
        let acc = 0; sims[0].p.forEach((p, i) => { const q = sims[1].p[i]; let da = Math.atan2(q[1], q[0]) - Math.atan2(p[1], p[0]); da = Math.atan2(Math.sin(da), Math.cos(da)); acc += da; });
        const e = [0, 1].map(k => sims[k].hist.ed2.at(-1));
        $('#ex2Angle').textContent = T(`Giro relativo medio ≈ ${fmt(Math.abs(acc / 12) * 180 / Math.PI, 0)}° · ‖e‖ final: ${fmt(e[0], 3)} y ${fmt(e[1], 3)}`, `Mean relative rotation ≈ ${fmt(Math.abs(acc / 12) * 180 / Math.PI, 0)}° · final ‖e‖: ${fmt(e[0], 3)} and ${fmt(e[1], 3)}`);
      } else $('#ex2Angle').textContent = `t = ${fmt(sims[0].t, 1)} s`;
    }).start();
  })();

  /* ------------------------------------------------------------
     7. Experimento: 12 Crazyflie (6 reales + 6 virtuales)
     ------------------------------------------------------------ */
  (function experiment() {
    const S = FORM.surface('esfera', { R: 1 }), F = FORM.buildShield(S, 12, { h0: 0.02 }), Z0 = 0.8;
    const sc = new IP.Scene3D($('#expCanvas'), { az: -40, el: 18, radius: 1.5, target: [0, 0, 1.0] });
    const plot = new IP.Plot($('#expPlot'), { height: 230, xlabel: T('tiempo (s)', 'time (s)'), ylabel: 'e_ij (m²)', xname: 't', xunit: 's', legend: false, tooltip: false });
    let sim = null, eh = null, seed = 4;
    function run() {
      // los drones se llevan primero al plano z0 = 0,8 m y entonces arranca la coordinación (10 Hz)
      let s = seed++; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      const P0 = F.P.map(p => [p[0] + 0.3 * (r() - 0.5), p[1] + 0.3 * (r() - 0.5), 0.03]);   // en el plano z0, bajo su anillo
      sim = new FORM.Sim({ S, F, P0, law: 'ras', k1: 0.6, k2: 2, k3: 1e-4, eps: 0.02, dtc: 0.1, tau: 0.25, umax: 0.5, dt: 0.01 });   // ganancias propias de esta simulación
      eh = { t: [], e: F.edges.map(() => []) };
    }
    run();
    $('#expRun').addEventListener('click', run);
    const cols = ['--s1', '--s2', '--s3', '--s4', '--s5'];
    IP.animate($('#expCanvas').parentElement, (dt) => {
      if (!sim) return;
      if (sim.t < 25) {
        sim.advance(Math.min(0.1, dt * 1.5));
        eh.t.push(sim.t); F.edges.forEach(([i, j], k) => eh.e[k].push(V.dot(V.sub(sim.p[i], sim.p[j]), V.sub(sim.p[i], sim.p[j])) - F.dstar[k] ** 2));
      }
      sc.begin();
      FORM.drawScene(sc, { S, F, P: sim.p, trails: sim.trails, offsetZ: Z0, wireRings: 5, wireAlpha: 0.3, ground: 1.5, colorOf: (i) => (i % 2 ? '#3498db' : '#e74c3c'), edgeColor: edgeErrColor(F, sim.p), droneSize: 0.06 });
      sc.draw(dt);
      $('#expTime').textContent = T(`t = ${fmt(sim.t, 1)} s · coordinación a 10 Hz`, `t = ${fmt(sim.t, 1)} s · 10 Hz coordination`);
      plot.opts.xlim = [0, 25];
      plot.setSeries(eh.e.map((e, k) => ({ name: 'e' + k, color: cols[k % cols.length], x: eh.t, y: e, width: 1.1 })));
    }).start();
    // vídeo: se carga sólo al pulsar (sin cookies de terceros hasta entonces)
    $('#video .ph').addEventListener('click', (e) => {
      e.preventDefault();
      $('#video').innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/j8SpkPp_5zs?autoplay=1" title="Experimento del escudo con 12 Crazyflie" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    });
  })();

  /* ------------------------------------------------------------
     8. Autoevaluación
     ------------------------------------------------------------ */
  IP.quiz($('#quizBox'), [
    { q: T('¿Qué datos necesita el Algoritmo 1 para diseñar el escudo?', 'What data does Algorithm 1 need to design the shield?'), options: [T('Las posiciones objetivo de todos los drones', 'The target positions of all drones'), T('Los parámetros de la superficie (área, perímetro del borde, altura) y el número de drones', 'The surface parameters (area, boundary perimeter, height) and the number of drones'), T('Una optimización con las distancias entre todos los pares', 'An optimisation over the distances between all pairs'), T('La topología de comunicaciones', 'The communication topology')], answer: 1,
      explain: T('Basta con A, L_b, h_max y N: de ahí salen d (ec. 15) y los anillos {n_k, d_k, h_k}. No se resuelve ningún problema de optimización, lo que reduce mucho el coste.', 'A, L_b, h_max and N are enough: they give d (eq. 15) and the rings {n_k, d_k, h_k}. No optimisation problem is solved, which greatly reduces the cost.') },
    { q: T('Con N = 50 drones en una semiesfera de R = 15, ¿cuántos triángulos tiene la triangulación si hay 16 nodos en el borde?', 'With N = 50 drones on a hemisphere of R = 15, how many triangles does the triangulation have if there are 16 boundary nodes?'), options: ['48', '82', '98', '147'], answer: 1,
      explain: T('f = 2N − 2 − e_b = 100 − 2 − 16 = 82, como en la Tabla 2.', 'f = 2N − 2 − e_b = 100 − 2 − 16 = 82, as in Table 2.') },
    { q: T('En el test local de Delaunay, ¿qué indica |M_ABCD| > 0?', 'In the local Delaunay test, what does |M_ABCD| > 0 indicate?'), options: [T('Que A, B y C están alineados', 'That A, B and C are collinear'), T('Que D está dentro de la circunferencia circunscrita de ABC', 'That D is inside the circumcircle of ABC'), T('Que el triángulo es equilátero', 'That the triangle is equilateral'), T('Que D está sobre la superficie', 'That D is on the surface')], answer: 1,
      explain: T('Teorema 1: con |Λ| < 0 (Lema 2), el signo positivo de |M_ABCD| indica ‖p_D − m_ABC‖ < r_ABC, así que ABC no cumple la propiedad de Delaunay.', 'Theorem 1: with |Λ| < 0 (Lemma 2), a positive |M_ABCD| means ‖p_D − m_ABC‖ < r_ABC, so ABC does not satisfy the Delaunay property.') },
    { q: T('¿Por qué la ley de control no exige un sistema de referencia común para la parte de formación?', 'Why does the control law not need a common reference frame for the formation part?'), options: [T('Porque usa sólo posiciones relativas p_i − p_j y distancias a los vecinos', 'Because it only uses relative positions p_i − p_j and distances to neighbours'), T('Porque los drones comparten GPS', 'Because the drones share GPS'), T('Porque se calcula de forma centralizada', 'Because it is computed centrally'), T('Porque ignora la superficie', 'Because it ignores the surface')], answer: 0,
      explain: T('El término de formación depende de d_ij y de p_i − p_j, medibles en el sistema local de cada agente. El término de superficie sí usa la propia posición respecto al centro del escudo.', 'The formation term depends on d_ij and p_i − p_j, measurable in each agent\'s local frame. The surface term does use the agent\'s own position relative to the shield centre.') },
    { q: T('En una semiesfera, dos experimentos con condiciones iniciales distintas acaban en formaciones giradas entre sí. ¿Por qué?', 'On a hemisphere, two experiments with different initial conditions end in formations rotated with respect to each other. Why?'), options: [T('Por un error numérico', 'A numerical error'), T('Porque la esfera tiene simetría de rotación: rank J_R = 3N − 3', 'Because the sphere has rotational symmetry: rank J_R = 3N − 3'), T('Porque el grafo no es rígido', 'Because the graph is not rigid'), T('Porque falta el campo repulsivo', 'Because the repulsive field is missing')], answer: 1,
      explain: T('Cualquier giro alrededor del centro conserva distancias y superficie (s = 3 en el Lema 4). Todas esas formaciones giradas son igual de válidas.', 'Any rotation about the centre preserves distances and surface (s = 3 in Lemma 4). All those rotated formations are equally valid.') },
    { q: T('En el experimento real, ¿a qué frecuencia se ejecuta el controlador de formación propuesto?', 'In the real experiment, at what rate does the proposed formation controller run?'), options: ['500 Hz', '100 Hz', '10 Hz', '1 Hz'], answer: 2,
      explain: T('Es una capa de coordinación a 10 Hz que entrega posiciones objetivo al control de posición (100 Hz), que a su vez manda sobre el de actitud (500 Hz). Por eso puede aproximarse cada dron como un integrador simple.', 'It is a 10 Hz coordination layer that sends target positions to the position control (100 Hz), which in turn commands the attitude control (500 Hz). That is why each drone can be approximated as a single integrator.') }
  ]);

  rebuild();
})();
