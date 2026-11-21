/* Página interactiva: Blockchain-based cloud controllers for reliable NCS (JII 2025) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t;
  IP.page();

  /* Redes del artículo: TTF (s) y coste por transacción ($) */
  const NETS = [
    { id: 'fantom', n: 'Fantom', ttf: [1, 3], c: 0.00004 },
    { id: 'zenith', n: 'Zenith', ttf: [1, 2], c: 0.001 },
    { id: 'polygon', n: 'Polygon', ttf: [2, 3], c: 0.003 },
    { id: 'solana', n: 'Solana', ttf: [4, 12], c: 0.00025 },
    { id: 'ethereum', n: 'Ethereum', ttf: [30, 60], c: 0.5011 },
    { id: 'bitcoin', n: 'Bitcoin', ttf: [2400, 2400], c: 2.207 }
  ];
  const net = (id) => NETS.find(n => n.id === id);
  const money = (x) => (x >= 100 ? fmt(x, 0) : x >= 1 ? fmt(x, 2) : x >= 0.01 ? fmt(x, 3) : x.toExponential(1).replace('.', IP.lang === 'en' ? '.' : ',')) + ' $';
  const rng = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

  /* Portada: anillo de nodos que replican el contrato */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -30, el: 28, radius: 2.4, target: [0, 0, 0.1], autoRotate: IP.reducedMotion() ? 0 : 7 });
    const N = 8, P = Array.from({ length: N }, (_, i) => [Math.cos(i / N * 2 * Math.PI), Math.sin(i / N * 2 * Math.PI), 0.25 * Math.sin(i * 1.7)]);
    const cube = (c, k, col, al) => { const v = (x, y, z) => [c[0] + x * k, c[1] + y * k, c[2] + z * k]; [[v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1)], [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)], [v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)], [v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1)], [v(1, 1, -1), v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1)], [v(-1, 1, -1), v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1)]].forEach(f => sc.poly(f, { fill: col, alpha: al, stroke: col, width: 1 })); };
    let t = 0, src = 0;
    IP.animate(cv.parentElement, (dt) => {
      t += dt; const ph = (t % 2) / 2; if (t % 2 < dt) src = (src + 3) % N;
      sc.begin();
      P.forEach((p, i) => P.forEach((q, j) => { if (j > i && (j - i === 1 || j - i === 3 || (i === 0 && j === N - 1))) sc.line(p, q, { color: 'rgba(200,230,215,0.25)', width: 1 }); }));
      P.forEach((p, i) => { const d = Math.min(Math.abs(i - src), N - Math.abs(i - src)) / (N / 2); const lit = ph > d * 0.8; cube(p, 0.12, lit ? '#7fd1a8' : '#6aa8ec', lit ? 0.55 : 0.25); });
      P.forEach((p, i) => { if (i === src) return; const s = P[src], k = Math.min(1, ph / (0.8 * Math.min(Math.abs(i - src), N - Math.abs(i - src)) / (N / 2) + 1e-6)); if (k < 1) sc.point([s[0] + (p[0] - s[0]) * k, s[1] + (p[1] - s[1]) * k, s[2] + (p[2] - s[2]) * k], { r: 3, color: '#f0a35f' }); });
      sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'fail', label: T('Fallo o ataque\nal controlador', 'Controller failure\nor attack'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>En el control en la nube un único servidor es un punto de fallo: si cae o se compromete, la planta queda sin control.</p>', '<p>In cloud control a single server is a point of failure: if it goes down or is compromised, the plant is left uncontrolled.</p>') },
      { id: 'sc', label: T('PI como contrato\ninteligente', 'PI as a smart\ncontract'), kind: 'method', x: 520, y: 75, mx: 310, my: 60, href: '#lazo', text: T('<p>El PI se despliega en una red compatible con EVM y se accede por su dirección; todos los nodos lo replican por consenso. Hay librerías de PI, PID y anti-windup.</p>', '<p>The PI is deployed on an EVM-compatible network and accessed by its address; all nodes replicate it by consensus. There are PI, PID and anti-windup libraries.</p>') },
      { id: 'rw', label: T('Escritura con coste\nlectura gratuita', 'Paid write\nfree read'), kind: 'theory', x: 890, y: 75, mx: 110, my: 170, href: '#lazo', text: T('<p><code>Update error</code> es una transacción; <code>Compute control action</code> es una lectura sin coste.</p>', '<p><code>Update error</code> is a transaction; <code>Compute control action</code> is a free read.</p>') },
      { id: 'ttf', label: T('TTF y coste\npor red', 'TTF and cost\nper network'), kind: 'theory', x: 890, y: 260, mx: 310, my: 170, href: '#redes', text: T('<p>De 1–3 s (Fantom) a ~2400 s (Bitcoin); de 0,00004 $ a 2,207 $ por transacción. Sólo sirven procesos con constantes de tiempo suficientemente grandes.</p>', '<p>From 1–3 s (Fantom) to ~2400 s (Bitcoin); from $0.00004 to $2.207 per transaction. Only processes with large enough time constants are suitable.</p>') },
      { id: 'ebc', label: T('Control por\neventos (SOD)', 'Event-based\ncontrol (SOD)'), kind: 'method', x: 520, y: 260, mx: 110, my: 280, href: '#lazo', text: T('<p>Un generador de eventos en la planta sólo escribe en la cadena cuando la medida cambia más de δ.</p>', '<p>An event generator at the plant only writes to the chain when the measurement changes by more than δ.</p>') },
      { id: 'gh', label: T('Invernadero\n8 días · 6 variables', 'Greenhouse\n8 days · 6 variables'), kind: 'result', x: 150, y: 260, mx: 310, my: 280, href: '#invernadero', text: T('<p>~95 % menos transacciones y un coste medio 27,73 veces menor en Fantom.</p>', '<p>~95% fewer transactions and a 27.73-fold lower average cost on Fantom.</p>') },
      { id: 'fut', label: T('Redes reales y\nplantas físicas', 'Real networks and\nphysical plants'), kind: 'result', x: 520, y: 440, mx: 210, my: 400, text: T('<p>Trabajo futuro: desplegar el PI en redes reales, controlar plantas físicas, consenso entre varios controladores y privacidad (redes privadas o cifrado homomórfico).</p>', '<p>Future work: deploy the PI on real networks, control physical plants, multi-controller consensus and privacy (private networks or homomorphic encryption).</p>') }
    ],
    edges: [{ from: 'fail', to: 'sc' }, { from: 'sc', to: 'rw' }, { from: 'rw', to: 'ttf' }, { from: 'ttf', to: 'ebc' }, { from: 'ebc', to: 'gh' }, { from: 'gh', to: 'fut', bend: 0.1 }, { from: 'sc', to: 'ebc', bend: 0 }]
  }, { panel: $('#cmapPanel'), initial: 'sc' });

  /* Lazo cerrado: invernadero de primer orden con PI en la cadena */
  const py = new IP.Plot($('#py'), { height: 260, xlabel: T('tiempo (min)', 'time (min)'), xname: 't', xunit: 'min' });
  let mode = 'event';
  IP.seg($('#sampSeg'), [{ value: 'periodic', label: T('Periódico', 'Periodic') }, { value: 'event', label: T('Eventos δ', 'Events δ') }], mode, (v) => { mode = v; reset(); });
  const ctl = IP.controls($('#ctl'), [
    { id: 'net', type: 'select', label: T('Red blockchain', 'Blockchain network'), value: 'fantom', options: NETS.map(n => ({ value: n.id, label: `${n.n} · TTF ${n.ttf[0]}${n.ttf[1] !== n.ttf[0] ? '–' + n.ttf[1] : ''} s` })) },
    { id: 'tau', type: 'select', label: T('Constante de tiempo del proceso', 'Process time constant'), value: '300', options: [{ value: '30', label: 'τ = 30 s' }, { value: '300', label: 'τ = 5 min' }, { value: '3000', label: 'τ = 50 min' }] },
    { id: 'delta', label: T('Umbral (temperatura interior)', 'Threshold (indoor temperature)'), sym: 'δ', unit: '°C', min: 0.05, max: 1.5, step: 0.05, value: 0.6, digits: 2 }
  ], () => reset());
  $('#run').addEventListener('click', () => reset());
  let S;
  function reset() {
    const tau = +ctl.values.tau, N = net(ctl.values.net);
    S = { tau, N, Ts: tau / 10, h: tau / 200, t: 0, T: 16, Tend: 12 * tau, I: 0, u: 0, lastSent: null, lastT: 0, pend: [], tx: 0, cost: 0, iae: 0, hist: { t: [], y: [], r: [], tout: [] }, blocks: [], R: rng(5), nextS: 0, lastUpd: 0, eSent: 0 };
    $('#chain').innerHTML = '';
  }
  const K = 0.2, ref = (t, tau) => (t < 2 * tau ? 18 : 22), tout = (t, tau) => 14 + 3 * Math.sin(2 * Math.PI * t / (8 * tau));
  function stepSim(n) {
    const tau = S.tau, Kp = 2 / K, Ki = Kp / tau;    // λ = τ/2
    for (let k = 0; k < n && S.t < S.Tend; k++) {
      const y = S.T + 0.02 * (S.R() - 0.5), r = ref(S.t, tau);
      // generador de eventos / muestreo periódico en la planta
      let send = false;
      if (S.t >= S.nextS) { S.nextS += mode === 'periodic' ? S.Ts : S.h; send = mode === 'periodic' || S.lastSent === null || Math.abs(y - S.lastSent) > ctl.values.delta || r !== S.lastRef; }
      if (send) { S.lastSent = y; S.lastRef = r; const ttf = S.N.ttf[0] + (S.N.ttf[1] - S.N.ttf[0]) * S.R(); S.pend.push({ e: r - y, at: S.t + ttf, sent: S.t }); S.tx++; S.cost += S.N.c; }
      // confirmación de transacciones (en orden): el contrato actualiza su estado
      while (S.pend.length && S.pend[0].at <= S.t) {
        const tx = S.pend.shift(), dt = Math.max(0, tx.sent - S.lastUpd); S.lastUpd = tx.sent;
        S.I += Ki * S.eSent * dt; S.eSent = tx.e;
        S.u = Math.max(0, Math.min(100, Kp * tx.e + S.I)); S.I = Math.max(-50, Math.min(100, S.I));
        S.blocks.push({ n: S.tx - S.pend.length, e: tx.e });
        const div = document.createElement('div'); div.className = 'blk'; div.innerHTML = `<b>#${S.blocks.length}</b>e=${fmt(tx.e, 2)}`; $('#chain').prepend(div); if ($('#chain').children.length > 12) $('#chain').lastChild.remove();
      }
      // planta: dT/dt = (−(T − T_out) + K u)/τ; la planta lee u (lectura gratuita) en cada paso
      S.T += S.h * (-(S.T - tout(S.t, tau)) + K * S.u) / tau;
      S.iae += Math.abs(r - S.T) * S.h; S.t += S.h;
      if (S.hist.t.length === 0 || S.t - S.hist.t[S.hist.t.length - 1] * 60 >= S.tau / 50) { S.hist.t.push(S.t / 60); S.hist.y.push(S.T); S.hist.r.push(r); S.hist.tout.push(tout(S.t, tau)); }
    }
  }
  reset();
  const c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
  IP.animate($('#lazo'), (dt) => {
    if (!S) return;
    stepSim(Math.round(dt * 200 / 6));            // ~6 s de animación por τ
    py.opts.xlim = [0, S.Tend / 60];
    py.setSeries([{ name: T('referencia', 'setpoint'), color: '--muted', x: S.hist.t, y: S.hist.r, width: 1.4, dash: [4, 4], step: true }, { name: T('exterior', 'outdoor'), color: '--s5', x: S.hist.t, y: S.hist.tout, width: 1.2, dash: [2, 3] }, { name: T('interior', 'indoor'), color: '--s1', x: S.hist.t, y: S.hist.y, width: 2.2 }]);
    $('#tt').textContent = `t = ${fmt(S.t / 60, 1)} min`;
    const feas = S.N.ttf[1] <= S.Ts;
    $('#ro').innerHTML = c(T('Transacciones', 'Transactions'), String(S.tx)) + c(T('Pendientes', 'Pending'), String(S.pend.length), S.pend.length > 2 ? 'bad' : '') + c(T('Coste', 'Cost'), money(S.cost), 'hl') + c('IAE', fmt(S.iae / 60, 1) + ' °C·min') +
      c('T_s / TTF_max', `${fmt(S.Ts, 0)} s / ${fmt(S.N.ttf[1], 0)} s`, feas ? 'good' : 'bad') + c(T('Coste/día periódico', 'Daily cost, periodic'), money(S.N.c * 86400 / S.Ts));
  }).start();

  /* Redes: barras logarítmicas */
  const TSS = [0.1, 0.3, 1, 3, 10, 30, 60, 300, 3000];
  const ctl2 = IP.controls($('#ctl2'), [{ id: 'ts', type: 'select', label: T('Periodo de muestreo', 'Sampling period'), value: '3', options: TSS.map(x => ({ value: String(x), label: 'T_s = ' + fmt(x, x < 1 ? 1 : 0) + ' s' })) }], () => bars());
  function lbar(el, rows) {
    el.innerHTML = rows.map(r => `<div class="lbar ${r.no ? 'no' : ''}"><span>${r.n}</span><div class="tr"><i class="${r.cls || ''}" style="width:${Math.max(2, Math.min(100, r.w))}%"></i></div><span>${r.v}</span></div>`).join('');
  }
  function bars() {
    const Ts = +ctl2.values.ts;
    lbar($('#bTTF'), NETS.map(n => ({ n: n.n, w: (Math.log10(n.ttf[1]) + 0.5) / 4 * 100, v: `${n.ttf[0]}${n.ttf[1] !== n.ttf[0] ? '–' + n.ttf[1] : ''} s`, no: n.ttf[1] > Ts, cls: n.ttf[1] > Ts ? 'r' : '' })));
    lbar($('#bCost'), NETS.map(n => { const y = n.c * 86400 / Ts; return { n: n.n, w: (Math.log10(y) + 3) / 9 * 100, v: n.ttf[1] > Ts ? T('inviable', 'unfeasible') : money(y) + T('/día', '/day'), no: n.ttf[1] > Ts, cls: 'r' }; }));
  }
  bars();

  /* Caso de estudio */
  const VARS = [
    { n: T('Temp. interior', 'Indoor temp.'), d: '0,6', Ts: 58.5, p: 11808, e: 279 },
    { n: T('Temp. exterior', 'Outdoor temp.'), d: '0,61', Ts: 58.5, p: 11808, e: 353 },
    { n: T('Humedad', 'Humidity'), d: '0,49', Ts: 45, p: 15360, e: 358 },
    { n: T('Radiación solar', 'Solar radiation'), d: '34,30', Ts: 45, p: 15360, e: 553 },
    { n: T('Vel. del viento', 'Wind speed'), d: '0,53', Ts: 20, p: 34560, e: 3715 },
    { n: T('Dir. del viento', 'Wind direction'), d: '17,84', Ts: 20, p: 34560, e: 3255 }
  ];
  const ctl3 = IP.controls($('#ctl3'), [{ id: 'net', type: 'select', label: T('Red', 'Network'), value: 'fantom', options: NETS.map(n => ({ value: n.id, label: n.n })) }], () => kase());
  function kase() {
    const N = net(ctl3.values.net), dot = (s) => (IP.lang === 'en' ? s.replace(',', '.') : s);
    $('#tcase').innerHTML = `<thead><tr><th style="text-align:left">${T('Variable', 'Variable')}</th><th>δ</th><th>T_s (s)</th><th>${T('Periódico', 'Periodic')}</th><th>${T('Eventos', 'Events')}</th><th>×</th></tr></thead><tbody>` +
      VARS.map(v => `<tr${v.Ts < N.ttf[1] ? ' style="opacity:.5"' : ''}><td style="text-align:left">${v.n}</td><td class="num">${dot(v.d)}</td><td class="num">${fmt(v.Ts, 1)}</td><td class="num">${v.p.toLocaleString(IP.locale)}</td><td class="num">${v.e.toLocaleString(IP.locale)}</td><td class="num">${fmt(v.p / v.e, 1)}</td></tr>`).join('') + '</tbody>';
    const P = VARS.reduce((s, v) => s + v.p, 0), E = VARS.reduce((s, v) => s + v.e, 0), ratio = VARS.reduce((s, v) => s + v.p / v.e, 0) / VARS.length;
    const ok = VARS.every(v => v.Ts >= N.ttf[1]);
    $('#ro3').innerHTML = c(T('Coste periódico (8 días)', 'Periodic cost (8 days)'), ok ? money(P * N.c) : T('inviable', 'unfeasible'), ok ? '' : 'bad') + c(T('Coste con eventos', 'Event-based cost'), ok ? money(E * N.c) : '—', 'hl') + c(T('Reducción de transacciones', 'Transaction reduction'), fmt(100 * (1 - E / P), 1) + ' %') + c(T('Reducción media por variable', 'Mean reduction per variable'), fmt(ratio, 2) + '×', 'good');
  }
  kase();

  IP.quiz($('#quizBox'), [
    { q: T('¿Qué operación del contrato cuesta dinero?', 'Which contract operation costs money?'), options: [T('Update error: escribe en la cadena', 'Update error: it writes to the chain'), T('Compute control action: lee el estado', 'Compute control action: it reads the state'), T('Ambas', 'Both')], answer: 0, explain: T('Escribir requiere una transacción validada por consenso; leer el estado desde un nodo es gratis.', 'Writing requires a transaction validated by consensus; reading the state from a node is free.') },
    { q: T('Con τ = 30 s y Ts = 3 s, ¿sirve Ethereum (TTF 30–60 s)?', 'With τ = 30 s and Ts = 3 s, does Ethereum (TTF 30–60 s) work?'), options: [T('No: las transacciones se confirman mucho después del siguiente muestreo y se acumulan', 'No: transactions confirm long after the next sample and pile up'), T('Sí, pero más caro', 'Yes, but more expensive'), T('Sí, si se usan eventos', 'Yes, if events are used')], answer: 0, explain: T('Pruébalo en la sección 2: el número de transacciones pendientes crece y el control llega tarde.', 'Try it in section 2: the number of pending transactions grows and control arrives late.') },
    { q: T('¿De dónde sale el «27,73 veces» del artículo?', 'Where does the paper\'s "27.73-fold" come from?'), options: [T('Es la media, sobre las seis variables, del cociente entre muestras periódicas y por eventos', 'It is the mean, over the six variables, of the ratio between periodic and event-based samples'), T('Es el cociente de TTF entre Fantom y Bitcoin', 'It is the TTF ratio between Fantom and Bitcoin'), T('Es el coste diario de Fantom', 'It is Fantom\'s daily cost')], answer: 0, explain: T('Como el coste por transacción es fijo en cada red, reducir transacciones reduce el coste en la misma proporción.', 'Since the per-transaction cost is fixed on each network, reducing transactions reduces cost in the same proportion.') }
  ]);
})();
