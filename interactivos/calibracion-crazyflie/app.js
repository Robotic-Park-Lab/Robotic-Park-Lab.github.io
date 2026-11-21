/* Página interactiva: Indirect method for calibrating quadrotor sensors, Crazyflie 2.X (GlobConET 2022) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t;
  IP.page();

  /* Parámetros (Tabla I) */
  const CT = 3.158e-10, CD = 7.938e-12, dArm = 39.73e-3, Ixx = 1.657e-5, Iyy = 1.665e-5, Izz = 2.926e-5, M = 0.027, G = 9.81;
  const OMEGA_H = Math.sqrt(M * G / (4 * CT));
  /* Coeficientes (Tabla II), de mayor a menor grado. q aparece con 6 coeficientes en el artículo. */
  const PAPER = {
    z: { c: [-1.6074, 2.1047, -0.8594, 1.1244, -0.0048], range: [0.025, 0.5], unit: 'm', name: T('Altitud z', 'Altitude z'), noise: 0.004 },
    phi: { c: [0, 0, 0.0007, 1.1093, -1.4338], range: [-90, 90], unit: '°', name: T('Alabeo φ', 'Roll φ'), noise: 0.6 },
    theta: { c: [0, 0, 0.0005, 1.1283, -1.2418], range: [-90, 90], unit: '°', name: T('Cabeceo θ', 'Pitch θ'), noise: 0.6 },
    psi: { c: [0, 0, 0, 1.0718, -0.9506], range: [-180, 180], unit: '°', name: T('Guiñada ψ', 'Yaw ψ'), noise: 1.2 },
    p: { c: [0, 0, 0, -0.0005, -0.0238, 1.8185, 0.6324] }
  };
  const polyval = (c, x) => c.reduce((s, a) => s * x + a, 0);
  /** Inversa numérica de un polinomio monótono en [lo, hi] (bisección). */
  function inv(c, y, lo, hi) { let a = lo, b = hi; const inc = polyval(c, hi) > polyval(c, lo); for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if ((polyval(c, m) < y) === inc) a = m; else b = m; } return (a + b) / 2; }
  /** Mínimos cuadrados de grado n con escalado de x; devuelve coeficientes de mayor a menor grado en la variable original. */
  function polyfit(x, y, n) {
    const s = Math.max(...x.map(Math.abs)) || 1, m = n + 1, A = Array.from({ length: m }, () => new Array(m).fill(0)), b = new Array(m).fill(0);
    x.forEach((xi, k) => { const u = xi / s, pw = []; for (let j = 0; j < m; j++) pw.push(u ** j); for (let i = 0; i < m; i++) { b[i] += pw[i] * y[k]; for (let j = 0; j < m; j++) A[i][j] += pw[i] * pw[j]; } });
    for (let i = 0; i < m; i++) A[i][i] += 1e-10;
    // Gauss con pivotaje
    for (let i = 0; i < m; i++) { let p = i; for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]; for (let r = i + 1; r < m; r++) { const f = A[r][i] / A[i][i]; for (let cc = i; cc < m; cc++) A[r][cc] -= f * A[i][cc]; b[r] -= f * b[i]; } }
    const a = new Array(m).fill(0); for (let i = m - 1; i >= 0; i--) { let t = b[i]; for (let j = i + 1; j < m; j++) t -= A[i][j] * a[j]; a[i] = t / A[i][i]; }
    return a.map((v, j) => v / s ** j).reverse();
  }
  const rng = (seed) => { let s = seed >>> 0 || 1; const u = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); return { u, n: () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()) }; };
  const rms = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0) / a.length);

  /* Dibujo de un cuadricóptero con actitud */
  function rot(phi, th, psi) {
    const cf = Math.cos(phi), sf = Math.sin(phi), ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(psi), sp = Math.sin(psi);
    return [[cp * ct, cp * st * sf - sp * cf, cp * st * cf + sp * sf], [sp * ct, sp * st * sf + cp * cf, sp * st * cf - cp * sf], [-st, ct * sf, ct * cf]];
  }
  const mv = (R, v) => [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  // Motores en X: 1 (+x, −y)… según la convención de signos de M_x y M_y de la ecuación
  const MOT = [[1, -1], [-1, -1], [-1, 1], [1, 1]].map(([x, y]) => [x / Math.SQRT2, y / Math.SQRT2, 0]);
  function quad(sc, p, R, k, o = {}) {
    const col = o.color || '--s1';
    MOT.forEach((m, i) => {
      const a = add(p, mv(R, m.map(v => v * k)));
      sc.line(p, a, { color: col, width: 2.4 });
      const ring = []; for (let j = 0; j < 14; j++) { const t = j / 14 * 2 * Math.PI; ring.push(add(a, mv(R, [0.45 * k * Math.cos(t), 0.45 * k * Math.sin(t), 0.02 * k]))); }
      sc.poly(ring, { fill: i % 2 ? '--s2' : col, alpha: 0.3, stroke: i % 2 ? '--s2' : col, width: 1.2 });
      if (o.thrust) sc.line(a, add(a, mv(R, [0, 0, o.thrust[i] * k])), { color: '--ok', width: 3 });
      if (o.labels) sc.text(add(a, mv(R, [0, 0, -0.35 * k])), 'M' + (i + 1), { color: '--muted', size: 11 });
    });
    sc.point(p, { r: 4, color: col });
  }

  /* Portada */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -40, el: 22, radius: 0.45, target: [0, 0, 0], autoRotate: IP.reducedMotion() ? 0 : 6 });
    let t = 0;
    IP.animate(cv.parentElement, (dt) => {
      t += dt; const phi = 0.35 * Math.sin(1.3 * t), th = 0.25 * Math.sin(0.9 * t + 1), psi = 0.4 * Math.sin(0.5 * t);
      sc.begin();
      for (let k = -3; k <= 3; k++) { sc.line([k * 0.06, -0.18, -0.12], [k * 0.06, 0.18, -0.12], { color: 'rgba(200,230,215,0.15)', width: 0.8 }); sc.line([-0.18, k * 0.06, -0.12], [0.18, k * 0.06, -0.12], { color: 'rgba(200,230,215,0.15)', width: 0.8 }); }
      const R = rot(phi, th, psi);
      [[1, 0, 0, '#ef7b6c'], [0, 1, 0, '#7fd1a8'], [0, 0, 1, '#6aa8ec']].forEach(([x, y, z, c]) => sc.line([0, 0, 0], mv(R, [x * 0.11, y * 0.11, z * 0.11]), { color: c, width: 2 }));
      quad(sc, [0, 0, 0], R, 0.08, { color: '#6aa8ec' });
      sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'need', label: T('Sensores\nimprecisos', 'Inaccurate\nsensors'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>Un control fiable exige medidas calibradas, pero las velocidades angulares no se pueden medir con una referencia directa en vuelo.</p>', '<p>Reliable control needs calibrated measurements, but angular rates cannot be measured against a direct reference in flight.</p>') },
      { id: 'cf', label: T('Crazyflie 2.X\nmodelo dinámico', 'Crazyflie 2.X\ndynamic model'), kind: 'theory', x: 520, y: 75, mx: 310, my: 60, href: '#modelo', text: T('<p>Ecuaciones de Newton–Euler con los parámetros de la Tabla I: \\(C_T\\), \\(C_D\\), inercias y masa de 27 g.</p>', '<p>Newton–Euler equations with the parameters of Table I: \\(C_T\\), \\(C_D\\), inertias and 27 g mass.</p>') },
      { id: 'st', label: T('Calibración\nclásica', 'Classical\ncalibration'), kind: 'method', x: 890, y: 75, mx: 110, my: 170, href: '#estatica', text: T('<p>z, φ, θ y ψ se calibran colocando el dron en posiciones conocidas y ajustando un polinomio de grado 4 por mínimos cuadrados.</p>', '<p>z, φ, θ and ψ are calibrated by placing the drone in known positions and least-squares fitting a degree-4 polynomial.</p>') },
      { id: 'diff', label: T('Derivar la\nactitud calibrada', 'Differentiate the\ncalibrated attitude'), kind: 'method', x: 890, y: 260, mx: 310, my: 170, href: '#indirecto', text: T('<p>\\(p_r \\approx \\Delta\\phi_c/T_s\\): la actitud calibrada se convierte en la referencia de velocidad angular.</p>', '<p>\\(p_r \\approx \\Delta\\phi_c/T_s\\): the calibrated attitude becomes the angular-rate reference.</p>') },
      { id: 'fit', label: T('Polinomio de\ngrado 6 para p, q, r', 'Degree-6 polynomial\nfor p, q, r'), kind: 'method', x: 520, y: 260, mx: 110, my: 280, href: '#indirecto', text: T('<p>Se ajusta \\(p_c = P_p(p_m)\\) con los datos de un vuelo manual de 10 s registrados con el <i>logging</i> del firmware.</p>', '<p>\\(p_c = P_p(p_m)\\) is fitted with data from a 10 s manual flight logged with the firmware\'s logging.</p>') },
      { id: 'res', label: T('Sensores\ncalibrados', 'Calibrated\nsensors'), kind: 'result', x: 150, y: 260, mx: 310, my: 280, text: T('<p>Coeficientes de la Tabla II para las siete variables; el método es aplicable a otros cuadricópteros.</p>', '<p>Table II coefficients for all seven variables; the method applies to other quadrotors.</p>') },
      { id: 'fut', label: T('Validación\ncon MoCap', 'Validation\nwith MoCap'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, text: T('<p>Trabajo futuro: validar con captura de movimiento y extender a otros UAV o a vehículos submarinos.</p>', '<p>Future work: validate with motion capture and extend to other UAVs or underwater vehicles.</p>') }
    ],
    edges: [{ from: 'need', to: 'cf' }, { from: 'cf', to: 'st' }, { from: 'st', to: 'diff', label: 'φc, θc, ψc' }, { from: 'diff', to: 'fit' }, { from: 'fit', to: 'res' }, { from: 'res', to: 'fut', bend: 0.1 }]
  }, { panel: $('#cmapPanel'), initial: 'diff' });

  /* Modelo: mezclador de motores */
  const scm = new IP.Scene3D($('#cvm'), { az: -40, el: 28, radius: 0.19, target: [0, 0, 0.03] });
  const ctlm = IP.controls($('#ctlm'), [1, 2, 3, 4].map(i => ({ id: 'w' + i, label: T('Motor ', 'Motor ') + i, sym: 'Ω' + i, unit: 'rpm', min: 0, max: 25000, step: 100, value: Math.round(OMEGA_H / 100) * 100, digits: 0 })));
  $('#hover').addEventListener('click', () => [1, 2, 3, 4].forEach(i => ctlm.set('w' + i, Math.round(OMEGA_H / 100) * 100)));
  IP.animate($('#cvm').parentElement, (dt) => {
    const w = [1, 2, 3, 4].map(i => ctlm.values['w' + i]), w2 = w.map(x => x * x);
    const Mx = dArm * CT / Math.SQRT2 * (-w2[0] - w2[1] + w2[2] + w2[3]), My = dArm * CT / Math.SQRT2 * (-w2[0] + w2[1] + w2[2] - w2[3]), Mz = CD * (-w2[0] + w2[1] - w2[2] + w2[3]);
    const Fz = CT * w2.reduce((a, b) => a + b, 0), c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    const e = (x) => Math.abs(x) < 1e-12 ? '0' : x.toExponential(2).replace('e', '·10^').replace('.', IP.lang === 'en' ? '.' : ',');
    $('#rom').innerHTML = c('F_z', fmt(Fz * 1000, 1) + ' mN', Math.abs(Fz - M * G) < 0.01 * M * G ? 'good' : '') + c('m·g', fmt(M * G * 1000, 1) + ' mN') + c('M_x', e(Mx) + ' N·m') + c('M_y', e(My) + ' N·m') + c('M_z', e(Mz) + ' N·m') + c(T('ṗ, q̇, ṙ', 'ṗ, q̇, ṙ'), [Mx / Ixx, My / Iyy, Mz / Izz].map(v => fmt(v * 180 / Math.PI, 0)).join(' · ') + ' °/s²', 'hl');
    const tilt = [Math.atan(Mx / Ixx / 2000), Math.atan(My / Iyy / 2000), Math.atan(Mz / Izz / 2000)];
    scm.begin(); quad(scm, [0, 0, 0], rot(...tilt), 0.08, { thrust: w2.map(x => x / OMEGA_H ** 2 * 0.6), labels: true }); scm.draw(dt);
  }).start();

  /* Calibración estática */
  const pst = new IP.Plot($('#pst'), { height: 320, xlabel: T('lectura X_m', 'reading X_m'), ylabel: T('valor real X_r', 'true value X_r'), xname: 'X_m' });
  let vr = 'phi', seed = 3, data = null;
  IP.seg($('#varSeg'), ['z', 'phi', 'theta', 'psi'].map(k => ({ value: k, label: PAPER[k].name })), vr, (v) => { vr = v; gen(); });
  const ctls = IP.controls($('#ctls'), [
    { id: 'n', label: T('Grado del polinomio', 'Polynomial degree'), sym: 'n', min: 1, max: 8, step: 1, value: 4, digits: 0 },
    { id: 'N', label: T('Posiciones de calibración', 'Calibration positions'), sym: 'N', min: 4, max: 40, step: 1, value: 13, digits: 0 }
  ], () => gen(true));
  $('#resample').addEventListener('click', () => { seed++; gen(); });
  function gen(keep) {
    const P = PAPER[vr], N = Math.round(ctls.values.N), R = rng(seed), [lo, hi] = P.range;
    if (!keep || !data || data.N !== N || data.vr !== vr) {
      const xr = [], xm = [];
      for (let k = 0; k < N; k++) { const r = lo + (hi - lo) * k / (N - 1); xr.push(r); xm.push(inv(P.c, r, lo * 1.6 - 0.1, hi * 1.6 + 0.1) + P.noise * R.n()); }
      // validación: puntos intermedios
      const vr_ = [], vm = []; for (let k = 0; k < 60; k++) { const r = lo + (hi - lo) * (k + 0.5) / 60; vr_.push(r); vm.push(inv(P.c, r, lo * 1.6 - 0.1, hi * 1.6 + 0.1) + P.noise * R.n()); }
      data = { xr, xm, vr: vr, N, valR: vr_, valM: vm };
    }
    const n = Math.round(ctls.values.n), c = polyfit(data.xm, data.xr, Math.min(n, data.N - 1));
    const x0 = Math.min(...data.xm), x1 = Math.max(...data.xm), xs = [], yf = [], yp = [];
    for (let k = 0; k <= 200; k++) { const x = x0 + (x1 - x0) * k / 200; xs.push(x); yf.push(polyval(c, x)); yp.push(polyval(P.c, x)); }
    pst.overlays = { markers: data.xm.map((x, k) => ({ x, y: data.xr[k], color: '--s1', scale: false })) };
    pst.setSeries([{ name: T('identidad (sin calibrar)', 'identity (uncalibrated)'), color: '--muted', x: [x0, x1], y: [x0, x1], width: 1.2, dash: [4, 4] }, { name: T('polinomio del artículo', 'paper polynomial'), color: '--s2', x: xs, y: yp, width: 1.6, dash: [6, 3] }, { name: T('tu ajuste', 'your fit'), color: '--s1', x: xs, y: yf, width: 2.4 }]);
    const fitE = rms(data.xm.map(x => polyval(c, x)), data.xr), valE = rms(data.valM.map(x => polyval(c, x)), data.valR), rawE = rms(data.valM, data.valR);
    const rc = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`, d = vr === 'z' ? 4 : 2;
    $('#ros').innerHTML = rc(T('RMS sin calibrar', 'Uncalibrated RMS'), fmt(rawE, d) + ' ' + P.unit, 'bad') + rc(T('RMS en el ajuste', 'Fit RMS'), fmt(fitE, d) + ' ' + P.unit) + rc(T('RMS en validación', 'Validation RMS'), fmt(valE, d) + ' ' + P.unit, valE > 2 * fitE + 1e-9 && n > 4 ? 'bad' : 'hl');
    const cell = (v) => `<td class="num">${Math.abs(v) < 5e-5 ? '0' : v.toFixed(4)}</td>`, m = Math.max(c.length, P.c.length), pad = (a) => Array(m - a.length).fill(0).concat(a);
    $('#tcoef').innerHTML = `<thead><tr><th></th>${pad(c).map((_, j) => `<th>p${j + 1}</th>`).join('')}</tr></thead><tbody><tr><td>${T('Tu ajuste', 'Your fit')}</td>${pad(c).map(cell).join('')}</tr><tr class="best"><td>${T('Tabla II', 'Table II')}</td>${pad(P.c).map(cell).join('')}</tr></tbody>`;
  }
  gen();

  /* Método indirecto */
  const pp = new IP.Plot($('#pp'), { height: 230, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  const pfit = new IP.Plot($('#pfit'), { height: 220, xlabel: 'p_m (°/s)', ylabel: 'p (°/s)', xname: 'p_m' });
  const ctli = IP.controls($('#ctli'), [
    { id: 'Ts', type: 'select', label: T('Periodo de registro', 'Logging period'), value: '0.02', options: ['0.01', '0.02', '0.05', '0.1'].map(v => ({ value: v, label: `T_s = ${v.replace('.', IP.lang === 'en' ? '.' : ',')} s` })) },
    { id: 'n', label: T('Grado del polinomio', 'Polynomial degree'), sym: 'n', min: 1, max: 8, step: 1, value: 6, digits: 0 },
    { id: 'sa', label: T('Ruido en φ_m', 'Noise on φ_m'), sym: 'σ_φ', unit: '°', min: 0, max: 0.5, step: 0.01, value: 0.05, digits: 2 },
    { id: 'filt', type: 'select', label: T('Derivada', 'Derivative'), value: 'f', options: [{ value: 'd', label: T('Diferencia hacia atrás', 'Backward difference') }, { value: 'f', label: T('Diferencia + media móvil (5)', 'Difference + moving average (5)') }] }
  ], () => indirect());
  const cPhi = PAPER.phi.c, cP = PAPER.p.c;
  function indirect() {
    const v = ctli.values, Ts = +v.Ts, R = rng(11), t = [], phiR = [], pR = [];
    for (let k = 0; k * Ts <= 10; k++) {
      const tt = k * Ts; t.push(tt);
      phiR.push(5 * Math.sin(2 * Math.PI * 0.25 * tt) + 1.6 * Math.sin(2 * Math.PI * 0.6 * tt + 1) + 0.6 * Math.sin(2 * Math.PI * 1.2 * tt + 2));
      pR.push(5 * 2 * Math.PI * 0.25 * Math.cos(2 * Math.PI * 0.25 * tt) + 1.6 * 2 * Math.PI * 0.6 * Math.cos(2 * Math.PI * 0.6 * tt + 1) + 0.6 * 2 * Math.PI * 1.2 * Math.cos(2 * Math.PI * 1.2 * tt + 2));
    }
    const phiM = phiR.map(x => inv(cPhi, x, -150, 150) + v.sa * R.n());
    const pM = pR.map(x => inv(cP, x, -50, 21) + 0.1 * R.n());
    const phiC = phiM.map(x => polyval(cPhi, x));
    let pE = phiC.map((x, k) => (k ? (x - phiC[k - 1]) / Ts : 0)); pE[0] = pE[1];
    // la diferencia hacia atrás estima la derivada en t − Ts/2: se compara con p_m en ese instante (media de k y k−1)
    let pMa = pM.map((x, k) => (k ? (x + pM[k - 1]) / 2 : x));
    if (v.filt === 'f') { const w = 2; const ma = (a) => a.map((_, k) => { let s = 0, c = 0; for (let j = k - w; j <= k + w; j++) if (j >= 0 && j < a.length) { s += a[j]; c++; } return s / c; }); pE = ma(pE); pMa = ma(pMa); }
    const n = Math.round(v.n), c = polyfit(pMa.slice(1), pE.slice(1), n), pC = pM.map(x => polyval(c, x));
    pp.opts.xlim = [0, 10];
    pp.setSeries([{ name: T('p real', 'true p'), color: '--text', x: t, y: pR, width: 2 }, { name: T('p_m giróscopo', 'p_m gyroscope'), color: '--danger', x: t, y: pM, width: 1.2 }, { name: T('Δφ_c / T_s', 'Δφ_c / T_s'), color: '--s5', x: t, y: pE, width: 1, dash: [2, 2] }, { name: T('p_c calibrada', 'calibrated p_c'), color: '--s1', x: t, y: pC, width: 1.8, dash: [6, 3] }]);
    const xs = [], yf = [], yp = [], x0 = Math.min(...pM), x1 = Math.max(...pM);
    for (let k = 0; k <= 100; k++) { const x = x0 + (x1 - x0) * k / 100; xs.push(x); yf.push(polyval(c, x)); yp.push(polyval(cP, x)); }
    pfit.overlays = { markers: pMa.filter((_, k) => k % Math.max(1, Math.round(0.1 / Ts)) === 0).map((x, k) => ({ x, y: pE[k * Math.max(1, Math.round(0.1 / Ts))], color: '--s5', scale: false })) };
    pfit.setSeries([{ name: T('polinomio de la Tabla II', 'Table II polynomial'), color: '--s2', x: xs, y: yp, width: 1.6, dash: [6, 3] }, { name: T('tu ajuste', 'your fit'), color: '--s1', x: xs, y: yf, width: 2.4 }]);
    const c2 = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    $('#roi').innerHTML = c2(T('Muestras', 'Samples'), String(t.length)) + c2(T('RMS p_m − p', 'RMS p_m − p'), fmt(rms(pM, pR), 2) + ' °/s', 'bad') + c2(T('RMS Δφ_c/T_s − p', 'RMS Δφ_c/T_s − p'), fmt(rms(pE, pR), 2) + ' °/s') + c2(T('RMS p_c − p', 'RMS p_c − p'), fmt(rms(pC, pR), 2) + ' °/s', 'hl');
    IP.$$('.ip-step', $('#steps')).forEach(s => s.classList.add('is-done'));
  }
  indirect();

  IP.quiz($('#quizBox'), [
    { q: T('¿Por qué no se calibran p, q, r igual que φ, θ, ψ?', 'Why are p, q, r not calibrated like φ, θ, ψ?'), options: [T('Porque no se puede imponer una velocidad angular conocida con el dron en reposo', 'Because a known angular rate cannot be imposed with the drone at rest'), T('Porque los giróscopos no tienen error', 'Because gyroscopes have no error'), T('Porque necesitan grado 4', 'Because they need degree 4')], answer: 0, explain: T('La actitud se fija colocando el dron en orientaciones conocidas; la velocidad angular sólo existe en movimiento.', 'Attitude is fixed by placing the drone in known orientations; angular rate only exists in motion.') },
    { q: T('Si aumentas el periodo de registro T_s, ¿qué le pasa a la estimación Δφ_c/T_s?', 'If you increase the logging period T_s, what happens to the estimate Δφ_c/T_s?'), options: [T('Pierde resolución temporal y se retrasa respecto a p real', 'It loses time resolution and lags the true p'), T('Mejora siempre', 'It always improves'), T('No cambia', 'It does not change')], answer: 0, explain: T('Es la sensibilidad al muestreo que señala el artículo; con T_s pequeño, en cambio, se amplifica el ruido de φ_m.', 'This is the sampling sensitivity the paper points out; with small T_s, instead, the noise on φ_m is amplified.') },
    { q: T('Con pocas posiciones de calibración, ¿qué riesgo tiene subir el grado n?', 'With few calibration positions, what is the risk of increasing degree n?'), options: [T('Sobreajuste: el error en los puntos de ajuste baja pero el de validación sube', 'Overfitting: the error on the fit points drops but the validation error rises'), T('Ninguno', 'None'), T('Que el polinomio no pase por el origen', 'That the polynomial does not pass through the origin')], answer: 0, explain: T('Compáralo en la sección 3: RMS en el ajuste frente a RMS en validación.', 'Compare it in section 3: fit RMS vs validation RMS.') }
  ]);
})();
