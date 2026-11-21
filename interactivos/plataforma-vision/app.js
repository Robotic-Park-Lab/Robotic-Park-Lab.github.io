/* Página interactiva: A vision based navigation platform for control learning (IFAC ACE 2022) */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t;
  IP.page();
  const G = { kpz: 2, kiz: 0.5, kpw: 25, kiw: 15, scale: 1000 };

  /* Portada: recinto con 6 cámaras Vicon y el dron haciendo el escalón */
  (function hero() {
    const cv = $('#heroCanvas'), sc = new IP.Scene3D(cv, { az: -35, el: 24, radius: 1.6, target: [0, 0, 0.9], autoRotate: IP.reducedMotion() ? 0 : 8 });
    const cams = [0, 1, 2, 3, 4, 5].map(k => { const a = k / 6 * 2 * Math.PI + 0.3; return [1.3 * Math.cos(a), 1.3 * Math.sin(a), 2.3]; });
    let t = 0;
    IP.animate(cv.parentElement, (dt) => {
      t = (t + dt) % 8;
      const z = 0.4 + 0.6 * (t < 4 ? Math.min(1, t / 1.5) : Math.max(0, 1 - (t - 4) / 1.5)), p = [0, 0, z];
      sc.begin();
      const fl = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]];
      sc.poly(fl, { fill: 'rgba(200,230,215,0.08)', stroke: 'rgba(200,230,215,0.3)' });
      cams.forEach((c, k) => {
        sc.point(c, { r: 5, color: '#f0a35f' });
        sc.line(c, p, { color: `rgba(240,163,95,${0.15 + 0.25 * Math.max(0, Math.sin(t * 6 + k))})`, width: 1, dash: [3, 4] });
      });
      sc.drone(p, { color: '#6aa8ec', size: 0.1, alpha: 0.35 });
      sc.draw(dt);
    }).start();
  })();

  /* Mapa conceptual */
  IP.conceptMap($('#cmap'), {
    view: [1040, 520], mobileView: [420, 700],
    nodes: [
      { id: 'lim', label: T('Recursos a bordo\nlimitados', 'Limited on-board\nresources'), kind: 'problem', x: 150, y: 75, mx: 110, my: 60, text: T('<p>27 g, un microcontrolador STM32F405 y una radio de 2,4 GHz compartida: el dron sólo puede encargarse de la actitud.</p>', '<p>27 g, an STM32F405 microcontroller and a shared 2.4 GHz radio: the drone can only handle attitude.</p>') },
      { id: 'vicon', label: T('Captura de\nmovimiento Vicon', 'Vicon motion\ncapture'), kind: 'method', x: 520, y: 75, mx: 310, my: 60, href: '#arquitectura', text: T('<p>Seis cámaras Vero de 2,2 MP localizan los cinco marcadores del dron a 100 Hz con precisión submilimétrica.</p>', '<p>Six 2.2 MP Vero cameras track the drone\'s five markers at 100 Hz with sub-millimetre accuracy.</p>') },
      { id: 'ros', label: T('ROS 2\nfuera de placa', 'Off-board\nROS 2'), kind: 'method', x: 890, y: 75, mx: 110, my: 170, href: '#arquitectura', text: T('<p>Nodos <code>vicon_node</code>, <code>position_controller</code> y el driver del Crazyflie (cflib) intercambian mensajes por tópicos. El control de posición corre en el PC.</p>', '<p><code>vicon_node</code>, <code>position_controller</code> and the Crazyflie driver (cflib) exchange topic messages. Position control runs on the PC.</p>') },
      { id: 'casc', label: T('PI en cascada\nZ → W', 'Cascaded PI\nZ → W'), kind: 'theory', x: 520, y: 260, mx: 310, my: 170, href: '#altitud', text: T('<p>Altitud (Kp 2, Ki 0,5) → velocidad vertical (Kp 25, Ki 15) → empuje. Actitud y velocidad angular a bordo a 500 Hz.</p>', '<p>Altitude (Kp 2, Ki 0.5) → vertical velocity (Kp 25, Ki 15) → thrust. Attitude and angular rate on board at 500 Hz.</p>') },
      { id: 'ebc', label: T('Eventos con\numbral adaptativo', 'Events with\nadaptive threshold'), kind: 'method', x: 150, y: 260, mx: 110, my: 280, href: '#altitud', text: T('<p>Cada lazo sólo envía y calcula cuando su error cambia más que \\(c_0 + a|e| + c_n(t)\\).</p>', '<p>Each loop only sends and computes when its error changes by more than \\(c_0 + a|e| + c_n(t)\\).</p>') },
      { id: 'res', label: T('−92 % / −52 %\nmensajes', '−92% / −52%\nmessages'), kind: 'result', x: 890, y: 260, mx: 310, my: 280, href: '#altitud', text: T('<p>De 1250 mensajes a 92 en el lazo Z y 593 en el W, con IAE, ITAE y MSE prácticamente iguales.</p>', '<p>From 1250 messages to 92 in the Z loop and 593 in the W loop, with practically equal IAE, ITAE and MSE.</p>') },
      { id: 'rp', label: 'Robotic Park', kind: 'result', x: 520, y: 440, mx: 210, my: 400, href: '../robotic-park/', text: T('<p>Esta plataforma creció hasta convertirse en Robotic Park: enjambres de drones y robots terrestres, gemelos digitales y realidad mixta.</p>', '<p>This platform grew into Robotic Park: swarms of drones and ground robots, digital twins and mixed reality.</p>') }
    ],
    edges: [{ from: 'lim', to: 'vicon', label: T('se localiza fuera', 'tracked externally') }, { from: 'vicon', to: 'ros' }, { from: 'ros', to: 'casc' }, { from: 'lim', to: 'ebc', label: T('radio limitada', 'limited radio') }, { from: 'ebc', to: 'casc' }, { from: 'casc', to: 'res' }, { from: 'res', to: 'rp' }]
  }, { panel: $('#cmapPanel'), initial: 'ros' });

  /* Arquitectura interactiva con mensajes animados */
  (function arch() {
    const N = [
      { id: 'cam', x: 20, y: 30, w: 150, t: T('Cámaras Vicon', 'Vicon cameras'), s: '6 × Vero 2.2 MP', d: T('Seis cámaras infrarrojas Vero v2.2 de 2,2 MP (hasta 330 fps) iluminan y ven los 5 marcadores retrorreflectantes asimétricos del dron.', 'Six 2.2 MP Vero v2.2 infrared cameras (up to 330 fps) illuminate and see the drone\'s 5 asymmetric retro-reflective markers.') },
      { id: 'sw', x: 210, y: 30, w: 130, t: T('Switch PoE', 'PoE switch'), s: 'D-Link 26 p.', d: T('Alimenta las cámaras y lleva sus datos al PC de Vicon.', 'Powers the cameras and carries their data to the Vicon PC.') },
      { id: 'trk', x: 380, y: 30, w: 150, t: 'Vicon Tracker 3.9', s: T('PC Windows', 'Windows PC'), d: T('Reconstruye la pose 3D del sólido rígido a 100 Hz.', 'Reconstructs the rigid-body 3D pose at 100 Hz.') },
      { id: 'vn', x: 570, y: 30, w: 150, t: 'vicon_node', s: 'ROS 2', d: T('Publica la pose del dron en un tópico de ROS 2.', 'Publishes the drone pose on a ROS 2 topic.') },
      { id: 'pc', x: 570, y: 140, w: 150, t: 'position_controller', s: T('Z · X-Y · yaw (100 Hz / eventos)', 'Z · X-Y · yaw (100 Hz / events)'), d: T('Lazos de posición y velocidad fuera de placa. Con eventos, sólo calcula y publica cuando el error cambia lo suficiente.', 'Off-board position and velocity loops. With events, it only computes and publishes when the error changes enough.') },
      { id: 'cfn', x: 380, y: 140, w: 150, t: 'crazyflie node', s: 'cflib', d: T('Driver que traduce las consignas a paquetes de radio.', 'Driver that turns setpoints into radio packets.') },
      { id: 'rad', x: 210, y: 140, w: 130, t: 'Crazyradio PA', s: '2,4 GHz', d: T('Antena USB: hasta 15 drones por antena, ancho de banda compartido.', 'USB dongle: up to 15 drones per radio, shared bandwidth.') },
      { id: 'cf', x: 20, y: 140, w: 150, t: 'Crazyflie 2.1', s: T('EKF · actitud 500 Hz', 'EKF · attitude 500 Hz'), d: T('A bordo: estimador EKF, control de actitud y velocidad angular a 500 Hz y mezclador de motores.', 'On board: EKF estimator, 500 Hz attitude and rate control and motor mixer.'), board: true }
    ];
    const W = [['cam', 'sw'], ['sw', 'trk'], ['trk', 'vn'], ['vn', 'pc'], ['pc', 'cfn'], ['cfn', 'rad'], ['rad', 'cf']];
    const by = {}; N.forEach(n => (by[n.id] = n));
    let s = '<svg viewBox="0 0 740 230" role="img"><rect class="zone" x="560" y="10" width="170" height="210" rx="12"/><text class="zl" x="572" y="216">ROS 2 · PC</text>';
    W.forEach(([a, b]) => { const A = by[a], B = by[b]; s += `<path class="wire" id="w-${a}" d="M${A.x + A.w / 2},${A.y + 25} L${B.x + B.w / 2},${B.y + 25}"/>`; });
    N.forEach(n => (s += `<g class="nd${n.board ? ' board' : ''}" data-id="${n.id}" tabindex="0"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="50" rx="10"/><text x="${n.x + n.w / 2}" y="${n.y + 22}" text-anchor="middle">${n.t}</text><text class="sub" x="${n.x + n.w / 2}" y="${n.y + 39}" text-anchor="middle">${n.s}</text></g>`));
    s += '<g id="pkts"></g></svg>';
    $('#arch').innerHTML = s;
    const info = (id) => { IP.$$('.nd', $('#arch')).forEach(g => g.classList.toggle('on', g.dataset.id === id)); $('#archInfo').innerHTML = `<b>${by[id].t}.</b> ${by[id].d}`; };
    IP.$$('.nd', $('#arch')).forEach(g => g.addEventListener('click', () => info(g.dataset.id)));
    info('pc');
    let mode = 'periodic';
    IP.seg($('#archSeg'), [{ value: 'periodic', label: T('Periódico 100 Hz', 'Periodic 100 Hz') }, { value: 'event', label: T('Por eventos', 'Event-based') }], mode, (v) => (mode = v));
    const pk = [], g = $('#pkts');
    let acc = 0, tt = 0, sent = 0;
    IP.animate($('#arch'), (dt) => {
      tt += dt; acc += dt;
      // en la sección de control (pc → cf) la tasa depende del modo; la medida de Vicon siempre es periódica
      const rateCtrl = mode === 'periodic' ? 12 : 1.2 + 4 * Math.max(0, Math.sin(tt * 0.7)) ** 6;
      if (acc > 1 / rateCtrl) { acc = 0; pk.push({ seg: 4, f: 0 }); sent++; }   // consignas: position_controller → dron
      if (Math.random() < dt * 12) pk.push({ seg: 0, f: 0, vic: true });            // medidas de Vicon → ROS 2
      g.innerHTML = '';
      for (let i = pk.length - 1; i >= 0; i--) {
        const q = pk[i]; q.f += dt * 2.2;
        if (q.f >= 1) { q.seg++; q.f = 0; if ((q.vic && q.seg >= 4) || q.seg >= W.length) { pk.splice(i, 1); continue; } }
        const [a, b] = W[q.seg], A = by[a], B = by[b];
        const x = A.x + A.w / 2 + (B.x + B.w / 2 - A.x - A.w / 2) * q.f, y = A.y + 25 + (B.y - A.y) * q.f;
        g.insertAdjacentHTML('beforeend', `<circle class="pk" cx="${x}" cy="${y}" r="4"/>`);
      }
      $('#archRate').textContent = T(`consignas al dron ≈ ${fmt(rateCtrl, 1)} /s`, `setpoints to the drone ≈ ${fmt(rateCtrl, 1)} /s`);
    }).start();
  })();

  /* Escalón de altitud: periódico frente a eventos */
  const pz = new IP.Plot($('#pz'), { height: 230, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  const pm = new IP.Plot($('#pm'), { height: 170, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
  const ctl = IP.controls($('#ctl'), [
    { id: 'c0', label: T('Umbral del lazo Z', 'Z-loop threshold'), sym: 'c₀', min: 0.002, max: 0.05, step: 0.001, value: 0.01, unit: 'm', digits: 3 },
    { id: 'c0w', label: T('Umbral del lazo W', 'W-loop threshold'), sym: 'c₀,w', min: 0.005, max: 0.1, step: 0.005, value: 0.02, unit: 'm/s', digits: 3 },
    { id: 'a', label: T('Peso relativo', 'Relative weight'), sym: 'a', min: 0, max: 0.1, step: 0.005, value: 0.015, digits: 3 },
    { id: 'noise', label: T('Ruido de Vicon (σ)', 'Vicon noise (σ)'), min: 0, max: 0.006, step: 0.0005, value: 0.003, unit: 'm', digits: 4 }
  ], IP.debounce(run, 50));
  function run() {
    const v = ctl.values, ref = (t) => (t < 1 ? 0 : 1), base = { mode: 'cascade', gains: G, ref, T: 16, noise: v.noise, c0: v.c0, c0w: v.c0w, a: v.a, l: 20, seed: 3 };
    const P = ALT.simulate(Object.assign({}, base, { trigger: 'periodic' })), E = ALT.simulate(Object.assign({}, base, { trigger: 'relative' }));
    const sub = (a) => a.filter((_, i) => i % 2 === 0);
    pz.setSeries([
      { name: T('referencia', 'reference'), color: '--muted', x: P.t, y: P.ref, step: true, width: 1.2, dash: [4, 4] },
      { name: T('periódico', 'periodic'), color: '--s5', x: sub(P.t), y: sub(P.z), width: 2, unit: 'm' },
      { name: T('por eventos', 'event-based'), color: '--s1', x: sub(E.t), y: sub(E.z), width: 2.2, unit: 'm' }
    ]);
    const cum = (evT, tt) => { let k = 0; return tt.map(t => { while (k < evT.length && evT[k] <= t) k++; return k; }); };
    pm.setSeries([
      { name: T('periódico (cada lazo)', 'periodic (each loop)'), color: '--s5', x: P.t, y: P.t.map((t, i) => i + 1), width: 2 },
      { name: T('eventos · lazo Z', 'events · Z loop'), color: '--s1', x: E.t, y: cum(E.evT, E.t), width: 2.2 }
    ]);
    const c = (k, x, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${x}</b></div>`;
    const m = E.metrics, mp = P.metrics, n = mp.evZ;
    $('#ro').innerHTML = c(T('Periódico (por lazo)', 'Periodic (per loop)'), String(n)) + c(T('Eventos lazo Z', 'Z-loop events'), `${m.evZ} (−${fmt(100 * (1 - m.evZ / n), 0)} %)`, 'hl') + c(T('Eventos lazo W', 'W-loop events'), `${m.evW} (−${fmt(100 * (1 - m.evW / n), 0)} %)`, 'hl') +
      c('IAE ' + T('periódico', 'periodic'), fmt(mp.iae, 3)) + c(T('IAE eventos', 'IAE events'), fmt(m.iae, 3)) + c(T('MSE eventos', 'MSE events'), fmt(m.mse, 4));
  }
  run();

  IP.quiz($('#quizBox'), [
    { q: T('¿Qué parte del control se queda a bordo del Crazyflie?', 'Which part of the control stays on board the Crazyflie?'), options: [T('Posición X-Y-Z', 'X-Y-Z position'), T('Actitud y velocidad angular a 500 Hz', 'Attitude and angular rate at 500 Hz'), T('Nada', 'Nothing')], answer: 1, explain: T('Los lazos rápidos de actitud necesitan la IMU y no toleran el retardo de la radio; la posición, más lenta, puede ir al PC con ROS 2.', 'The fast attitude loops need the IMU and cannot tolerate radio delay; the slower position loop can move to the ROS 2 PC.') },
    { q: T('¿Por qué es importante reducir mensajes en esta arquitectura?', 'Why is reducing messages important in this architecture?'), options: [T('Porque la radio de 2,4 GHz se comparte entre hasta 15 drones', 'Because the 2.4 GHz radio is shared by up to 15 drones'), T('Porque Vicon sólo mide a 1 Hz', 'Because Vicon only measures at 1 Hz'), T('Porque ROS 2 no admite más de 100 mensajes', 'Because ROS 2 does not support over 100 messages')], answer: 0, explain: T('Al escalar a un enjambre, el ancho de banda de la Crazyradio se convierte en el cuello de botella.', 'When scaling to a swarm, Crazyradio bandwidth becomes the bottleneck.') },
    { q: T('¿Qué lazo reduce más sus mensajes con eventos?', 'Which loop reduces its messages most with events?'), options: [T('El de velocidad W', 'The W velocity loop'), T('El de posición Z', 'The Z position loop'), T('Los dos igual', 'Both equally')], answer: 1, explain: T('La posición cambia despacio y casi no hay que recalcularla en régimen permanente (−92 %); la velocidad necesita más correcciones (−52 %).', 'Position changes slowly and barely needs recomputing in steady state (−92%); velocity needs more corrections (−52%).') }
  ]);
})();
