/* ============================================================
   Página interactiva: Rigid formation control in multi-robot
   systems using Lagrange multipliers (ECC 2026)
   Usa ip.js, scene3d.js y formacion.js (objeto FORM).
   ============================================================ */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, V = FORM.v;
  IP.page();

  // Tabla I del artículo: medias y desviaciones (ε_d y ε_S)
  const T1 = {
    N: [5, 8, 12, 15, 20],
    base: { trD: [[0.57, 0.1], [0.90, 0.2], [0.87, 0.3], [0.93, 0.3], [1.28, 0.8]], trS: [[0.77, 0.0], [0.94, 0.3], [1.07, 0.2], [1.10, 0.1], [1.34, 0.1]],
      tsD: [[11.79, 8.7], [9.42, 2.1], [9.57, 6.2], [9.93, 7.5], [11.79, 6.7]], tsS: [[7.08, 0.8], [9.19, 2.8], [4.07, 2.3], [2.59, 0.4], [2.49, 0.4]] },
    rfc: { trD: [[0.58, 0.1], [0.87, 0.2], [1.34, 0.8], [1.82, 1.1], [2.85, 2.4]], trS: [[0.76, 0.0], [0.98, 0.3], [2.46, 1.1], [2.92, 1.0], [2.95, 1.3]],
      tsD: [[12.44, 8.1], [9.53, 5.6], [11.70, 6.72], [13.64, 6.6], [11.94, 6.6]], tsS: [[4.64, 0.1], [9.61, 6.1], [10.0, 6.0], [5.12, 1.4], [5.87, 0.8]] },
    prf: { trD: [[0.87, 0.1], [1.27, 0.19], [1.09, 0.3], [1.21, 0.2], [1.46, 0.5]], trS: [[1.14, 0.0], [1.27, 0.1], [1.31, 0.1], [1.28, 0.1], [1.37, 0.2]],
      tsD: [[8.79, 6.3], [3.86, 2.3], [3.49, 1.3], [4.97, 2.5], [8.05, 6.5]], tsS: [[1.87, 0.0], [2.16, 0.1], [2.17, 0.1], [2.15, 0.2], [2.39, 0.2]] }
  };
  const CTRL = [{ id: 'base', law: 'base', name: 'Baseline', color: '--s5' }, { id: 'rfc', law: 'rfc', name: 'RF+C', color: '--s3' }, { id: 'prf', law: 'prf', name: 'PRF', color: '--s1' }];
  const SPH = FORM.surface('esfera', { R: 1 });
  const baseScale = (N) => (N < 8 ? 1 : N === 8 ? 0.8 : 0.4);      // 0,25 → 0,2 → 0,1 (Sec. V)
  /** Despegue desde un plano bajo, bajo la formación objetivo (semilla reproducible). */
  function initial(F, seed) {
    let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    return F.P.map(p => [0.55 * p[0] + 0.2 * (r() - 0.5), 0.55 * p[1] + 0.2 * (r() - 0.5), 0.25 + 0.1 * r()]);
  }
  const edgeCol = (F, P) => (k, [i, j]) => (Math.abs(V.norm(V.sub(P[i], P[j])) - F.dstar[k]) / F.dstar[k] > 0.12 ? '--s2' : null);

  /* ------------------------------------------------------------
     0. Portada: cúpula de 20 drones con PRF
     ------------------------------------------------------------ */
  (function hero() {
    const cv = $('#heroCanvas'), F = FORM.buildShield(SPH, 20, { h0: 0.02 });
    const sc = new IP.Scene3D(cv, { az: -35, el: 22, radius: 1.25, target: [0, 0, 0.45], autoRotate: IP.reducedMotion() ? 0 : 9 });
    let sim, seed = 5;
    const restart = () => { sim = new FORM.Sim({ S: SPH, F, P0: initial(F, seed++), law: 'prf', k1: 2, k2: 3, umax: 1, dtc: 0.1, tau: 0.15, dt: 0.01 }); };
    restart();
    IP.animate(cv.parentElement, (dt) => {
      if (sim.t < 9) sim.advance(dt); else if (sim.t < 12) sim.t += dt; else restart();
      sc.begin();
      FORM.wire(SPH, 6, 40).forEach(l => sc.polyline(l, { color: 'rgba(200,230,215,0.3)', width: 0.8, zb: -1e3 }));
      sim.ps.forEach((q, i) => sc.line(sim.p[i], q, { color: 'rgba(240,163,95,0.6)', width: 1, dash: [3, 3] }));
      F.edges.forEach(([i, j], k) => {
        const e = Math.abs(V.norm(V.sub(sim.p[i], sim.p[j])) - F.dstar[k]) / F.dstar[k];
        sc.line(sim.p[i], sim.p[j], { color: e > 0.12 ? '#f0a35f' : '#7fd1a8', width: 1.4, alpha: 0.9 });
      });
      sim.p.forEach((q) => sc.drone(q, { color: '#6aa8ec', size: 0.05, dot: 2.5, alpha: 0.3 }));
      sim.ps.forEach((q) => sc.point(q, { r: 2, color: '#f0a35f' }));
      sc.draw(dt);
    }).start();
  })();

  /* ------------------------------------------------------------
     1. Mapa conceptual
     ------------------------------------------------------------ */
  IP.conceptMap($('#cmap'), {
    view: [1040, 645], mobileView: [420, 800],
    nodes: [
      { id: 'prev', label: 'Escudo sobre\nsuperficie (RAS 24)', kind: 'theory', x: 150, y: 75, mx: 110, my: 60, href: '../escudo-multi-uav/', text: '<p>Formación rígida por distancias sobre una superficie virtual, con un término de gradiente \\(-\\tfrac{\\kappa_2}{2}f\\nabla f\\) que empuja a cada dron hacia la superficie. Es la <b>Baseline</b> de este trabajo.</p>' },
      { id: 'prob', label: 'Señales agresivas\ny saturación', kind: 'problem', x: 520, y: 75, mx: 310, my: 60, href: '#comparativa', text: '<p>En drones reales la orden de velocidad debe limitarse. El gradiente produce órdenes grandes, saturación frecuente y oscilaciones que empeoran con el tamaño del enjambre: hay que reducir κ₁ de 0,25 a 0,1.</p>' },
      { id: 'opt', label: 'Problema local\nmin ‖x − p_i‖²', kind: 'theory', x: 890, y: 75, mx: 310, my: 170, href: '#lagrange', text: '<p>Cada agente busca el punto de la superficie \\(g(x)=0\\) más cercano a su posición. Problema de optimización con una restricción de igualdad.</p>' },
      { id: 'lag', label: 'Multiplicador λ\n→ p*_i', kind: 'method', x: 890, y: 235, mx: 110, my: 170, href: '#lagrange', text: '<p>\\(\\nabla f(p_i^*,p_i)+\\lambda\\nabla g(p_i^*)=0\\). Para la esfera: \\(p_i^*=R\\,p_i/\\|p_i\\|\\) y \\(\\lambda=\\|p_i\\|/R-1\\). Para el cono, λ resuelve una ecuación sencilla.</p>' },
      { id: 'rfc', label: 'RF+C\n(ec. 12)', kind: 'method', x: 520, y: 235, mx: 110, my: 280, href: '#controladores', text: '<p>Formación por distancias + muelle hacia \\(p_i^*\\): \\(-\\kappa_2(p_i-p_i^*)\\). No requiere información adicional respecto al control rígido clásico.</p>' },
      { id: 'proj', label: 'Proyector P_i\n(Prop. 1)', kind: 'theory', x: 150, y: 235, mx: 310, my: 280, href: '#controladores', text: '<p>Con curvatura pequeña, \\(\\dot p_i^*\\approx P_i\\dot p_i\\), con \\(P_i\\) la proyección ortogonal sobre el plano tangente. Autovalores {1, 1, 0}.</p>' },
      { id: 'prf', label: 'PRF\n(ec. 19)', kind: 'method', x: 150, y: 400, mx: 310, my: 390, href: '#controladores', text: '<p>La formación se mide entre los puntos proyectados \\(p^*\\) y su corrección se proyecta con \\(P_i\\). Necesita conocer los \\(p_j^*\\) de los vecinos (calcularlos o comunicarlos).</p>' },
      { id: 'stab', label: 'Estabilidad\nexponencial local', kind: 'result', x: 520, y: 400, mx: 110, my: 390, href: '#controladores', text: '<p>Teoremas 1 y 2: con funciones de Lyapunov que suman el error de formación y la distancia a la superficie, ambos controladores son localmente exponencialmente estables.</p>' },
      { id: 'sim', label: 'Robotic Park\nN = 5 … 20', kind: 'result', x: 890, y: 400, mx: 110, my: 500, href: '#comparativa', text: '<p>Enjambres de Crazyflie 2.1 sobre una semiesfera de 1 m. Métricas: tiempos de subida y establecimiento de los errores de distancia (ε_d) y de superficie (ε_S), y esfuerzo de control.</p>' },
      { id: 'res', label: '−63,5 % t_S\nsobreosc. ≈ 10 %', kind: 'result', x: 520, y: 565, mx: 310, my: 500, href: '#resultados', text: '<p>PRF mantiene κ₁ = 0,25 para todos los tamaños, se asienta hasta un 63,5 % antes y con una sobreoscilación de ≈ 10 %, frente al 53,86 % de la Baseline. RF+C reduce oscilaciones y saturación con un tiempo de subida algo mayor.</p>' }
    ],
    edges: [
      { from: 'prev', to: 'prob', label: 'en drones reales' },
      { from: 'prob', to: 'opt', label: 'se propone' },
      { from: 'opt', to: 'lag' },
      { from: 'lag', to: 'rfc', label: 'p*_i' },
      { from: 'lag', to: 'proj', label: 'dinámica de p*', bend: 0.2 },
      { from: 'rfc', to: 'prf', label: 'proyectar', bend: 0.05 },
      { from: 'proj', to: 'prf' },
      { from: 'rfc', to: 'stab' },
      { from: 'prf', to: 'stab' },
      { from: 'stab', to: 'sim', label: 'se valida' },
      { from: 'sim', to: 'res' }
    ]
  }, { panel: $('#cmapPanel'), initial: 'lag' });

  /* ------------------------------------------------------------
     2. Lagrange en 2D: arrastrar el dron
     ------------------------------------------------------------ */
  (function lagrange2d() {
    const cv = $('#lagCanvas'), ctx = cv.getContext('2d');
    const ctl = IP.controls($('#lagControls'), [
      { id: 'surf', type: 'select', label: 'Superficie', value: 'esfera', options: [{ value: 'esfera', label: 'Semiesfera R = 1' }, { value: 'elipsoide', label: 'Semielipsoide a = 1,4, c = 0,9' }, { value: 'cono', label: 'Cono a = 1, c = 1,3' }] }
    ], () => { S = mk(); draw(); });
    const mk = () => { const v = ctl.values.surf; return v === 'esfera' ? FORM.surface('esfera', { R: 1 }) : v === 'elipsoide' ? FORM.surface('elipsoide', { a: 1.4, b: 1.4, c: 0.9 }) : FORM.surface('cono', { a: 1, c: 1.3 }); };
    let S = mk(), p = [1.15, 0, 1.05];
    let view = null;
    const toPx = (x, z) => [view.cx + x * view.s, view.cy - z * view.s];
    const toW = (X, Y) => [(X - view.cx) / view.s, (view.cy - Y) / view.s];
    function arrow(a, b, col, w = 2, dash = []) {
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
      const an = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - 10 * Math.cos(an - 0.4), b[1] - 10 * Math.sin(an - 0.4)); ctx.lineTo(b[0] - 10 * Math.cos(an + 0.4), b[1] - 10 * Math.sin(an + 0.4)); ctx.closePath(); ctx.fill();
    }
    function draw() {
      const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      view = { s: Math.min(W / 4.2, H / 2.6), cx: W / 2, cy: H * 0.84 };
      const font = IP.css('--font'), mut = IP.css('--muted'), grid = IP.css('--grid');
      // rejilla y suelo
      ctx.strokeStyle = grid; ctx.lineWidth = 1;
      for (let x = -2; x <= 2; x += 0.5) { const a = toPx(x, -0.3), b = toPx(x, 2); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      for (let z = 0; z <= 2; z += 0.5) { const a = toPx(-2.2, z), b = toPx(2.2, z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      ctx.strokeStyle = IP.css('--axis'); const g0 = toPx(-2.2, 0), g1 = toPx(2.2, 0); ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.stroke();
      // curva de la superficie (corte y = 0)
      ctx.strokeStyle = IP.css('--s1'); ctx.lineWidth = 3; ctx.beginPath();
      const M = 200; for (let k = 0; k <= M; k++) { const t = Math.PI * k / M, h = S.hmax * Math.sin(t) * (S.type === 'cono' ? 1 : 1); let x, z;
        if (S.type === 'cono') { const u = k / M * 2 - 1; x = S.prm.a * u; z = S.prm.c * (1 - Math.abs(u)); }
        else { x = S.section(0).ax * Math.cos(t); z = S.hmax * Math.sin(t); }
        const q = toPx(x, z); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.stroke();
      // proyección
      const r = S.proj(p), ps = r.p, g = S.grad(ps), d = V.norm(V.sub(p, ps));
      const P = toPx(p[0], p[2]), Ps = toPx(ps[0], ps[2]);
      // curvas de nivel de f centradas en el dron
      [0.55, 1, 1.5].forEach((k, i) => { ctx.strokeStyle = IP.css(i === 1 ? '--accent' : '--axis'); ctx.lineWidth = i === 1 ? 1.8 : 1; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(P[0], P[1], d * k * view.s, 0, 2 * Math.PI); ctx.stroke(); });
      ctx.setLineDash([]);
      // vectores: ∇g(p*) y p − p*
      const gn = V.norm(g) || 1, gl = 0.45;
      arrow(Ps, toPx(ps[0] + g[0] / gn * gl, ps[2] + g[2] / gn * gl), IP.css('--s3'), 2.4);
      arrow(Ps, P, IP.css('--accent'), 2, [6, 4]);
      // tangente
      const tg = [-g[2] / gn, g[0] / gn], tA = toPx(ps[0] - tg[0] * 0.5, ps[2] - tg[1] * 0.5), tB = toPx(ps[0] + tg[0] * 0.5, ps[2] + tg[1] * 0.5);
      ctx.strokeStyle = IP.css('--muted'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(tA[0], tA[1]); ctx.lineTo(tB[0], tB[1]); ctx.stroke();
      // puntos
      ctx.fillStyle = IP.css('--accent'); ctx.beginPath(); ctx.arc(Ps[0], Ps[1], 6, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = IP.css('--s3'); ctx.beginPath(); ctx.arc(P[0], P[1], 9, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = IP.css('--surface'); ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `700 13px ${font}`; ctx.fillStyle = IP.css('--text');
      ctx.fillText('p_i (arrástrame)', P[0] + 12, P[1] - 10); ctx.fillStyle = IP.css('--accent'); ctx.fillText('p*_i', Ps[0] + 10, Ps[1] + 18);
      ctx.fillStyle = IP.css('--s3'); const gt = toPx(ps[0] + g[0] / gn * gl, ps[2] + g[2] / gn * gl); ctx.textAlign = 'right'; ctx.fillText('∇g(p*)', gt[0] - 8, gt[1] + 4); ctx.textAlign = 'left';
      ctx.fillStyle = mut; ctx.font = `600 11px ${font}`; ctx.fillText('x', W - 18, g1[1] - 6); ctx.fillText('z', view.cx + 6, 14);
      // lecturas
      const res = V.add(V.mul(V.sub(ps, p), 2), V.mul(g, r.lambda));
      const c = (k, v, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${v}</b></div>`;
      $('#lagReadouts').innerHTML = c('λ', fmt(r.lambda, 3), 'hl') + c('‖p − p*‖', fmt(d, 3) + ' m') + c('g(p*)', Math.abs(S.f(ps)) < 1e-12 ? '0' : S.f(ps).toExponential(1).replace('.', ',')) + c('‖∇f + λ∇g‖', res.map(x => Math.abs(x)).reduce((a, b) => Math.max(a, b), 0).toExponential(1).replace('.', ','));
      const notes = {
        esfera: 'Esfera: solución cerrada \\(p_i^*=R\\,p_i/\\|p_i\\|\\), \\(\\lambda=\\|p_i\\|/R-1\\). Fuera de la esfera \\(\\lambda>0\\); dentro, \\(\\lambda<0\\).',
        elipsoide: 'Elipsoide: \\(x_k^*=a_k^2p_k/(a_k^2+\\lambda)\\) con \\(\\sum_k a_k^2p_k^2/(a_k^2+\\lambda)^2=1\\), que se resuelve con unas pocas iteraciones de Newton.',
        cono: 'Cono (Ejemplo 2 del artículo): \\(g=\\tfrac{x^2+y^2}{a^2}-\\tfrac{(z-c)^2}{c^2}\\). Aquí λ admite incluso una expresión cerrada. El vértice queda excluido (no es diferenciable).'
      };
      $('#lagNote').innerHTML = notes[ctl.values.surf]; IP.math($('#lagNote'));
    }
    let drag = false;
    cv.addEventListener('pointerdown', (e) => { drag = true; cv.setPointerCapture(e.pointerId); move(e); });
    cv.addEventListener('pointermove', (e) => { if (drag) move(e); });
    cv.addEventListener('pointerup', () => (drag = false));
    function move(e) { const r = cv.getBoundingClientRect(), w = toW(e.clientX - r.left, e.clientY - r.top); p = [IP.clamp(w[0], -1.9, 1.9), 0, IP.clamp(w[1], 0.05, 1.9)]; draw(); }
    new ResizeObserver(draw).observe(cv); IP.onTheme(draw);
    draw();
  })();

  /* ------------------------------------------------------------
     3. Proyector P_i en 3D
     ------------------------------------------------------------ */
  (function projector() {
    const sc = new IP.Scene3D($('#projCanvas'), { az: -30, el: 22, radius: 1.05, target: [0, 0, 0.55] });
    const ctl = IP.controls($('#projControls'), [
      { id: 'az', label: 'Posición en la cúpula (azimut)', min: -180, max: 180, step: 1, value: 30, unit: '°', digits: 0 },
      { id: 'el', label: 'Posición en la cúpula (elevación)', min: 5, max: 85, step: 1, value: 40, unit: '°', digits: 0 },
      { id: 'off', label: 'Distancia del dron a la superficie', min: 0, max: 0.6, step: 0.01, value: 0.25, unit: 'm', digits: 2 },
      { id: 'ua', label: 'Dirección de la corrección de formación u', min: 0, max: 360, step: 1, value: 60, unit: '°', digits: 0 }
    ], () => {});
    IP.animate($('#projCanvas').parentElement, (dt) => {
      const v = ctl.values, a = v.az * Math.PI / 180, e = v.el * Math.PI / 180;
      const ps = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)], n = ps.slice();
      const p = V.mul(ps, 1 + v.off);
      // base del plano tangente
      const t1 = V.mul(V.cross([0, 0, 1], n), 1 / (V.norm(V.cross([0, 0, 1], n)) || 1)), t2 = V.cross(n, t1);
      const ua = v.ua * Math.PI / 180;
      const u = V.mul(V.add(V.add(V.mul(t1, Math.cos(ua) * 0.7), V.mul(t2, Math.sin(ua) * 0.7)), V.mul(n, 0.45)), 0.6);
      const Pu = V.sub(u, V.mul(n, V.dot(u, n)));
      sc.begin();
      FORM.wire(SPH, 6, 40).forEach(l => sc.polyline(l, { color: '--muted', width: 0.8, alpha: 0.3, zb: -1e3 }));
      const s = 0.32, corner = (x, y) => V.add(ps, V.add(V.mul(t1, x * s), V.mul(t2, y * s)));
      sc.poly([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], { fill: '--s1', alpha: 0.18, stroke: '--s1', width: 1 });
      sc.line([0, 0, 0], ps, { color: '--muted', width: 1, dash: [3, 4], alpha: 0.5 });
      sc.line(ps, p, { color: '--accent', width: 2, dash: [5, 4] });
      sc.line(ps, V.add(ps, u), { color: '--s3', width: 3 });
      sc.line(ps, V.add(ps, Pu), { color: '--s1', width: 3.5 });
      sc.line(V.add(ps, Pu), V.add(ps, u), { color: '--danger', width: 1.5, dash: [4, 3] });
      sc.drone(p, { color: '--s3', size: 0.06 });
      sc.point(ps, { r: 5, color: '--accent' });
      sc.text(p, 'p_i', { dy: -14, color: '--s3' }); sc.text(ps, 'p*_i', { dx: -18, dy: 12, color: '--accent' });
      sc.text(V.add(ps, u), 'u', { dy: -10, color: '--s3' }); sc.text(V.add(ps, Pu), 'P·u', { dy: 12, color: '--s1' });
      sc.draw(dt);
      const c = (k, val, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${val}</b></div>`;
      $('#projReadouts').innerHTML = c('‖u‖', fmt(V.norm(u), 3)) + c('‖P·u‖', fmt(V.norm(Pu), 3), 'hl') + c('componente normal', fmt(V.dot(u, n), 3)) + c('autovalores de P', '1 · 1 · 0');
    }).start();
  })();

  /* ------------------------------------------------------------
     4. Comparativa: Baseline · RF+C · PRF
     ------------------------------------------------------------ */
  (function comparison() {
    const scs = [0, 1, 2].map(k => new IP.Scene3D($('#cmp' + k), { az: -35, el: 22, radius: 1.2, target: [0, 0, 0.45] }));
    // cámaras sincronizadas
    scs.forEach(s => (s.onChange = () => scs.forEach(o => { if (o !== s) o.setView(s.az, s.el); })));
    const pU = new IP.Plot($('#pU'), { height: 200, xlabel: 'tiempo (s)', xname: 't', xunit: 's' });
    const pD = new IP.Plot($('#pD'), { height: 200, xlabel: 'tiempo (s)', xname: 't', xunit: 's' });
    const pS = new IP.Plot($('#pS'), { height: 200, xlabel: 'tiempo (s)', xname: 't', xunit: 's' });
    let N = 12;
    const nSeg = IP.seg($('#cmpN'), [5, 8, 12, 15, 20].map(n => ({ value: n, label: 'N = ' + n })), N, (v) => { N = v; launch(); });
    const ctl = IP.controls($('#cmpControls'), [
      { id: 'k1', label: 'Ganancia de formación', sym: 'κ₁', min: 0.5, max: 4, step: 0.1, value: 2, digits: 1 },
      { id: 'k2', label: 'Ganancia de superficie', sym: 'κ₂', min: 0.5, max: 6, step: 0.1, value: 3, digits: 1 },
      { id: 'umax', label: 'Saturación de velocidad', min: 0.3, max: 3, step: 0.1, value: 1, unit: 'm/s', digits: 1 },
      { id: 'hz', type: 'toggle', label: 'Coordinación a 10 Hz (si no, continua)', value: true },
      { id: 'speed', type: 'select', label: 'Velocidad de reproducción', value: '1', options: [{ value: '0.5', label: '×0,5' }, { value: '1', label: '×1' }, { value: '2', label: '×2' }] }
    ], IP.debounce((v, id) => { if (id !== 'speed') launch(); }, 60));
    let sims = [], F = null, running = true, seed = 7;
    function launch(newSeed) {
      if (newSeed) seed++;
      const v = ctl.values;
      F = FORM.buildShield(SPH, N, { h0: 0.02 });
      const P0 = initial(F, seed);
      sims = CTRL.map(c => new FORM.Sim({ S: SPH, F, P0, law: c.law, k1: v.k1 * (c.id === 'base' ? baseScale(N) : 1), k2: v.k2, k3: 0, umax: v.umax, dtc: v.hz ? 0.1 : 0, tau: 0.15, dt: 0.01 }));
      running = true; $('#cmpPause').textContent = 'Pausar';
      const i = T1.N.indexOf(N), row = (k) => `${CTRL.find(c => c.id === k).name}: t_S(ε_d) = ${fmt(T1[k].tsD[i][0], 2)} ± ${fmt(T1[k].tsD[i][1], 1)} s, t_S(ε_S) = ${fmt(T1[k].tsS[i][0], 2)} ± ${fmt(T1[k].tsS[i][1], 1)} s`;
      $('#cmpPaper').innerHTML = `<b>Artículo, N = ${N} (Tabla I):</b><br>` + ['base', 'rfc', 'prf'].map(row).join('<br>');
    }
    $('#cmpRun').addEventListener('click', () => launch(true));
    $('#cmpPause').addEventListener('click', () => { running = !running; $('#cmpPause').textContent = running ? 'Pausar' : 'Continuar'; });
    launch();
    const T = 15;
    IP.animate($('#comparativa'), (dt) => {
      if (!sims.length) return;
      if (running && sims[0].t < T) sims.forEach(s => s.advance(Math.min(0.1, dt * parseFloat(ctl.values.speed))));
      sims.forEach((s, k) => {
        scs[k].begin();
        FORM.drawScene(scs[k], { S: SPH, F, P: s.p, trails: s.trails, wireRings: 5, wireAlpha: 0.25, colorOf: () => CTRL[k].color, edgeColor: edgeCol(F, s.p), droneSize: 0.045 });
        if (CTRL[k].law !== 'base') s.ps.forEach((q, i) => scs[k].point(q, { r: 1.8, color: '--accent' }));
        scs[k].draw(dt);
        const sat = s.hist.sat.reduce((a, b) => a + (b > 0 ? 1 : 0), 0) / Math.max(1, s.hist.sat.length);
        $('#lb' + k).textContent = `ε_d ${fmt(s.hist.ed.at(-1), 2)} · sat. ${fmt(100 * sat, 0)} %`;
      });
      $('#cmpTime').textContent = `t = ${fmt(sims[0].t, 1)} s`;
      const ser = (key, mapf = (x) => x) => sims.map((s, k) => ({ name: CTRL[k].name, color: CTRL[k].color, x: s.hist.t, y: s.hist[key].map(mapf), width: 2 }));
      [pU, pD, pS].forEach(p => (p.opts.xlim = [0, T]));
      pU.overlays = { hlines: [{ y: ctl.values.umax, color: '--danger', label: 'saturación' }] };
      pU.setSeries(ser('umax', (x) => Math.min(x, 8)));
      pD.setSeries(ser('ed')); pS.setSeries(ser('es'));
      // métricas
      const rows = sims.map((s, k) => {
        const h = s.hist, md = FORM.Sim.times(h.t, h.ed), ms = FORM.Sim.times(h.t, h.es);
        const sat = h.sat.reduce((a, b) => a + (b > 0 ? 1 : 0), 0) / Math.max(1, h.sat.length);
        return { k, md, ms, eff: s.effort, umax: Math.max(...h.umax.slice(1)), sat };
      });
      const done = sims[0].t >= T - 0.05;
      const best = (f) => rows.reduce((a, b) => (f(b) < f(a) ? b : a)).k;
      const bt = best(r => r.md.ts), bu = best(r => r.umax);
      $('#cmpTable').innerHTML = '<thead><tr><th></th><th>t_r ε_d</th><th>t_S ε_d</th><th>t_S ε_S</th><th>máx ‖u‖</th><th>% sat.</th><th>Esfuerzo</th></tr></thead><tbody>' +
        rows.map(r => `<tr><td style="color:${IP.color(CTRL[r.k].color)};font-weight:700">${CTRL[r.k].name}</td><td class="num">${fmt(r.md.tr, 2)}</td><td class="num" style="${done && r.k === bt ? 'font-weight:700;color:var(--ok)' : ''}">${done ? fmt(r.md.ts, 2) : '…'}</td><td class="num">${done ? fmt(r.ms.ts, 2) : '…'}</td><td class="num" style="${r.k === bu ? 'font-weight:700;color:var(--ok)' : ''}">${fmt(r.umax, 2)}</td><td class="num">${fmt(100 * r.sat, 0)}</td><td class="num">${fmt(r.eff, 1)}</td></tr>`).join('') + '</tbody>';
    }).start();
  })();

  /* ------------------------------------------------------------
     5. Tabla I del artículo (barras con desviación típica)
     ------------------------------------------------------------ */
  (function table1() {
    const metrics = { tsD: 't_S de ε_d (s)', tsS: 't_S de ε_S (s)', trD: 't_r de ε_d (s)', trS: 't_r de ε_S (s)' };
    let m = 'tsD';
    function draw() {
      const W = 760, H = 300, ml = 46, mb = 46, mt = 16, pw = W - ml - 20, ph = H - mt - mb;
      const all = ['base', 'rfc', 'prf'].flatMap(k => T1[k][m].map(([a, s]) => a + s));
      const ymax = Math.ceil(Math.max(...all) / 2) * 2;
      let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tabla I del artículo">`;
      for (let y = 0; y <= ymax; y += ymax > 10 ? 4 : 1) { const py = mt + ph - y / ymax * ph; s += `<line x1="${ml}" x2="${W - 20}" y1="${py}" y2="${py}" stroke="var(--grid)"/><text x="${ml - 8}" y="${py + 4}" text-anchor="end">${y}</text>`; }
      const gw = pw / T1.N.length;
      T1.N.forEach((n, i) => {
        s += `<text x="${ml + gw * (i + 0.5)}" y="${H - 22}" text-anchor="middle" style="font-weight:700">N = ${n}</text>`;
        CTRL.forEach((c, k) => {
          const [a, sd] = T1[c.id][m][i], bw = gw / 4.2, x = ml + gw * i + gw * 0.12 + k * (bw + 4);
          const y = mt + ph - a / ymax * ph, y1 = mt + ph - Math.min(ymax, a + sd) / ymax * ph, y0 = mt + ph - Math.max(0, a - sd) / ymax * ph;
          s += `<rect x="${x}" y="${y}" width="${bw}" height="${mt + ph - y}" rx="3" fill="${IP.color(c.color)}"><title>${c.name}, N = ${n}: ${fmt(a, 2)} ± ${fmt(sd, 2)} s</title></rect>`;
          s += `<line x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${y1}" y2="${y0}" stroke="var(--text)" stroke-width="1.2"/><line x1="${x + bw / 2 - 4}" x2="${x + bw / 2 + 4}" y1="${y1}" y2="${y1}" stroke="var(--text)"/>`;
        });
      });
      s += `<text x="12" y="${mt + ph / 2}" transform="rotate(-90 12 ${mt + ph / 2})" text-anchor="middle">${metrics[m]}</text></svg>`;
      s += '<div class="ip-legend">' + CTRL.map(c => `<span><i style="background:${IP.color(c.color)}"></i>${c.name}</span>`).join('') + '<span>| barra: media · línea: ± desviación típica</span></div>';
      $('#t1Bars').innerHTML = s;
    }
    IP.seg($('#t1Seg'), Object.keys(metrics).map(k => ({ value: k, label: metrics[k] })), m, (v) => { m = v; draw(); });
    draw(); IP.onTheme(draw);
    const k = [
      ['−63,5 %', 'tiempo de establecimiento del error de formación con PRF frente a la Baseline (N = 12: 3,49 s frente a 9,57 s)'],
      ['53,86 %', 'sobreoscilación máxima de la Baseline, con saturación frecuente sobre todo en enjambres pequeños'],
      ['≈ 10 %', 'sobreoscilación de PRF, mínima y consistente para todos los tamaños'],
      ['≤ 15 %', 'sobreoscilación de RF+C en enjambres grandes, con señales más suaves'],
      ['κ₁ = 0,25', 'PRF no necesita reajustar la ganancia; la Baseline baja a 0,2 (N = 8) y 0,1 (N ≥ 12)'],
      ['≈ 2,2 s', 't_S del error de superficie con PRF, prácticamente independiente de N']
    ];
    $('#kpis').innerHTML = k.map(([b, s]) => `<div class="ip-card"><b>${b}</b><span>${s}</span></div>`).join('');
  })();

  /* ------------------------------------------------------------
     6. Autoevaluación
     ------------------------------------------------------------ */
  IP.quiz($('#quizBox'), [
    { q: 'Un dron está en p = (0, 0, 2) y la superficie es la esfera de radio R = 1. ¿Cuánto valen p* y λ?', options: ['p* = (0, 0, 1), λ = 1', 'p* = (0, 0, 2), λ = 0', 'p* = (0, 0, 1), λ = −1', 'p* = (0, 0, 0,5), λ = 2'], answer: 0,
      explain: 'p* = R·p/‖p‖ = (0, 0, 1) y λ = ‖p‖/R − 1 = 2 − 1 = 1. Compruébalo arrastrando el dron en la sección 2.' },
    { q: '¿En qué se diferencia el uso de λ en este trabajo del de la optimización distribuida tipo ADMM?', options: ['Aquí λ se comunica entre vecinos', 'Aquí cada agente calcula su propio λ localmente y no lo intercambia', 'Aquí no hay restricciones', 'Aquí λ es una ganancia fija'], answer: 1,
      explain: 'En ADMM los multiplicadores coordinan a los agentes. Aquí cada dron resuelve su propio problema de mínima distancia y usa p*_i en su ley de control.' },
    { q: '¿Qué hace el proyector P_i?', options: ['Duplica la velocidad', 'Elimina la componente normal a la superficie y conserva la tangente', 'Calcula el multiplicador λ', 'Satura la orden de velocidad'], answer: 1,
      explain: 'P_i = I − ∇g∇gᵀ/‖∇g‖² tiene autovalores {1, 1, 0}: es la proyección ortogonal sobre el plano tangente.' },
    { q: '¿Qué información adicional necesita PRF respecto a RF+C?', options: ['Ninguna', 'Los puntos proyectados p*_j de sus vecinos', 'Un sistema de posicionamiento global para todos', 'Las ganancias de los vecinos'], answer: 1,
      explain: 'PRF mide la formación entre los p*. Cada agente puede calcular los p*_j de sus vecinos a partir de sus posiciones o recibirlos por comunicación (Observación 5).' },
    { q: 'Según la Tabla I, ¿qué controlador mantiene el error de superficie con t_S ≈ 2 s para cualquier tamaño del enjambre?', options: ['Baseline', 'RF+C', 'PRF', 'Ninguno'], answer: 2,
      explain: 'PRF: t_S(ε_S) entre 1,87 y 2,39 s de N = 5 a N = 20, con desviación típica muy pequeña.' }
  ]);
})();
