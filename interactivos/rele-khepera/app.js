/* Página interactiva: identificación en línea de robots diferenciales mediante relé (JA 2025) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t;
  IP.page();

  // Planta de ejemplo FOTD: v(s)/u(s) = kp e^{-Ds} / (τ s + 1), u en % PWM, v en mm/s (D/τ ≈ 0,5 en vacío).
  // Valores relativos del artículo: kp −5 % (nominal), −15 % (1 kg), −25 % (2 kg); τ crece con la carga.
  const D = 0.02;
  const LOADS = {
    susp: { label: T('Suspendido', 'Suspended'), kp: 16, tau: 0.04, color: '--s3' },
    nom: { label: T('Nominal', 'Nominal'), kp: 15.2, tau: 0.05, color: '--s1' },
    kg1: { label: '1 kg', kp: 13.6, tau: 0.075, color: '--s2' },
    kg2: { label: '2 kg', kp: 12, tau: 0.1, color: '--danger' }
  };

  /** Simula la planta (Euler, 0,2 ms) con una ley de control u(t, v). */
  function simulate(P, law, Tend, h = 0.0002) {
    const nd = Math.round(D / h), buf = new Array(nd).fill(0);
    let x = 0, k = 0; const t = [], v = [], u = [];
    for (let n = 0; n * h <= Tend; n++) {
      const tt = n * h, uu = law(tt, x, h);
      buf[k] = uu; k = (k + 1) % nd; const ud = buf[k];
      x += h * (P.kp * ud - x) / P.tau;
      t.push(tt); v.push(x); u.push(uu);
    }
    return { t, v, u };
  }
  /** Relé con histéresis alrededor de v = 0; analiza el primer ciclo completo. */
  function relay(P, d, delta, Tend = 0.6) {
    let s = 1; const sw = [];
    const r = simulate(P, (t, v) => { if (s > 0 && v > delta) { s = -1; sw.push(t); } else if (s < 0 && v < -delta) { s = 1; sw.push(t); } return s * d; }, Tend);
    const up = sw.filter((_, i) => i % 2 === 1);
    const t0 = up[0], t1 = up[1], Tu = t1 - t0, wu = 2 * Math.PI / Tu;
    let a = 0, Vr = 0, Vi = 0, Ur = 0, Ui = 0;
    r.t.forEach((tt, i) => { if (tt >= t0 && tt < t1) { a = Math.max(a, Math.abs(r.v[i])); const c = Math.cos(wu * tt), sn = Math.sin(wu * tt); Vr += r.v[i] * c; Vi -= r.v[i] * sn; Ur += r.u[i] * c; Ui -= r.u[i] * sn; } });
    const den = Ur * Ur + Ui * Ui, G = [(Vr * Ur + Vi * Ui) / den, (Vi * Ur - Vr * Ui) / den];   // G(jω_u) = V₁/U₁
    const Ku = 4 * d / (Math.PI * Math.sqrt(Math.max(a * a - delta * delta, 1e-9)));
    return Object.assign(r, { Tu, a, wu, Ku, G, sw, tId: t1, d, delta });
  }
  /** Ajuste FOTD/SOTD al punto G(jω_u) fijando D. */
  function fit(R) {
    const w = R.wu, m = Math.hypot(R.G[0], R.G[1]), lag = -Math.atan2(R.G[1], R.G[0]) - D * w;
    const t1 = Math.tan(lag) / w, t2 = Math.tan(lag / 2) / w;
    return { m, fotd: { tau: t1, kp: m * Math.sqrt((t1 * w) ** 2 + 1) }, sotd: { tau: t2, kp: m * ((t2 * w) ** 2 + 1) } };
  }
  const simc = (M, tc, order) => ({ KP: M.tau / (M.kp * (tc + D)), TI: Math.min(M.tau, 4 * (tc + D)), TD: order === 2 ? M.tau : 0 });

  /* Portada: Khepera oscilando adelante y atrás */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -60, el: 28, radius: 0.5, target: [0, 0, 0.02], autoRotate: IP.reducedMotion() ? 0 : 6 });
    const R = relay(LOADS.nom, 10, 20, 2), X = []; let t = 0, acc = 0;
    R.v.forEach(v => { acc += v * (R.t[1] - R.t[0]) / 1000 * 6; X.push(acc); });
    IP.animate(cv.parentElement, (dt) => {
      t = (t + dt * 0.25) % 1.9;
      const i = Math.min(R.t.length - 1, Math.round(t / (R.t[1] - R.t[0])));
      const x = X[i];
      sc.begin();
      for (let k = -4; k <= 4; k++) { sc.line([k * 0.06, -0.2, 0], [k * 0.06, 0.2, 0], { color: 'rgba(200,230,215,0.15)', width: 0.8 }); sc.line([-0.24, k * 0.05, 0], [0.24, k * 0.05, 0], { color: 'rgba(200,230,215,0.15)', width: 0.8 }); }
      sc.rover([x, 0, 0], 0, { color: '#6aa8ec', size: 0.07 });
      const b = 0.035, z = 0.06; sc.poly([[x - b, -b, z], [x + b, -b, z], [x + b, b, z], [x - b, b, z]], { fill: '#f0a35f', alpha: 0.6, stroke: '#f0a35f' });
      sc.line([x + 0.08, 0, 0.02], [x + 0.08 + R.v[i] / 600, 0, 0.02], { color: '#7fd1a8', width: 3 });
      sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'load', label: T('La carga cambia\nla dinámica', 'Load changes\nthe dynamics'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>Un PID sintonizado en vacío se vuelve lento u oscilatorio cuando el robot transporta peso.</p>', '<p>A PID tuned with no load becomes slow or oscillatory when the robot carries weight.</p>') },
      { id: 'kh', label: T('Khepera IV\n50 Hz · libkhepera', 'Khepera IV\n50 Hz · libkhepera'), kind: 'method', x: 520, y: 75, mx: 310, my: 60, text: T('<p>Robot diferencial de 540 g con Linux Yocto; el control de velocidad de los motores corre a 50 Hz y el retardo medido es D = 0,02 s.</p>', '<p>540 g differential robot running Yocto Linux; motor velocity control runs at 50 Hz and the measured delay is D = 0.02 s.</p>') },
      { id: 'rel', label: T('Relé con\nhistéresis', 'Relay with\nhysteresis'), kind: 'method', x: 890, y: 75, mx: 110, my: 170, href: '#rele', text: T('<p>Sustituye temporalmente al PID de los motores; amplitud d = 10 % y la histéresis evita conmutaciones por ruido.</p>', '<p>Temporarily replaces the motor PID; amplitude d = 10% and the hysteresis prevents noise-induced switching.</p>') },
      { id: 'df', label: T('Función\ndescriptiva', 'Describing\nfunction'), kind: 'theory', x: 890, y: 260, mx: 310, my: 170, href: '#rele', text: T('<p>El ciclo límite cumple \\(G(j\\omega_u) = -1/N(a)\\): un punto de la respuesta en frecuencia en menos de 0,3 s.</p>', '<p>The limit cycle satisfies \\(G(j\\omega_u) = -1/N(a)\\): one frequency-response point in under 0.3 s.</p>') },
      { id: 'mod', label: T('Modelos\nFOTD · SOTD', 'Models\nFOTD · SOTD'), kind: 'theory', x: 520, y: 260, mx: 110, my: 280, href: '#modelos', text: T('<p>Fijando D se obtienen \\(k_p\\) y \\(\\tau\\). El modelo integrador se descartó (ganancias 20 veces mayores).</p>', '<p>Fixing D gives \\(k_p\\) and \\(\\tau\\). The integrator model was rejected (gains 20 times larger).</p>') },
      { id: 'simc', label: T('Reglas SIMC\nτc = 0,1 s', 'SIMC rules\nτc = 0.1 s'), kind: 'method', x: 150, y: 260, mx: 310, my: 280, href: '#simc', text: T('<p>Reglas de Skogestad: el PID se recalcula con cada modelo para que el bucle cerrado tenga siempre la misma constante de tiempo.</p>', '<p>Skogestad rules: the PID is recomputed with each model so the closed loop always has the same time constant.</p>') },
      { id: 'res', label: T('Respuesta\nhomogénea', 'Homogeneous\nresponse'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, href: '#simc', text: T('<p>k_p cae un 5 % (nominal), 15 % (1 kg) y 25 % (2 kg); con SIMC la respuesta mantiene τ_BC = 0,1 s.</p>', '<p>k_p drops 5% (nominal), 15% (1 kg) and 25% (2 kg); with SIMC the response keeps τ_BC = 0.1 s.</p>') }
    ],
    edges: [{ from: 'load', to: 'kh' }, { from: 'kh', to: 'rel' }, { from: 'rel', to: 'df' }, { from: 'df', to: 'mod' }, { from: 'mod', to: 'simc' }, { from: 'simc', to: 'res' }, { from: 'load', to: 'simc', bend: 0 }]
  }, { panel: $('#cmapPanel'), initial: 'rel' });

  /* Relé */
  const pv = new IP.Plot($('#pv'), { height: 200, xname: 't', xunit: 's', legend: false });
  const pu = new IP.Plot($('#pu'), { height: 120, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', legend: false });
  let load = 'nom', R = null, M = null;
  IP.seg($('#loadSeg'), Object.keys(LOADS).map(k => ({ value: k, label: LOADS[k].label })), load, (v) => { load = v; run(); });
  const ctl = IP.controls($('#ctl'), [
    { id: 'd', label: T('Amplitud del relé', 'Relay amplitude'), sym: 'd', unit: '% PWM', min: 2, max: 20, step: 1, value: 10, digits: 0 },
    { id: 'delta', label: T('Histéresis', 'Hysteresis'), sym: 'δ', unit: 'mm/s', min: 0, max: 60, step: 1, value: 20, digits: 0 }
  ], () => run());
  let anim = 0;
  function run() {
    const v = ctl.values; R = relay(LOADS[load], v.d, v.delta); M = fit(R); anim = 0;
    table(); nyq(); step();
  }
  $('#run').addEventListener('click', run);
  const c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
  IP.animate($('#rele'), (dt) => {
    if (!R) return;
    anim = Math.min(0.6, anim + dt * 0.4);
    const n = R.t.findIndex(t => t > anim), k = n < 0 ? R.t.length : n;
    pv.opts.xlim = [0, 0.6]; pu.opts.xlim = [0, 0.6]; pu.opts.ylim = [-22, 22];
    pv.overlays = { hlines: [{ y: ctl.values.delta, color: '--muted', dash: [4, 4] }, { y: -ctl.values.delta, color: '--muted', dash: [4, 4] }], vlines: anim >= R.tId ? [{ x: R.tId, color: '--ok', label: T('identificado', 'identified') }] : [] };
    pv.setSeries([{ name: 'v', color: LOADS[load].color, x: R.t.slice(0, k), y: R.v.slice(0, k), width: 2 }]);
    pu.setSeries([{ name: 'u', color: '--s2', x: R.t.slice(0, k), y: R.u.slice(0, k), width: 1.8, step: true }]);
    const done = anim >= R.tId;
    $('#ro').innerHTML = c(T('Amplitud a', 'Amplitude a'), done ? fmt(R.a, 1) + ' mm/s' : '…') + c(T('Periodo', 'Period'), done ? fmt(R.Tu * 1000, 0) + ' ms' : '…') + c(T('Frecuencia', 'Frequency'), done ? fmt(R.wu, 1) + ' rad/s' : '…') + c(T('Ganancia crítica', 'Critical gain'), done ? fmt(R.Ku, 4) : '…', 'hl') + c(T('t identificación', 'identification t'), done ? fmt(R.tId, 2) + ' s' : '…', done && R.tId < 0.3 ? 'good' : '');
  }).start();

  /* Modelos */
  const pn = new IP.Plot($('#pn'), { height: 300, xlabel: 'Re', ylabel: 'Im', xname: 'Re', equal: true });
  function freq(fn, w0 = 1, w1 = 400) { const x = [], y = []; for (let k = 0; k <= 200; k++) { const w = w0 * (w1 / w0) ** (k / 200), g = fn(w); x.push(g[0]); y.push(g[1]); } return { x, y }; }
  const Gs = (kp, tau, n) => (w) => { const mag = kp / ((1 + (tau * w) ** 2) ** (n / 2)), ph = -D * w - n * Math.atan(tau * w); return [mag * Math.cos(ph), mag * Math.sin(ph)]; };
  function nyq() {
    const P = LOADS[load], real = Gs(P.kp, P.tau, 1);
    const r = freq(real, 5), f1 = freq(Gs(M.fotd.kp, M.fotd.tau, 1), 5), f2 = freq(Gs(M.sotd.kp, M.sotd.tau, 2), 5);
    const d = ctl.values.d, del = ctl.values.delta, nx = [], ny = [];
    for (let a = Math.max(del, 0.5) + 0.01; a < 200; a *= 1.05) { nx.push(-Math.PI / (4 * d) * Math.sqrt(a * a - del * del)); ny.push(-Math.PI / (4 * d) * del); }
    const pt = [-Math.PI / (4 * d) * Math.sqrt(R.a * R.a - del * del), -Math.PI / (4 * d) * del];  // aproximación de la función descriptiva
    pn.opts.xlim = [-P.kp * 0.6, P.kp * 1.05]; pn.opts.ylim = [-P.kp * 0.75, P.kp * 0.25];
    pn.overlays = { markers: [{ x: pt[0], y: pt[1], color: '--danger', label: T('DF', 'DF') }, { x: R.G[0], y: R.G[1], color: '--ok', label: 'G(jω_u)' }] };
    pn.setSeries([{ name: T('Planta', 'Plant'), color: '--text', x: r.x, y: r.y, width: 2.2 }, { name: 'FOTD', color: '--s1', x: f1.x, y: f1.y, width: 1.8, dash: [6, 4] }, { name: 'SOTD', color: '--s2', x: f2.x, y: f2.y, width: 1.8, dash: [2, 3] }, { name: '−1/N(a)', color: '--danger', x: nx, y: ny, width: 1.6 }]);
  }
  function table() {
    const P = LOADS[load], row = (n, m) => `<tr><td>${n}</td><td class="num">${fmt(m.kp, 2)}</td><td class="num">${fmt(m.tau * 1000, 1)}</td><td class="num">20</td></tr>`;
    $('#tm').innerHTML = `<thead><tr><th>${T('Modelo', 'Model')}</th><th>k_p (mm/s/%)</th><th>τ (ms)</th><th>D (ms)</th></tr></thead><tbody>` +
      `<tr class="best"><td>${T('Planta (real)', 'Plant (true)')}</td><td class="num">${fmt(P.kp, 2)}</td><td class="num">${fmt(P.tau * 1000, 0)}</td><td class="num">20</td></tr>` + row('FOTD', M.fotd) + row('SOTD', M.sotd) + '</tbody>';
  }
  const pk = new IP.Plot($('#pk'), { height: 150, legend: false, tooltip: false });
  (function bars() {
    const v = [1, 0.95, 0.85, 0.75], x = [], y = [];
    v.forEach((h, i) => { x.push(i + 0.6, i + 0.6, i + 1.4, i + 1.4); y.push(0, h, h, 0); });
    pk.opts.ylim = [0, 1.3]; pk.opts.xlim = [0.3, 4.7];
    pk.overlays = { markers: v.map((h, i) => ({ x: i + 1, y: h, label: [T('susp.', 'susp.'), T('nom.', 'nom.'), '1 kg', '2 kg'][i] + ' ' + Math.round(h * 100) + '%', color: '--s1', scale: false })) };
    pk.setSeries([{ name: 'kp', color: '--s1', x, y, width: 2, fill: true }]);
  })();

  /* SIMC */
  const ps = new IP.Plot($('#ps'), { height: 300, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  const ctl2 = IP.controls($('#ctl2'), [
    { id: 'ord', type: 'select', label: T('Modelo para SIMC', 'Model for SIMC'), value: '1', options: [{ value: '1', label: 'FOTD → PI' }, { value: '2', label: 'SOTD → PID' }] },
    { id: 'tc', label: T('Constante deseada', 'Desired time constant'), sym: 'τc', unit: 's', min: 0.04, max: 0.3, step: 0.01, value: 0.1, digits: 2 }
  ], () => step());
  /** PID discreto a 50 Hz (forma paralela, derivada filtrada sobre la medida). */
  function pidLaw(g, r) {
    let I = 0, uk = 0, tk = -1, vprev = 0, dfil = 0; const Ts = 0.02;
    return (t, v) => {
      if (t >= tk + Ts - 1e-9) {
        tk = t; const e = r - v;
        const dv = (v - vprev) / Ts; vprev = v; dfil += (dv - dfil) * 0.5;
        uk = g.KP * (e + I / g.TI - g.TD * dfil); I += e * Ts;
        uk = Math.max(-100, Math.min(100, uk));
      }
      return uk;
    };
  }
  const NOM = fit(relay(LOADS.susp, 10, 20));
  function step() {
    if (!M) return;
    const o = +ctl2.values.ord, tc = ctl2.values.tc, mdl = o === 2 ? M.sotd : M.fotd, g = simc(mdl, tc, o);
    const g0 = simc(NOM.fotd, tc, 1);   // «de serie»: sintonizado una vez en vacío
    const A = simulate(LOADS[load], pidLaw(g, 50), 1.2), B = simulate(LOADS[load], pidLaw(g0, 50), 1.2);
    const ideal = A.t.map(t => (t < D ? 0 : 50 * (1 - Math.exp(-(t - D) / tc))));
    ps.opts.xlim = [0, 1.2];
    ps.setSeries([{ name: T('referencia τc', 'τc reference'), color: '--muted', x: A.t, y: ideal, width: 1.4, dash: [4, 4] }, { name: T('PID fijo (sintonizado en vacío)', 'Fixed PID (tuned unloaded)'), color: '--danger', x: B.t, y: B.v, width: 1.6 }, { name: T('PID resintonizado (SIMC)', 'Retuned PID (SIMC)'), color: LOADS[load].color, x: A.t, y: A.v, width: 2.4 }]);
    const t63 = (S) => { const k = S.v.findIndex(v => v >= 0.632 * 50); return k < 0 ? NaN : S.t[k] - D; };
    const os = (S) => Math.max(0, (Math.max(...S.v) - 50) / 50 * 100);
    $('#ro2').innerHTML = c('K_P', fmt(g.KP, 4)) + c('T_I', fmt(g.TI, 3) + ' s') + c('T_D', g.TD ? fmt(g.TD, 3) + ' s' : '—') + c(T('τ_BC (SIMC)', 'τ_BC (SIMC)'), fmt(t63(A), 3) + ' s', 'hl') + c(T('Sobreoscilación SIMC', 'SIMC overshoot'), Math.round(os(A)) + ' %') + c(T('Sobreoscilación PID fijo', 'Fixed PID overshoot'), Math.round(os(B)) + ' %', os(B) > 15 ? 'bad' : '');
  }
  run();

  IP.quiz($('#quizBox'), [
    { q: T('¿Para qué sirve la histéresis δ del relé?', 'What is the relay hysteresis δ for?'), options: [T('Para evitar conmutaciones espurias por el ruido de la medida de velocidad', 'To avoid spurious switching due to velocity measurement noise'), T('Para aumentar la frecuencia de oscilación', 'To increase the oscillation frequency'), T('Para eliminar el retardo', 'To remove the delay')], answer: 0, explain: T('A cambio, el punto identificado deja de estar en el eje real negativo: −1/N(a) tiene parte imaginaria −πδ/4d.', 'In exchange, the identified point leaves the negative real axis: −1/N(a) has imaginary part −πδ/4d.') },
    { q: T('Con un solo experimento de relé, ¿por qué hay que fijar D?', 'With a single relay experiment, why must D be fixed?'), options: [T('Porque un punto (módulo y fase) sólo determina dos incógnitas y el modelo FOTD tiene tres', 'Because one point (magnitude and phase) only determines two unknowns and the FOTD model has three'), T('Porque D siempre es cero', 'Because D is always zero'), T('Porque lo exige SIMC', 'Because SIMC requires it')], answer: 0, explain: T('Se mide D = 0,02 s (un periodo de muestreo) y se calculan k_p y τ.', 'D = 0.02 s (one sampling period) is measured and k_p and τ are computed.') },
    { q: T('Al añadir 2 kg al Khepera IV, ¿qué le pasa a la ganancia estática?', 'Adding 2 kg to the Khepera IV, what happens to the static gain?'), options: [T('Sube un 25 %', 'It rises by 25%'), T('Cae ~25 % respecto al robot suspendido', 'It drops ~25% relative to the suspended robot'), T('No cambia', 'It does not change')], answer: 1, explain: T('Por eso el PID de serie se queda corto: SIMC compensa aumentando K_P en proporción.', 'That is why the factory PID falls short: SIMC compensates by increasing K_P proportionally.') }
  ]);
})();
