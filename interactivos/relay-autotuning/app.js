/* ============================================================
   Página interactiva: Relay-based autotuning (Mechatronics 2026)
   Conecta la interfaz con modelo.js (simulación) y gimbal3d.js.
   ============================================================ */
(function () {
  'use strict';
  const R = window.RELAY, P = R.PAPER, DT = R.DT, $ = IP.$, fmt = IP.fmt, T = IP.t;
  const AX = R.AXES;
  const BEST_RATE = { roll: 'SIMC', pitch: 'AMIGO PI' };   // mejores del artículo (Sec. 5.2)
  IP.page();

  /* ------------------------------------------------------------
     0. Portada: gimbal girando con una oscilación tipo relé
     ------------------------------------------------------------ */
  (function hero() {
    const cv = $('#heroGimbal'); if (!cv) return;
    const g = new Gimbal3D(cv, { autoRotate: IP.reducedMotion() ? 0 : 7, el: 22, az: -40, dist: 6.4 });
    const tri = (x) => 2 * Math.abs(2 * (x - Math.floor(x + 0.5))) - 1;     // onda triangular ±1
    IP.animate(cv.parentElement, (dt, t) => {
      const k = IP.reducedMotion() ? 0.2 : 1;
      const roll = 16 * tri(t * k / 1.1), pitch = 11 * Math.sin(t * k * 0.55), yaw = 35 * Math.sin(t * k * 0.13);
      const s = Math.sign(Math.cos(2 * Math.PI * t * k / 1.1 + 0.4));
      g.setAngles(roll, pitch, yaw).setMotors([0.55 - 0.2 * s, 0.55 - 0.2 * s, 0.55 + 0.2 * s, 0.55 + 0.2 * s]);
      g.render(dt);
    }).start();
  })();

  /* ------------------------------------------------------------
     1. Mapa conceptual
     ------------------------------------------------------------ */
  (function cmap() {
    const nodes = [
      { id: 'gimbal', label: T('Open Gimbal\n3 GDL', 'Open Gimbal\n3 DOF'), kind: 'method', x: 520, y: 70, mx: 310, my: 60, href: '#banco',
        text: T('<p>Estructura de tres anillos en cascada (roll, pitch, yaw) impresa en PLA ligero. Permite al Crazyflie girar libremente sin volar y mantener ángulos que en vuelo libre exigirían mucho espacio.</p><p>Contrapartida: <b>añade masa e inercia</b> (5 g en roll, 25 g en pitch, 57 g en yaw), así que lo que se identifica es el sistema acoplado dron–gimbal.</p>', '<p>Three cascaded rings (roll, pitch, yaw) printed in lightweight PLA. It lets the Crazyflie rotate freely without flying and hold angles that in free flight would require a lot of space.</p><p>Downside: <b>it adds mass and inertia</b> (5 g in roll, 25 g in pitch, 57 g in yaw), so what is identified is the coupled drone–gimbal system.</p>') },
      { id: 'problem', label: T('PID de fábrica\nfalla', 'Factory PID\nfails'), kind: 'problem', x: 150, y: 70, mx: 110, my: 60, href: '#sintonia',
        text: T('<p>Los controladores por defecto del Crazyflie se diseñaron para vuelo libre. Con la inercia añadida del gimbal, el <b>pitch se vuelve inestable</b> y hay que estabilizarlo a mano con un controlador P, que además deja error en régimen permanente.</p>', '<p>The Crazyflie default controllers were designed for free flight. With the gimbal\'s added inertia, <b>pitch becomes unstable</b> and has to be stabilised by hand with a P controller, which also leaves a steady-state error.</p>') },
      { id: 'cascade', label: T('Control en\ncascada 500 Hz', 'Cascade control\n500 Hz'), kind: 'theory', x: 890, y: 70, mx: 310, my: 170, href: '#banco',
        text: T('<p>El Crazyflie controla la orientación con dos PID en cascada a 500 Hz: el de <b>actitud</b> genera consignas de velocidad angular y el de <b>velocidad</b> genera órdenes de par para el mezclador de motores. En el gimbal se desactiva el lazo de posición.</p>', '<p>The Crazyflie controls its orientation with two cascaded PIDs at 500 Hz: the <b>attitude</b> one generates angular-rate setpoints and the <b>rate</b> one generates torque commands for the motor mixer. On the gimbal the position loop is disabled.</p>') },
      { id: 'relay', label: T('Relé con\nhistéresis d, δ', 'Relay with\nhysteresis d, δ'), kind: 'method', x: 150, y: 230, mx: 110, my: 170, href: '#rele',
        text: T('<p>Durante el ensayo, un relé sustituye al PID del lazo que se quiere identificar. Entrega ±<i>d</i> según el signo del error; la histéresis <i>δ</i> evita conmutaciones por ruido. Se implementa en el firmware y se configura desde ROS 2, con transferencia sin saltos (<i>bumpless</i>).</p>', '<p>During the test, a relay replaces the PID of the loop to be identified. It outputs ±<i>d</i> depending on the sign of the error; the hysteresis <i>δ</i> prevents noise-induced switching. It is implemented in the firmware and configured from ROS 2, with bumpless transfer.</p>') },
      { id: 'cycle', label: T('Ciclo límite\na, Tu, D', 'Limit cycle\na, Tu, D'), kind: 'method', x: 520, y: 230, mx: 110, my: 280, href: '#rele',
        text: T('<p>El lazo con relé oscila de forma sostenida y acotada. Bastan <b>dos ciclos</b> para medir la amplitud <i>a</i>, el periodo <i>T<sub>u</sub></i> y el retardo <i>D</i> (de la conmutación al pico siguiente).</p>', '<p>The relay loop oscillates in a sustained, bounded way. <b>Two cycles</b> are enough to measure the amplitude <i>a</i>, the period <i>T<sub>u</sub></i> and the delay <i>D</i> (from the switch to the next peak).</p>') },
      { id: 'df', label: T('Función\ndescriptiva', 'Describing\nfunction'), kind: 'theory', x: 890, y: 230, mx: 310, my: 280, href: '#rele',
        text: T('<p>El relé se aproxima por su primer armónico. Su función descriptiva inversa es \\(-\\tfrac{1}{N(a)} = -\\tfrac{\\pi}{4d}\\big(\\sqrt{a^2-\\delta^2}+j\\delta\\big)\\): una recta horizontal. El ciclo límite está donde la curva de Nyquist del proceso la corta.</p>', '<p>The relay is approximated by its first harmonic. Its inverse describing function is \\(-\\tfrac{1}{N(a)} = -\\tfrac{\\pi}{4d}\\big(\\sqrt{a^2-\\delta^2}+j\\delta\\big)\\): a horizontal line. The limit cycle lies where the process Nyquist curve crosses it.</p>') },
      { id: 'ku', label: T('Punto crítico\nKu, ωu', 'Critical point\nKu, ωu'), kind: 'theory', x: 890, y: 390, mx: 310, my: 390, href: '#modelo',
        text: T('<p>\\(K_u = \\dfrac{4d}{\\pi\\sqrt{a^2-\\delta^2}}\\) y \\(\\omega_u = 2\\pi/T_u\\). Es la información clásica de Ziegler–Nichols, pero aquí se usa para ajustar un modelo paramétrico.</p>', '<p>\\(K_u = \\dfrac{4d}{\\pi\\sqrt{a^2-\\delta^2}}\\) and \\(\\omega_u = 2\\pi/T_u\\). This is the classical Ziegler–Nichols information, but here it is used to fit a parametric model.</p>') },
      { id: 'ipdt', label: T('Integrador\ncon retardo', 'Integrator\nplus delay'), kind: 'method', x: 520, y: 390, mx: 110, my: 500, href: '#modelo',
        text: T('<p>\\(G(s)=\\tfrac{k_p}{s}e^{-Ds}\\), con \\(k_p=\\omega_u/K_u\\) y \\(D=\\pi/(2\\omega_u)\\). Es el modelo que mejor encaja: el giro de un cuerpo rígido integra el par aplicado. Ajuste del 85–88 % en roll y del 77–83 % en pitch.</p>', '<p>\\(G(s)=\\tfrac{k_p}{s}e^{-Ds}\\), with \\(k_p=\\omega_u/K_u\\) and \\(D=\\pi/(2\\omega_u)\\). It is the best-fitting model: the rotation of a rigid body integrates the applied torque. 85–88% fit in roll and 77–83% in pitch.</p>') },
      { id: 'fopdt', label: T('Primer orden\ncon retardo ✗', 'First order\nplus delay ✗'), kind: 'problem', x: 150, y: 390, mx: 310, my: 500, href: '#modelo',
        text: T('<p>\\(G(s)=\\tfrac{k_p}{\\tau s+1}e^{-Ds}\\). La estimación <b>falla</b>: sale \\(\\tau = -0{,}32\\) s en pitch y \\(1{,}75\\cdot10^{13}\\) s en roll. Confirma que la dinámica es integradora.</p>', '<p>\\(G(s)=\\tfrac{k_p}{\\tau s+1}e^{-Ds}\\). The estimate <b>fails</b>: it gives \\(\\tau = -0.32\\) s in pitch and \\(1.75\\cdot10^{13}\\) s in roll. This confirms the dynamics are integrating.</p>') },
      { id: 'rules', label: T('Reglas\nAMIGO · SIMC', 'Rules\nAMIGO · SIMC'), kind: 'method', x: 150, y: 545, mx: 110, my: 610, href: '#sintonia',
        text: T('<p>AMIGO (PI y PID) y SIMC (PI) dan las ganancias a partir de <i>k<sub>p</sub></i> y <i>D</i>. Son reglas pensadas tanto para seguimiento como para rechazo de perturbaciones, algo necesario porque cada lazo recibe consignas del superior.</p>', '<p>AMIGO (PI and PID) and SIMC (PI) give the gains from <i>k<sub>p</sub></i> and <i>D</i>. They are rules designed for both tracking and disturbance rejection, which is needed because each loop receives setpoints from the one above.</p>') },
      { id: 'pid', label: T('PID\nautosintonizado', 'Autotuned\nPID'), kind: 'result', x: 420, y: 545, mx: 310, my: 610, href: '#sintonia',
        text: T('<p>Con los PID nuevos el tiempo de subida mejora un <b>85,9 % en roll</b> (AMIGO PID) y un <b>76,2 % en pitch</b> (SIMC). SIMC resulta la mejor regla para pitch y AMIGO para roll.</p>', '<p>With the new PIDs the rise time improves by <b>85.9% in roll</b> (AMIGO PID) and <b>76.2% in pitch</b> (SIMC). SIMC turns out to be the best rule for pitch and AMIGO for roll.</p>') },
      { id: 'events', label: T('Control por\neventos', 'Event-based\ncontrol'), kind: 'method', x: 680, y: 545, mx: 110, my: 720, href: '#eventos',
        text: T('<p>El PID sólo se ejecuta cuando \\(|e(t)-e(t_k)| > c_0 + a_i|x-x_{ref}| + c_n(t)\\). Doble papel: ahorra cómputo y sirve de <b>indicador objetivo de la calidad de la sintonía</b> (menos eventos = el sistema está más cerca de la referencia).</p>', '<p>The PID only runs when \\(|e(t)-e(t_k)| > c_0 + a_i|x-x_{ref}| + c_n(t)\\). A dual role: it saves computation and acts as an <b>objective indicator of tuning quality</b> (fewer events = the system is closer to the setpoint).</p>') },
      { id: 'res', label: T('−30,56 % CPU\n−96 % ejecuciones', '−30.56% CPU\n−96% executions'), kind: 'result', x: 920, y: 545, mx: 310, my: 720, href: '#resultados',
        text: T('<p>El tiempo de CPU del control baja de 6,50 a 4,51 ms por segundo (−30,56 %). Las ejecuciones del controlador caen entre un 67 % y un 98 % según el lazo, sin perder estabilidad.</p>', '<p>The control CPU time drops from 6.50 to 4.51 ms per second (−30.56%). Controller executions drop by between 67% and 98% depending on the loop, without losing stability.</p>') }
    ];
    const edges = [
      { from: 'gimbal', to: 'problem', label: T('añade inercia', 'adds inertia') },
      { from: 'gimbal', to: 'cascade', label: T('sin lazo de posición', 'no position loop') },
      { from: 'problem', to: 'relay', label: T('se propone', 'we propose') },
      { from: 'cascade', to: 'relay', label: T('sustituye a un PID', 'replaces a PID'), bend: -0.08 },
      { from: 'relay', to: 'cycle', label: T('provoca', 'triggers') },
      { from: 'cycle', to: 'df', label: T('se analiza con', 'analysed with') },
      { from: 'df', to: 'ku', label: T('da', 'gives') },
      { from: 'ku', to: 'ipdt', label: T('ec. 8', 'eq. 8') },
      { from: 'ipdt', to: 'fopdt', label: T('frente a (ec. 9)', 'vs (eq. 9)'), bend: 0 },
      { from: 'ipdt', to: 'rules', label: 'kp, D', bend: 0.05 },
      { from: 'rules', to: 'pid' },
      { from: 'pid', to: 'events', label: T('se ejecuta por', 'run by') },
      { from: 'events', to: 'res' },
      { from: 'pid', to: 'problem', label: T('resuelve', 'solves'), bend: 0.18 }
    ];
    IP.conceptMap($('#cmap'), { view: [1040, 645], mobileView: [420, 800], nodes, edges }, { panel: $('#cmapPanel'), initial: 'relay', label: T('Mapa conceptual del artículo', 'Concept map of the paper') });
  })();

  /* ------------------------------------------------------------
     2. Banco de ensayo: gimbal 3D + arquitectura
     ------------------------------------------------------------ */
  (function bench() {
    const cv = $('#benchGimbal');
    const g = new Gimbal3D(cv, { az: -50, el: 20, dist: 6.3 });
    const ctl = IP.controls($('#benchControls'), [
      { id: 'roll', label: 'Roll', sym: 'φ', min: -60, max: 60, step: 1, value: 15, unit: '°', digits: 0 },
      { id: 'pitch', label: 'Pitch', sym: 'θ', min: -60, max: 60, step: 1, value: -10, unit: '°', digits: 0 },
      { id: 'yaw', label: 'Yaw', sym: 'ψ', min: -180, max: 180, step: 1, value: 30, unit: '°', digits: 0 },
      { id: 'lockPitch', type: 'toggle', label: T('Bloquear pitch y yaw (ensayo de roll)', 'Lock pitch and yaw (roll test)'), value: false },
      { id: 'anim', type: 'toggle', label: T('Animación automática', 'Automatic animation'), value: true }
    ], () => {});
    ['roll', 'pitch', 'yaw'].forEach(axn => {
      const w = ctl.el(axn).closest('.ip-control');
      ['mouseenter', 'focusin'].forEach(ev => w.addEventListener(ev, () => g.highlight(axn)));
      ['mouseleave', 'focusout'].forEach(ev => w.addEventListener(ev, () => g.highlight(null)));
      ctl.el(axn).addEventListener('input', () => ctl.set('anim', false, true));
    });
    let t0 = 0;
    IP.animate(cv.parentElement, (dt, t) => {
      const v = ctl.values, lock = v.lockPitch;
      if (v.anim) {
        t0 += dt;
        ctl.set('roll', Math.round(25 * Math.sin(t0 * 0.9)), true);
        if (!lock) { ctl.set('pitch', Math.round(18 * Math.sin(t0 * 0.6 + 1)), true); ctl.set('yaw', Math.round(60 * Math.sin(t0 * 0.25)), true); }
      }
      const r = v.roll, p = lock ? 0 : v.pitch, y = lock ? 0 : v.yaw;
      g.setLocks({ pitch: lock, yaw: lock }).setAngles(r, p, y);
      const tr = Math.sign(Math.cos(t0 * 0.9)) * 0.18 * (v.anim ? 1 : 0);
      g.setMotors([0.5 - tr, 0.5 - tr, 0.5 + tr, 0.5 + tr]).render(dt);
    }).start();

    // barras de masa
    const mb = $('#massBars');
    [['Roll', P.masses.roll, '#3fae7e'], ['Pitch', P.masses.pitch, '#9aa7a0'], ['Yaw', P.masses.yaw, 'var(--danger)']].forEach(([n, m, c]) => {
      mb.insertAdjacentHTML('beforeend', `<div class="mass-bar"><span>${n}</span><div class="track"><i style="width:${m / 70 * 100}%;background:${c}"></i><span class="lim" style="left:${60 / 70 * 100}%" title="Empuje máximo ≈ 60 g"></span></div><b>+${m} g</b></div>`);
    });
    mb.insertAdjacentHTML('beforeend', T('<p class="ip-small ip-muted" style="margin:0">Línea roja: empuje disponible (≈ 60 g).</p>', '<p class="ip-small ip-muted" style="margin:0">Red line: available thrust (≈ 60 g).</p>'));

    // diagrama de arquitectura
    const svg = `
    <svg viewBox="0 0 1000 270" role="img" aria-label="Cascade control architecture">
      <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10z" fill="var(--axis)"/></marker></defs>
      <text class="lbl" x="18" y="128">θ<tspan dy="4" font-size="10">ref</tspan></text>
      <path class="wire" d="M48 124 H80" marker-end="url(#ar)"/>
      <g class="sum"><circle cx="95" cy="124" r="14"/><text x="90" y="128">Σ</text></g>
      <path class="wire w-att" d="M109 124 H140" marker-end="url(#ar)"/>
      <g class="blk b-att"><rect x="140" y="96" width="150" height="56"/><text x="215" y="121" text-anchor="middle">${T('PID actitud', 'Attitude PID')}</text><text class="sub s-att" x="215" y="140" text-anchor="middle">${T('periódico 500 Hz', 'periodic 500 Hz')}</text></g>
      <g class="blk b-ratt" opacity="0.25"><rect x="140" y="14" width="150" height="44"/><text x="215" y="41" text-anchor="middle">${T('Relé', 'Relay')} (d, δ)</text></g>
      <path class="wire w-ratt" d="M215 58 V96" opacity="0.25"/>
      <path class="wire" d="M290 124 H330" marker-end="url(#ar)"/><text class="lbl" x="296" y="114">ω<tspan dy="4" font-size="10">ref</tspan></text>
      <g class="sum"><circle cx="345" cy="124" r="14"/><text x="340" y="128">Σ</text></g>
      <path class="wire" d="M359 124 H390" marker-end="url(#ar)"/>
      <g class="blk b-rate"><rect x="390" y="96" width="150" height="56"/><text x="465" y="121" text-anchor="middle">${T('PID velocidad', 'Rate PID')}</text><text class="sub s-rate" x="465" y="140" text-anchor="middle">${T('periódico 500 Hz', 'periodic 500 Hz')}</text></g>
      <g class="blk b-rrate" opacity="0.25"><rect x="390" y="14" width="150" height="44"/><text x="465" y="41" text-anchor="middle">${T('Relé', 'Relay')} (d, δ)</text></g>
      <path class="wire w-rrate" d="M465 58 V96" opacity="0.25"/>
      <path class="wire" d="M540 124 H580" marker-end="url(#ar)"/><text class="lbl" x="548" y="114">τ</text>
      <g class="blk"><rect x="580" y="96" width="130" height="56"/><text x="645" y="121" text-anchor="middle">${T('Mezclador', 'Mixer')}</text><text class="sub" x="645" y="140" text-anchor="middle">${T('4 motores', '4 motors')}</text></g>
      <path class="wire" d="M710 124 H750" marker-end="url(#ar)"/>
      <g class="blk pri"><rect x="750" y="90" width="190" height="68"/><text x="845" y="119" text-anchor="middle">Crazyflie 2.1</text><text class="sub" x="845" y="139" text-anchor="middle">+ Open Gimbal</text></g>
      <path class="wire" d="M940 124 H975 V250 H95 V138" marker-end="url(#ar)"/><text class="lbl" x="955" y="200">θ</text>
      <path class="wire" d="M975 200 H345 V138" marker-end="url(#ar)"/><text class="lbl" x="600" y="194">ω (${T('giróscopo', 'gyroscope')})</text>
      <g class="blk"><rect x="760" y="186" width="170" height="30" rx="8"/><text x="845" y="206" text-anchor="middle" style="font-size:12.5px">${T('Estimador EKF', 'EKF estimator')}</text></g>
      <text class="lbl" x="52" y="244" style="font-size:12px">−</text><text class="lbl" x="352" y="160" style="font-size:12px">−</text>
    </svg>`;
    $('#archDiagram').innerHTML = svg;
    const texts = {
      std: T('Configuración estándar: el lazo de actitud genera consignas de velocidad angular y el de velocidad, órdenes de par. En el gimbal se desactivan el lazo de posición y el sistema de posicionamiento externo, y las consignas de cada nivel se inyectan desde ROS 2.', 'Standard configuration: the attitude loop generates angular-rate setpoints and the rate loop, torque commands. On the gimbal the position loop and the external positioning system are disabled, and the setpoints of each level are injected from ROS 2.'),
      rate: T('Ensayo del lazo de velocidad: un relé sustituye al PID de velocidad con referencia nula. La salida del relé se suma a la orden de equilibrio (transferencia sin saltos) y el PID congela su integral para no acumular error (<i>anti-windup</i> por limitación).', 'Rate-loop test: a relay replaces the rate PID with a zero setpoint. The relay output is added to the equilibrium command (bumpless transfer) and the PID freezes its integral to avoid accumulating error (clamping <i>anti-windup</i>).'),
      att: T('Ensayo del lazo de actitud: con el PID de velocidad ya sintonizado, el relé sustituye al de actitud y manda consignas de velocidad ±d alrededor del ángulo de operación. El proceso que ve el relé es el lazo de velocidad cerrado más un integrador.', 'Attitude-loop test: with the rate PID already tuned, the relay replaces the attitude PID and sends rate setpoints ±d around the operating angle. The process seen by the relay is the closed rate loop plus an integrator.'),
      ev: T('Control basado en eventos: cada PID sólo se recalcula cuando su error de entrada ha cambiado más que el umbral adaptativo; entre eventos se mantiene la última acción. Así se ahorra un 30,56 % de CPU.', 'Event-based control: each PID is only recomputed when its input error has changed by more than the adaptive threshold; between events the last action is held. This saves 30.56% of CPU.')
    };
    const setArch = (m) => {
      const d = $('#archDiagram');
      const on = (sel, v) => IP.$$(sel, d).forEach(e => e.setAttribute('opacity', v ? 1 : 0.25));
      on('.b-ratt, .w-ratt', m === 'att'); on('.b-rrate, .w-rrate', m === 'rate');
      $('.b-ratt', d).classList.toggle('hl', m === 'att'); $('.b-rrate', d).classList.toggle('hl', m === 'rate');
      $('.w-ratt', d).classList.toggle('hot', m === 'att'); $('.w-rrate', d).classList.toggle('hot', m === 'rate');
      $('.b-att', d).setAttribute('opacity', m === 'att' ? 0.35 : 1); $('.b-rate', d).setAttribute('opacity', m === 'rate' ? 0.35 : 1);
      $('.b-att', d).classList.toggle('hl', m === 'ev'); $('.b-rate', d).classList.toggle('hl', m === 'ev');
      $('.s-att', d).textContent = m === 'ev' ? T('por eventos', 'event-based') : T('periódico 500 Hz', 'periodic 500 Hz');
      $('.s-rate', d).textContent = m === 'ev' ? T('por eventos', 'event-based') : T('periódico 500 Hz', 'periodic 500 Hz');
      $('#archText').innerHTML = texts[m];
    };
    IP.seg($('#archSeg'), [{ value: 'std', label: T('Estándar', 'Standard') }, { value: 'rate', label: T('Relé en velocidad', 'Relay on rate') }, { value: 'att', label: T('Relé en actitud', 'Relay on attitude') }, { value: 'ev', label: T('Por eventos', 'Event-based') }], 'std', setArch);
    setArch('std');
  })();

  /* ------------------------------------------------------------
     3. Laboratorio del relé (simulación en tiempo real)
     ------------------------------------------------------------ */
  const IDENT = { cur: null, listeners: [] };
  const publishIdent = (v) => { IDENT.cur = v; IDENT.listeners.forEach(f => f(v)); };

  const lab = (function relayLab() {
    const S = { axis: 'roll', level: 'rate', relayOn: false, running: true };
    const DEF = {
      rate: { d: 10000, delta: 2, dMin: 1000, dMax: 20000, dStep: 500, hMin: 0.5, hMax: 10, hStep: 0.5, unitY: '°/s', unitU: 'cuentas', win: 3 },
      att: { d: 10, delta: 0.4, dMin: 1, dMax: 15, dStep: 0.5, hMin: 0.05, hMax: 2, hStep: 0.05, unitY: '°', unitU: '°/s', win: 6 }
    };
    let ctl, sim, plotY, plotU, gimbal;
    const buf = { t: [], y: [], yraw: [], u: [], sw: [] };

    function innerGains(axis) { return P.rateGains[axis][BEST_RATE[axis]]; }
    function buildControls() {
      const c = $('#labControls'); c.innerHTML = '';
      const D = DEF[S.level];
      const old = ctl ? ctl.values : {};
      ctl = IP.controls(c, [
        { id: 'd', label: T('Amplitud del relé', 'Relay amplitude'), sym: 'd', min: D.dMin, max: D.dMax, step: D.dStep, value: D.d, unit: D.unitU, digits: S.level === 'rate' ? 0 : 1 },
        { id: 'delta', label: T('Histéresis', 'Hysteresis'), sym: 'δ', min: D.hMin, max: D.hMax, step: D.hStep, value: D.delta, unit: D.unitY, digits: 2 },
        { id: 'op', label: T('Punto de operación', 'Operating point'), min: -35, max: 35, step: 5, value: old.op ?? 0, unit: '°', digits: 0, hint: T('Ángulo de equilibrio alrededor del que se ensaya (el artículo barre ±35° en pasos de 5°).', 'Equilibrium angle around which the test is run (the paper sweeps ±35° in 5° steps).') },
        { id: 'noise', type: 'toggle', label: T('Ruido de medida', 'Measurement noise'), value: old.noise ?? true },
        { id: 'filter', type: 'toggle', label: T('Filtro media móvil 0,2 s', '0.2 s moving-average filter'), value: old.filter ?? (S.axis === 'pitch' && S.level === 'rate') },
        { id: 'speed', type: 'select', label: T('Velocidad de simulación', 'Simulation speed'), value: old.speed ?? '1', options: [{ value: '1', label: T('Tiempo real (×1)', 'Real time (×1)') }, { value: '0.5', label: T('Cámara lenta (×0,5)', 'Slow motion (×0.5)') }, { value: '0.2', label: T('Muy lenta (×0,2)', 'Very slow (×0.2)') }] }
      ], (v, id) => {
        if (id === 'd' || id === 'delta') { if (sim.relay) { sim.relay.d = v.d; sim.relay.delta = v.delta; sim.meter.reset(); } updateNyquist(); }
        if (id === 'noise') sim.plant.noise = v.noise;
        if (id === 'filter') { sim.ma = new IP.sim.MovingAvg(Math.round((v.filter ? 0.2 : DT) / DT)); if (sim.meter) sim.meter.reset(); updateNyquist(); }
        if (id === 'op') { if (sim.meter) sim.meter.reset(); }
      });
    }
    function reset() {
      const ax = AX[S.axis];
      const plant = new R.Axis(ax, 17); plant.noise = ctl.values.noise;
      sim = {
        plant, t: 0, u: 0, wr: 0,
        rate: new R.Loop(S.level === 'rate' ? P.rateGains[S.axis].Default : innerGains(S.axis), R.UMAX),
        att: new R.Loop(P.attGains[S.axis].Default, R.RATE_MAX),
        ma: new IP.sim.MovingAvg(Math.round((ctl.values.filter ? 0.2 : DT) / DT)),
        relay: null, meter: null, uEq: 0, swMarks: []
      };
      // arranca ya en el punto de operación
      plant.th = ctl.values.op;
      for (const k in buf) buf[k].length = 0;
      setRelay(false);
      updateTitles(); updateNyquist();
    }
    function setRelay(on) {
      S.relayOn = on;
      if (on) {
        sim.relay = new R.Relay(ctl.values.d, ctl.values.delta);
        sim.meter = new R.CycleMeter();
        sim.uEq = S.level === 'rate' ? sim.rate.u : 0;   // transferencia sin saltos
        sim.wrEq = 0;
        sim.relayT0 = sim.t;
      } else {
        sim.relay = null;
      }
      $('#labRelayBtn').textContent = on ? T('Volver al PID (s = 0)', 'Back to PID (s = 0)') : T('Activar relé (s = 1)', 'Enable relay (s = 1)');
      $('#labRelayBtn').classList.toggle('accent', !on);
      $('#labMode').textContent = on ? T('Relé activo · s = 1', 'Relay active · s = 1') : T('PID activo · s = 0', 'PID active · s = 0');
      $('#labMode').className = 'ip-pill ' + (on ? 'accent' : 'muted');
    }
    function updateTitles() {
      const ax = AX[S.axis];
      $('#labYTitle').innerHTML = S.level === 'rate' ? T(`Velocidad angular de ${ax.name.toLowerCase()} (°/s)`, `${ax.name} angular rate (°/s)`) : T(`Ángulo de ${ax.name.toLowerCase()} ${ax.sym} (°)`, `${ax.name} angle ${ax.sym} (°)`);
      $('#labUTitle').innerHTML = S.level === 'rate' ? T('Orden de par al mezclador (cuentas)', 'Torque command to the mixer (counts)') : T('Consigna de velocidad al lazo interno (°/s)', 'Rate setpoint to the inner loop (°/s)');
      plotY.opts.yunit = DEF[S.level].unitY;
    }
    function stepSim() {
      const sm = sim, v = ctl.values;
      const m = sm.plant.step(sm.u); sm.t += DT;
      let y, sw = 0, uShow;
      if (S.level === 'rate') {
        y = sm.ma.push(m.w);
        if (sm.relay) {
          const r = sm.relay.step(0 - y); sw = r.sw; sm.u = sm.uEq + r.u; sm.meter.push(sm.t, y, sw);
          sm.rate.pid.i = sm.rate.pid.i; // integral congelada (clamping)
        } else {
          sm.wr = sm.att.step(v.op - m.th, sm.t).u;
          sm.u = sm.rate.step(sm.wr - m.w, sm.t).u;
        }
        uShow = sm.u;
        return { y, yraw: m.w, u: uShow, sw };
      }
      y = m.th;
      if (sm.relay) {
        const r = sm.relay.step(v.op - y); sw = r.sw; sm.wr = r.u; sm.meter.push(sm.t, y - v.op, sw);
      } else {
        sm.wr = sm.att.step(v.op - y, sm.t).u;
      }
      sm.u = sm.rate.step(sm.wr - m.w, sm.t).u;
      return { y, yraw: y, u: sm.wr, sw };
    }
    function frame(dt) {
      if (!S.running) { gimbal.render(0); return; }
      const v = ctl.values, n = Math.min(80, Math.round(dt * parseFloat(v.speed) / DT));
      for (let i = 0; i < n; i++) {
        const o = stepSim();
        if (i % 2 === 0 || o.sw) { buf.t.push(sim.t); buf.y.push(o.y); buf.yraw.push(o.yraw); buf.u.push(o.u); }
        if (o.sw) buf.sw.push({ t: sim.t, y: o.y });
      }
      const W = DEF[S.level].win, tEnd = Math.max(sim.t, W);
      while (buf.t.length && buf.t[0] < tEnd - W) { buf.t.shift(); buf.y.shift(); buf.yraw.shift(); buf.u.shift(); }
      while (buf.sw.length && buf.sw[0].t < tEnd - W) buf.sw.shift();
      const ref = S.level === 'rate' ? 0 : v.op;
      const series = [{ name: S.level === 'rate' ? T('ω medida', 'measured ω') : T('ángulo', 'angle'), color: '--s1', x: buf.t, y: buf.y, width: 2, unit: DEF[S.level].unitY }];
      if (S.level === 'rate' && v.filter) series.unshift({ name: T('sin filtrar', 'unfiltered'), color: '--s5', x: buf.t, y: buf.yraw, width: 1, alpha: 0.45, unit: '°/s' });
      plotY.opts.xlim = [tEnd - W, tEnd];
      plotY.overlays = {
        hlines: [{ y: ref, color: '--muted', dash: [4, 4], scale: true }],
        bands: sim.relay ? [{ y0: ref - v.delta, y1: ref + v.delta, color: '--accent-soft', alpha: 0.9 }] : [],
        markers: buf.sw.map(s => ({ x: s.t, y: s.y, color: '--s3', r: 3.5, scale: false }))
      };
      plotY.setSeries(series);
      plotU.opts.xlim = [tEnd - W, tEnd];
      plotU.setSeries([{ name: S.relayOn ? T('salida del relé', 'relay output') : T('salida del PID', 'PID output'), color: '--s2', x: buf.t, y: buf.u, step: true, width: 1.8, unit: DEF[S.level].unitU, digits: 1 }]);
      // gimbal
      const th = sim.plant.th;
      if (S.axis === 'roll') gimbal.setAngles(th, 0, 0).setLocks({ pitch: true, yaw: true, roll: false });
      else gimbal.setAngles(0, th, 0).setLocks({ roll: true, yaw: true, pitch: false });
      const tq = IP.clamp(sim.u / 20000, -0.42, 0.42);
      gimbal.setMotors(S.axis === 'roll' ? [0.5 + tq, 0.5 + tq, 0.5 - tq, 0.5 - tq] : [0.5 - tq, 0.5 + tq, 0.5 + tq, 0.5 - tq]);
      gimbal.render(dt);
      readouts();
    }
    let lastPublished = 0;
    function readouts() {
      const res = sim.meter ? sim.meter.result(3) : null;
      const v = ctl.values, uy = DEF[S.level].unitY;
      const box = $('#labReadouts');
      let id = null;
      if (res) id = R.identify({ a: res.a, Tu: res.Tu, Dmeas: res.Dmeas, d: v.d, delta: v.delta });
      const ok = res && res.n >= 3;
      const cells = [
        [T('Ciclos', 'Cycles'), res ? String(res.n) : '0', ok ? 'hl' : ''],
        [T('Amplitud a', 'Amplitude a'), res ? fmt(res.a, 2) + ' ' + uy : '—', ''],
        [T('Periodo Tu', 'Period Tu'), res ? fmt(res.Tu, 3) + ' s' : '—', ''],
        [T('Retardo D medido', 'Measured delay D'), res ? fmt(res.Dmeas, 3) + ' s' : '—', ''],
        ['Ku', id ? fmt(id.Ku, S.level === 'rate' ? 1 : 2) : '—', ok ? 'hl' : ''],
        ['ωu (rad/s)', id ? fmt(id.wu, 2) : '—', ''],
        [T('kp (integrador)', 'kp (integrator)'), id ? fmt(id.I.kp, 4) : '—', ok ? 'hl' : ''],
        ['D = Tu/4', id ? fmt(id.I.D, 3) + ' s' : '—', ok ? 'hl' : '']
      ];
      box.innerHTML = cells.map(([k, val, c]) => `<div class="ip-readout ${c}"><span>${k}</span><b>${val}</b></div>`).join('');
      const hint = $('#labHint');
      if (!S.relayOn) hint.innerHTML = T('El PID mantiene el dron en el punto de operación. Pulsa <b>Activar relé</b> para sustituirlo por el relé y provocar el ciclo límite.', 'The PID holds the drone at the operating point. Click <b>Enable relay</b> to replace it with the relay and trigger the limit cycle.');
      else if (!ok) hint.innerHTML = T(`Relé activo: esperando ciclos completos (${res ? res.n : 0}/3). El primero se descarta por ser transitorio.`, `Relay active: waiting for complete cycles (${res ? res.n : 0}/3). The first one is discarded as transient.`);
      else hint.innerHTML = T(`Ciclo límite establecido. Con estos datos el modelo integrador es <b>G(s) = ${fmt(id.I.kp, 4)}/s · e<sup>−${fmt(id.I.D, 3)}s</sup></b>. Baja a <a href="#modelo">Identificación</a> para validarlo.`, `Limit cycle established. With these data the integrator model is <b>G(s) = ${fmt(id.I.kp, 4)}/s · e<sup>−${fmt(id.I.D, 3)}s</sup></b>. Go down to <a href="#modelo">Identification</a> to validate it.`);
      if (ok && performance.now() - lastPublished > 400) {
        lastPublished = performance.now();
        publishIdent({ axis: S.axis, level: S.level, res, id, d: v.d, delta: v.delta, filter: v.filter });
        nyqMeasured(res, id);
      }
    }

    /* --- Nyquist --- */
    let nyq, nyqLast = null;
    function procFn() {
      const ax = AX[S.axis];
      if (S.level === 'rate') { const Tf = ctl.values.filter ? 0.2 : 0; return (w) => R.Grate(ax, w, Tf); }
      const g = innerGains(S.axis); return (w) => R.Gatt(ax, w, g);
    }
    function updateNyquist() {
      if (!nyq) return;
      const v = ctl.values, f = procFn();
      const curve = R.nyquist(f, 0.3, 400, 900);
      const pr = R.predictDF(curve, v.d, v.delta);
      const sc = S.level === 'rate' ? 1000 : 1;
      nyqLast = { pr, sc };
      const xs = curve.map(p => p.re * sc), ys = curve.map(p => p.im * sc);
      const lineIm = -Math.PI * v.delta / (4 * v.d) * sc;
      const aMax = pr ? pr.a * 3 : v.delta * 10;
      const lx = [], ly = [];
      for (let i = 0; i <= 60; i++) { const a = v.delta + (aMax - v.delta) * i / 60; lx.push(-Math.PI / (4 * v.d) * Math.sqrt(a * a - v.delta * v.delta) * sc); ly.push(lineIm); }
      let xlim = null, ylim = null;
      if (pr) {
        const cx = pr.re * sc, cy = pr.im * sc, Sx = 1.8 * Math.max(Math.abs(cx), Math.abs(cy), 1e-9);
        xlim = [cx - Sx, cx + Sx * 0.9]; ylim = [cy - Sx, cy + Sx * 0.9];
      }
      nyq.opts.xlim = xlim; nyq.opts.ylim = ylim;
      nyq.opts.xlabel = S.level === 'rate' ? 'Re G(jω) · 10⁻³' : 'Re G(jω)';
      nyq.opts.ylabel = S.level === 'rate' ? 'Im G(jω) · 10⁻³' : 'Im G(jω)';
      nyq.overlays = { markers: pr ? [{ x: pr.re * sc, y: pr.im * sc, color: '--accent', shape: 'diamond', r: 7, label: T('predicción', 'prediction') }] : [] };
      nyq._base = [
        { name: 'G(jω)', color: '--s1', x: xs, y: ys, width: 2.4, notip: true },
        { name: '−1/N(a)', color: '--s2', x: lx, y: ly, width: 2.4, dash: [7, 5], notip: true }
      ];
      nyq.setSeries(nyq._base);
      nyqReadouts(null, null);
    }
    function nyqMeasured(res, id) {
      if (!nyq || !nyqLast) return;
      const v = ctl.values, sc = nyqLast.sc;
      const mx = -Math.PI / (4 * v.d) * Math.sqrt(Math.max(res.a ** 2 - v.delta ** 2, 0)) * sc, my = -Math.PI * v.delta / (4 * v.d) * sc;
      const mk = nyq.overlays.markers.filter(m => m.shape === 'diamond');
      mk.push({ x: mx, y: my, color: '--s3', r: 6, label: T('medida', 'measured'), align: 'right' });
      nyq.overlays.markers = mk; nyq.draw();
      nyqReadouts(res, id);
    }
    function nyqReadouts(res, id) {
      const pr = nyqLast && nyqLast.pr, uy = DEF[S.level].unitY;
      const err = (a, b) => (a && b) ? fmt(100 * (b - a) / a, 1) + ' %' : '—';
      $('#nyqReadouts').innerHTML = [
        [T('a predicha (FD)', 'predicted a (DF)'), pr ? fmt(pr.a, 2) + ' ' + uy : T('sin corte', 'no crossing')],
        [T('a medida', 'measured a'), res ? fmt(res.a, 2) + ' ' + uy : '—'],
        [T('error en a', 'error in a'), res && pr ? err(pr.a, res.a) : '—'],
        [T('Tu predicho', 'predicted Tu'), pr ? fmt(pr.Tu, 3) + ' s' : '—'],
        [T('Tu medido', 'measured Tu'), res ? fmt(res.Tu, 3) + ' s' : '—'],
        [T('error en Tu', 'error in Tu'), res && pr ? err(pr.Tu, res.Tu) : '—']
      ].map(([k, v]) => `<div class="ip-readout"><span>${k}</span><b>${v}</b></div>`).join('') +
        T(`<p class="ip-small ip-muted" style="grid-column:1/-1;margin:4px 0 0">La función descriptiva sólo considera el primer armónico y la simulación incluye ruido, así que la predicción es aproximada: diferencias del orden del 5–10 % son normales.</p>`, `<p class="ip-small ip-muted" style="grid-column:1/-1;margin:4px 0 0">The describing function only considers the first harmonic and the simulation includes noise, so the prediction is approximate: differences of 5–10% are normal.</p>`);
    }

    function init() {
      plotY = new IP.Plot($('#labPlotY'), { height: 210, xname: 't', xunit: 's', xdigits: 2, legend: true, yMinSpan: 1 });
      plotU = new IP.Plot($('#labPlotU'), { height: 130, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's', xdigits: 2, legend: false });
      nyq = new IP.Plot($('#nyqPlot'), { height: 330, equal: true, tooltip: false, legend: true });
      gimbal = new Gimbal3D($('#labGimbal'), { az: -60, el: 16, dist: 6.6, compact: true });
      const axSeg = IP.seg($('#labAxis'), [{ value: 'roll', label: 'Roll' }, { value: 'pitch', label: 'Pitch' }], S.axis, (v) => { S.axis = v; buildControls(); reset(); });
      const lvSeg = IP.seg($('#labLevel'), [{ value: 'rate', label: T('Lazo de velocidad', 'Rate loop') }, { value: 'att', label: T('Lazo de actitud', 'Attitude loop') }], S.level, (v) => { S.level = v; buildControls(); reset(); });
      buildControls(); reset();
      $('#labRelayBtn').addEventListener('click', () => setRelay(!S.relayOn));
      $('#labReset').addEventListener('click', () => reset());
      $('#labPlay').addEventListener('click', () => {
        S.running = !S.running;
        $('#labPlay').innerHTML = `<span class="live-dot"></span>${S.running ? 'Pausar' : 'Continuar'}`;
        $('#relayLab').classList.toggle('paused', !S.running);
      });
      $('#labPreset').addEventListener('change', (e) => {
        const k = e.target.value; if (!k) return;
        const pt = P.relayTests[k];
        S.axis = k.startsWith('roll') ? 'roll' : 'pitch'; S.level = k.endsWith('Rate') ? 'rate' : 'att';
        axSeg.set(S.axis); lvSeg.set(S.level);
        buildControls();
        ctl.set('d', pt.d, true); ctl.set('delta', pt.delta, true);
        ctl.set('filter', k === 'pitchRate', true);
        reset(); setRelay(true);
        const uy = DEF[S.level].unitY;
        $('#labHint').innerHTML += '';
        setTimeout(() => {
          $('#labHint').insertAdjacentHTML('beforeend', T(`<br><b>Artículo:</b> a = ${fmt(pt.a, 2)} ${uy}, T<sub>u</sub> = ${fmt(pt.Tu, 3)} s.`, `<br><b>Paper:</b> a = ${fmt(pt.a, 2)} ${uy}, T<sub>u</sub> = ${fmt(pt.Tu, 3)} s.`));
        }, 50);
        e.target.value = '';
      });
      IP.animate($('#relayLab'), frame).start();
    }
    return { init, state: S };
  })();
  lab.init();

  /* ------------------------------------------------------------
     4. Identificación: tabla, validación y barrido paramétrico
     ------------------------------------------------------------ */
  (function model() {
    const plot = new IP.Plot($('#idPlot'), { height: 230, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
    function render(I) {
      if (!I) return;
      const { axis, level, id, res } = I, ax = AX[axis];
      $('#idSource').textContent = `${ax.name} · ${level === 'rate' ? 'velocidad' : 'actitud'} · d = ${fmt(I.d, level === 'rate' ? 0 : 1)}, δ = ${fmt(I.delta, 2)}`;
      $('#idSource').className = 'ip-pill';
      const pm = level === 'rate' ? P.rateModels[axis] : null;
      const pa = level === 'att' ? P.attModels[axis].relay : null;
      const F = id.F;
      const rows = [
        ['K<sub>u</sub>', fmt(id.Ku, level === 'rate' ? 1 : 3), '—'],
        ['ω<sub>u</sub> (rad/s)', fmt(id.wu, 2), '—'],
        [T('<b>Integrador</b> k<sub>p</sub>', '<b>Integrator</b> k<sub>p</sub>'), fmt(id.I.kp, 4), pm ? fmt(pm.I.kp, 4) : fmt(pa.kp, 2)],
        [T('<b>Integrador</b> D (s)', '<b>Integrator</b> D (s)'), fmt(id.I.D, 3), pm ? fmt(pm.I.D, 3) : fmt(pa.D, 3)],
        [T('D medido (s)', 'Measured D (s)'), fmt(res.Dmeas, 3), '—'],
        [T('<b>1er orden</b> τ (s)', '<b>1st order</b> τ (s)'), `<span class="${F.valid ? '' : 'bad'}">${fmt(F.tau, 3)}</span>`, pm ? `<span class="bad">${fmt(pm.F.tau, 4)}</span>` : '—'],
        [T('<b>1er orden</b> k<sub>p</sub>', '<b>1st order</b> k<sub>p</sub>'), `<span class="${F.valid ? '' : 'bad'}">${fmt(F.kp, 4)}</span>`, pm ? `<span class="bad">${fmt(pm.F.kp, 4)}</span>` : '—']
      ];
      $('#idTable').innerHTML = T(`<thead><tr><th>Parámetro</th><th>Tu ensayo (simulado)</th><th>Artículo (Tabla ${level === 'rate' ? 2 : 4})</th></tr></thead><tbody>`, `<thead><tr><th>Parameter</th><th>Your test (simulated)</th><th>Paper (Table ${level === 'rate' ? 2 : 4})</th></tr></thead><tbody>`) +
        rows.map(r => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td></tr>`).join('') + '</tbody>';
      $('#fopdtWhy').classList.toggle('danger', !F.valid); $('#fopdtWhy').classList.toggle('ok', F.valid);

      // validación: escalón en la entrada del proceso que ve el relé
      const TT = Math.max(0.6, res.Tu * 2.2), N = Math.round(TT / DT);
      const u0 = level === 'rate' ? 1000 : 10;
      const plant = new R.Axis(ax, 3); plant.noise = false;
      const inner = new R.Loop(P.rateGains[axis][BEST_RATE[axis]], R.UMAX);
      const t = [], yr = [], yI = [], yF = [];
      for (let k = 0; k < N; k++) {
        const tt = k * DT;
        let m;
        if (level === 'rate') m = plant.step(u0);
        else { const w = plant.w; m = plant.step(inner.step(u0 - w, tt).u); }
        if (k % 2) continue;
        t.push(tt); yr.push(level === 'rate' ? plant.w : plant.th);
        yI.push(id.I.kp * u0 * Math.max(0, tt - id.I.D));
        yF.push(F.valid ? F.kp * u0 * (tt > F.D ? 1 - Math.exp(-(tt - F.D) / F.tau) : 0) : NaN);
      }
      const unit = level === 'rate' ? '°/s' : '°';
      const ser = [
        { name: T('proceso (simulado)', 'process (simulated)'), color: '--s1', x: t, y: yr, width: 2.6, unit },
        { name: T('modelo integrador', 'integrator model'), color: '--s2', x: t, y: yI, width: 2, dash: [6, 4], unit }
      ];
      if (F.valid) ser.push({ name: T('modelo 1er orden', '1st-order model'), color: '--s3', x: t, y: yF, width: 2, dash: [2, 3], unit });
      plot.opts.ylabel = level === 'rate' ? T(`ω (°/s) para u = ${u0}`, `ω (°/s) for u = ${u0}`) : T(`θ (°) para ω_ref = ${u0} °/s`, `θ (°) for ω_ref = ${u0} °/s`);
      plot.setSeries(ser);
    }
    // ¿por qué falla el primer orden? τ·ωu = tan(π − Dωu)
    const tp = new IP.Plot($('#tauPlot'), { height: 170, xlabel: 'D·ωu (rad)', xname: 'Dωu', ylim: [-6, 6], xlim: [0.2, 3.0] });
    function tauPlot(x) {
      const xs = [], ys = [];
      for (let k = 0; k <= 300; k++) { const xx = 0.2 + 2.8 * k / 300; const yy = Math.tan(Math.PI - xx); xs.push(xx); ys.push(Math.abs(yy) > 8 ? NaN : yy); }
      tp.overlays = {
        bands: [{ x0: 0.2, x1: Math.PI / 2, color: '--danger-soft', alpha: 0.8 }],
        vlines: [{ x: Math.PI / 2, color: '--danger', label: 'π/2' }],
        texts: [{ x: 0.3, y: 4.8, text: T('τ < 0: el 1er orden falla', 'τ < 0: first order fails'), color: '--danger' }, { x: 1.7, y: 4.8, text: T('τ > 0 válido', 'τ > 0 valid'), color: '--ok' }],
        markers: Number.isFinite(x) ? [{ x: IP.clamp(x, 0.2, 3), y: IP.clamp(Math.tan(Math.PI - x), -5.8, 5.8), color: '--accent', r: 6, label: T('tu ensayo', 'your test') }] : []
      };
      tp.setSeries([{ name: 'τ·ωu', color: '--s3', x: xs, y: ys, width: 2.2, notip: true }]);
    }
    tauPlot(NaN);
    IDENT.listeners.push((I) => tauPlot(I.res.Dmeas * I.id.wu));
    IDENT.listeners.push(render);
    $('#idTable').innerHTML = T('<tbody><tr><td class="ip-muted">Activa el relé en el laboratorio de arriba: cuando haya tres ciclos completos aparecerá aquí el modelo identificado.</td></tr></tbody>', '<tbody><tr><td class="ip-muted">Enable the relay in the lab above: once there are three complete cycles, the identified model will appear here.</td></tr></tbody>');

    // barrido paramétrico
    const heat = $('#sweepHeat'), hc = $('canvas', heat), tip = $('.ip-plot-tip', heat);
    let data = null;
    function runSweep() {
      const st = lab.state, axis = st.axis, level = st.level, ax = AX[axis];
      const ds = level === 'rate' ? [2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const hs = level === 'rate' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0.1, 0.25, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
      const filter = axis === 'pitch' && level === 'rate';
      const out = []; let i = 0;
      const btn = $('#sweepBtn'); btn.disabled = true;
      const inner = P.rateGains[axis][BEST_RATE[axis]];
      const one = (d, h) => {
        const plant = new R.Axis(ax, 100 + i); plant.noise = true;
        const relay = new R.Relay(d, h), meter = new R.CycleMeter(), ma = new IP.sim.MovingAvg(filter ? 100 : 1);
        const loop = new R.Loop(inner, R.UMAX);
        let u = 0; const TT = level === 'rate' ? 2.4 : 7;
        for (let k = 0; k < TT / DT; k++) {
          const t = k * DT, m = plant.step(u);
          if (level === 'rate') { const y = ma.push(m.w); const r = relay.step(-y); u = r.u; meter.push(t, y, r.sw); }
          else { const r = relay.step(-m.th); meter.push(t, m.th, r.sw); u = loop.step(r.u - m.w, t).u; }
        }
        const res = meter.result(3);
        if (!res || res.n < 3) return { kp: NaN, D: NaN };
        const id = R.identify({ a: res.a, Tu: res.Tu, Dmeas: res.Dmeas, d, delta: h });
        return { kp: id.I.kp, D: id.I.D, n: res.n };
      };
      const cells = []; ds.forEach(d => hs.forEach(h => cells.push([d, h])));
      const chunk = () => {
        const end = Math.min(cells.length, i + 8);
        for (; i < end; i++) { const [d, h] = cells[i]; out.push(Object.assign({ d, h }, one(d, h))); }
        btn.textContent = T(`Ensayando… ${i}/${cells.length}`, `Testing… ${i}/${cells.length}`);
        if (i < cells.length) setTimeout(chunk, 0);
        else {
          btn.disabled = false; btn.textContent = T('Repetir 110 ensayos', 'Repeat 110 tests');
          data = { ds, hs, out, axis, level }; drawHeat();
          const vals = out.map(o => o.kp).filter(Number.isFinite);
          const real = level === 'rate' ? ax.kp : null;
          $('#sweepNote').innerHTML = T(`${ax.name}, ${level === 'rate' ? 'velocidad' : 'actitud'}: ${vals.length}/110 ensayos válidos. `, `${ax.name}, ${level === 'rate' ? 'rate' : 'attitude'}: ${vals.length}/110 valid tests. `) +
            (real ? T(`La ganancia real de la planta simulada es k<sub>p</sub> = ${fmt(real, 4)}; el recuadro discontinuo marca el rango fiable que encontró el artículo (d ∈ [4000, 14000], δ ∈ [1, 4] °/s).`, `The true gain of the simulated plant is k<sub>p</sub> = ${fmt(real, 4)}; the dashed box marks the reliable range found in the paper (d ∈ [4000, 14000], δ ∈ [1, 4] °/s).`) : T('El recuadro marca el rango recomendado por el artículo para actitud (δ < 0,4°, 2,5° < d < 4,5°).', 'The box marks the range recommended by the paper for attitude (δ < 0.4°, 2.5° < d < 4.5°).'));
        }
      };
      chunk();
    }
    function color(t) {
      const a = [235, 245, 239], b = [20, 92, 67], c = [217, 120, 46];
      const dark = getComputedStyle(document.documentElement).colorScheme === 'dark';
      const lo = dark ? [24, 58, 43] : a, mid = dark ? [79, 185, 138] : b;
      const mix = (p, q, s) => p.map((v, k) => Math.round(v + (q[k] - v) * s));
      return t < 0.75 ? mix(lo, mid, t / 0.75) : mix(mid, c, (t - 0.75) / 0.25);
    }
    function drawHeat() {
      if (!data) return;
      const W = heat.clientWidth, H = 280, dpr = Math.min(window.devicePixelRatio || 1, 2);
      hc.width = W * dpr; hc.height = H * dpr; const ctx = hc.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const key = $('#sweepVar').value, { ds, hs, out, level } = data;
      const ml = 64, mb = 42, mt = 10, mr = 70, pw = W - ml - mr, ph = H - mt - mb;
      const vals = out.map(o => o[key]).filter(Number.isFinite).sort((a, b) => a - b);
      const q = (p) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))];
      const lo = q(0.05), hi = q(0.95);          // escala robusta: los valores extremos se saturan
      const cw = pw / ds.length, chh = ph / hs.length;
      const font = IP.css('--font'), muted = IP.css('--muted');
      out.forEach(o => {
        const i = ds.indexOf(o.d), j = hs.indexOf(o.h), v = o[key];
        ctx.fillStyle = Number.isFinite(v) ? `rgb(${color(IP.clamp((v - lo) / ((hi - lo) || 1), 0, 1)).join(',')})` : IP.css('--surface-2');
        ctx.fillRect(ml + i * cw + 1, mt + (hs.length - 1 - j) * chh + 1, cw - 2, chh - 2);
        if (!Number.isFinite(v)) { ctx.fillStyle = muted; ctx.font = `10px ${font}`; ctx.textAlign = 'center'; ctx.fillText('×', ml + (i + 0.5) * cw, mt + (hs.length - 0.5 - j) * chh + 3); }
      });
      ctx.fillStyle = muted; ctx.font = `11px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ds.forEach((d, i) => { if (cw > 34 || i % 2 === 0) ctx.fillText(level === 'rate' ? (d / 1000) + 'k' : d, ml + (i + 0.5) * cw, mt + ph + 5); });
      ctx.fillText(level === 'rate' ? T('amplitud del relé d (cuentas)', 'relay amplitude d (counts)') : T('amplitud del relé d (°/s)', 'relay amplitude d (°/s)'), ml + pw / 2, H - 15);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      hs.forEach((h, j) => ctx.fillText(String(h).replace('.', ','), ml - 6, mt + (hs.length - 0.5 - j) * chh));
      ctx.save(); ctx.translate(12, mt + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(level === 'rate' ? T('histéresis δ (°/s)', 'hysteresis δ (°/s)') : T('histéresis δ (°)', 'hysteresis δ (°)'), 0, 0); ctx.restore();
      // rango fiable del artículo
      const box = level === 'rate' ? { d0: 4000, d1: 14000, h0: 1, h1: 4 } : { d0: 2.5, d1: 4.5, h0: 0, h1: 0.4 };
      const xi = (d) => { let k = 0; while (k < ds.length - 1 && ds[k + 1] <= d) k++; return k + (d - ds[k]) / ((ds[k + 1] || ds[k] + 1) - ds[k]); };
      const yj = (h) => { let k = 0; while (k < hs.length - 1 && hs[k + 1] <= h) k++; return k + (h - hs[k]) / ((hs[k + 1] || hs[k] + 1) - hs[k]); };
      const x0 = ml + (xi(box.d0)) * cw, x1 = ml + (xi(box.d1) + 1) * cw;
      const y1 = mt + (hs.length - 1 - Math.max(0, yj(box.h1))) * chh, y0 = mt + (hs.length - Math.max(0, yj(box.h0))) * chh;
      ctx.strokeStyle = IP.css('--accent'); ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(x0, Math.min(y0, y1), x1 - x0, Math.abs(y0 - y1)); ctx.setLineDash([]);
      // escala de color
      for (let k = 0; k < ph; k++) { ctx.fillStyle = `rgb(${color(1 - k / ph).join(',')})`; ctx.fillRect(W - mr + 16, mt + k, 14, 1); }
      ctx.fillStyle = muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('≥' + fmt(hi, key === 'kp' ? 4 : 3), W - mr + 34, mt);
      ctx.textBaseline = 'bottom'; ctx.fillText('≤' + fmt(lo, key === 'kp' ? 4 : 3), W - mr + 34, mt + ph);
      heat._geo = { ml, mt, cw, chh, ds, hs, out, key };
    }
    hc.addEventListener('mousemove', (e) => {
      const g = heat._geo; if (!g) return;
      const r = hc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const i = Math.floor((x - g.ml) / g.cw), j = g.hs.length - 1 - Math.floor((y - g.mt) / g.chh);
      const o = g.out.find(q => q.d === g.ds[i] && q.h === g.hs[j]);
      if (!o) { tip.style.opacity = 0; return; }
      tip.innerHTML = `d = ${fmt(o.d, 1)} · δ = ${fmt(o.h, 2)}<br>${g.key === 'kp' ? 'k<sub>p</sub>' : 'D'} = <b>${Number.isFinite(o[g.key]) ? fmt(o[g.key], 4) : 'sin ciclo límite'}</b>`;
      tip.style.opacity = 1; tip.style.left = Math.min(x + 12, r.width - 170) + 'px'; tip.style.top = Math.max(0, y - 40) + 'px';
    });
    hc.addEventListener('mouseleave', () => (tip.style.opacity = 0));
    $('#sweepBtn').addEventListener('click', runSweep);
    $('#sweepVar').addEventListener('change', drawHeat);
    new ResizeObserver(IP.debounce(drawHeat, 60)).observe(heat);
    IP.onTheme(drawHeat);
    // estado inicial vacío
    (function placeholder() {
      const W = heat.clientWidth || 600, ctx = hc.getContext('2d');
      hc.width = W; hc.height = 280; ctx.fillStyle = IP.css('--muted'); ctx.font = `13px ${IP.css('--font')}`; ctx.textAlign = 'center';
      ctx.fillText(T('Pulsa «Ejecutar 110 ensayos» (usa el eje y el lazo elegidos en el laboratorio)', 'Click "Run 110 tests" (it uses the axis and loop chosen in the lab)'), W / 2, 140);
    })();
  })();

  /* ------------------------------------------------------------
     5. Sintonía: comparación y experimento completo
     ------------------------------------------------------------ */
  (function tuning() {
    const plot = new IP.Plot($('#tunePlot'), { height: 300, xlabel: T('tiempo (s)', 'time (s)'), ylabel: T('ángulo (°)', 'angle (°)'), xname: 't', xunit: 's' });
    const ctl = IP.controls($('#tuneControls'), [
      { id: 'axis', type: 'select', label: T('Eje', 'Axis'), value: 'pitch', options: [{ value: 'pitch', label: T('Pitch (más inercia)', 'Pitch (more inertia)') }, { value: 'roll', label: 'Roll' }] },
      { id: 'ref', type: 'select', label: T('Controlador de referencia', 'Reference controller'), value: 'manual', options: [{ value: 'manual', label: T('De fábrica + P manual (artículo)', 'Factory + manual P (paper)') }, { value: 'firmware', label: T('Valores de serie del firmware (6 / 3 / 0)', 'Firmware defaults (6 / 3 / 0)') }] },
      { id: 'src', type: 'select', label: T('Ganancias autosintonizadas', 'Autotuned gains'), value: 'paper', options: [{ value: 'paper', label: T('Las del artículo (Tablas 3 y 5)', 'Those of the paper (Tables 3 and 5)') }, { value: 'mine', label: T('Recalculadas con las reglas sobre los modelos del artículo', 'Recomputed with the rules on the paper\'s models') }] },
      { id: 'tcf', label: T('τc de SIMC (× valor del artículo)', 'SIMC τc (× paper value)'), min: 0.5, max: 3, step: 0.1, value: 1, digits: 1, hint: T('Sólo afecta a SIMC con «recalculadas». Más τc → respuesta más lenta y amortiguada.', 'Only affects SIMC with "recomputed". Larger τc → slower, more damped response.') },
      { id: 'noise', type: 'toggle', label: T('Ruido de medida', 'Measurement noise'), value: true }
    ], IP.debounce(run, 30));
    function gains(axis, rule, src, tcf) {
      if (src === 'paper') return { rate: P.rateGains[axis][rule], att: P.attGains[axis][rule] };
      const mr = P.rateModels[axis].I, ma = P.attModels[axis].relay;
      const gr = R.tune(rule, mr, 'I', P.tauc.rate[axis] * tcf), ga = R.tune(rule, ma, 'I', P.tauc.att[axis] * tcf);
      return { rate: [gr.Kp, gr.Ki, gr.Kd], att: [ga.Kp, ga.Ki, ga.Kd] };
    }
    function run() {
      const v = ctl.values, axis = v.axis;
      const refG = { rate: P.rateGains[axis].Default, att: v.ref === 'manual' ? P.attGains[axis].Default : [6, 3, 0] };
      const cfg = [
        { name: v.ref === 'manual' ? T('Referencia (manual)', 'Reference (manual)') : T('Firmware de serie', 'Firmware defaults'), g: refG, color: '--s5' },
        { name: 'AMIGO PI', g: gains(axis, 'AMIGO PI', v.src, v.tcf), color: '--s3' },
        { name: 'AMIGO PID', g: gains(axis, 'AMIGO PID', v.src, v.tcf), color: '--s2' },
        { name: 'SIMC', g: gains(axis, 'SIMC', v.src, v.tcf), color: '--s1' }
      ];
      const res = cfg.map(c => Object.assign({}, c, { r: R.stepResponse({ axis, rate: c.g.rate, att: c.g.att, step: 10, T: 5, noise: v.noise }) }));
      const ser = res.map(c => ({ name: c.name, color: c.color, x: c.r.t, y: c.r.th, width: c.name.startsWith('Ref') || c.name.startsWith('Firm') ? 2 : 2.2, dash: c.name.startsWith('Ref') || c.name.startsWith('Firm') ? [5, 4] : [], unit: '°' }));
      ser.push({ name: T('consigna', 'setpoint'), color: '--muted', x: res[0].r.t, y: res[0].r.ref, width: 1.2, step: true, nolegend: true, notip: true });
      const unstable = res[0].r.metrics.unstable;
      plot.opts.ylim = unstable ? [-5, 30] : null;
      plot.setSeries(ser);
      const m0 = res[0].r.metrics;
      const J = (m) => {
        if (m0.unstable || m.unstable) return [NaN, NaN];
        const d = (a, b) => b > 0 ? a / b : 1;
        const J1 = 0.35 * d(m.iae, m0.iae) + 0.35 * d(m.itae, m0.itae) + 0.30 * d(m.events, m0.events);
        const J2 = 0.3 * J1 + 0.3 * d(m.tr, m0.tr) + 0.3 * d(m.ts || 0.001, m0.ts || 0.001) + 0.1 * d(m.os + 1, m0.os + 1);
        return [J1, J2];
      };
      const rows = res.map(c => { const m = c.r.metrics; const [j1, j2] = J(m); return { c, m, j1, j2 }; });
      const best = rows.slice(1).filter(r => Number.isFinite(r.j2)).sort((a, b) => a.j2 - b.j2)[0];
      const g3 = (g) => g.map(x => fmt(x, x >= 100 ? 0 : x >= 10 ? 1 : 2)).join(' / ');
      $('#tuneTable').innerHTML = T(`<thead><tr><th>Controlador</th><th>Velocidad Kp/Ki/Kd</th><th>Actitud Kp/Ki/Kd</th><th>t<sub>r</sub> (s)</th><th>t<sub>s</sub> (s)</th><th>O (%)</th><th>IAE</th><th>J<sub>1</sub></th><th>J<sub>2</sub></th></tr></thead><tbody>`, `<thead><tr><th>Controller</th><th>Rate Kp/Ki/Kd</th><th>Attitude Kp/Ki/Kd</th><th>t<sub>r</sub> (s)</th><th>t<sub>s</sub> (s)</th><th>O (%)</th><th>IAE</th><th>J<sub>1</sub></th><th>J<sub>2</sub></th></tr></thead><tbody>`) +
        rows.map(r => `<tr class="${r === best ? 'best' : ''}"><td>${r.c.name}</td><td class="num">${g3(r.c.g.rate)}</td><td class="num">${g3(r.c.g.att)}</td>` +
          (r.m.unstable ? T(`<td colspan="6" class="bad">inestable</td>`, `<td colspan="6" class="bad">unstable</td>`) :
            `<td class="num">${fmt(r.m.tr, 3)}</td><td class="num">${fmt(r.m.ts, 2)}</td><td class="num">${fmt(r.m.os, 1)}</td><td class="num">${fmt(r.m.iae, 2)}</td><td class="num">${fmt(r.j1, 2)}</td><td class="num">${fmt(r.j2, 2)}</td>`) + '</tr>').join('') + '</tbody>';
      const b = $('#tuneBadge');
      if (unstable) { b.textContent = T('La referencia es inestable', 'The reference is unstable'); b.className = 'ip-pill danger'; }
      else if (best) { const imp = 100 * (1 - best.m.tr / m0.tr); b.textContent = `${best.c.name}: t_r ${imp >= 0 ? '−' : '+'}${fmt(Math.abs(imp), 0)} %`; b.className = 'ip-pill'; }
    }
    run();

    /* ---- experimento completo (Fig. 24) ---- */
    const pplot = new IP.Plot($('#pipePlot'), { height: 300, xlabel: T('tiempo (s)', 'time (s)'), ylabel: T('ángulo (°)', 'angle (°)'), xname: 't', xunit: 's' });
    const pg = new Gimbal3D($('#pipeGimbal'), { az: -60, el: 16, dist: 6.6, compact: true });
    let paxis = 'roll', play = null;
    IP.seg($('#pipeAxis'), [{ value: 'roll', label: 'Roll' }, { value: 'pitch', label: 'Pitch' }], paxis, (v) => { paxis = v; $('#pipeRule').value = v === 'roll' ? 'AMIGO PID' : 'SIMC'; });
    const zoneCol = ['#7f8c8d', '#f0a35f', '#e6c34a', '#4fb98a'];
    const zoneName = [T('Sintonía inicial', 'Initial tuning'), T('Relé en velocidad', 'Relay on rate'), T('Relé en actitud', 'Relay on attitude'), T('Autosintonizado', 'Autotuned')];
    function runPipe() {
      const rule = $('#pipeRule').value, axis = paxis;
      const rt = axis === 'roll' ? P.relayTests.rollRate : P.relayTests.pitchRate;
      const E = R.autotuneExperiment({
        axis, rule, step: 10, seed: 23,
        rate0: P.rateGains[axis].Default, att0: P.attGains[axis].Default,
        rateRelay: { d: rt.d, delta: axis === 'roll' ? 2 : 4 }, attRelay: { d: 10, delta: 0.4 },
        filter: false, taucRate: P.tauc.rate[axis], taucAtt: P.tauc.att[axis],
        rateRelayTime: axis === 'roll' ? 1.4 : 2.2, attRelayTime: axis === 'roll' ? 3.5 : 5.5
      });
      const z = E.zones, tr = E.tr, N = tr.t.length;
      const bands = [0, 1, 2, 3].map(k => ({ x0: z[k], x1: z[k + 1], color: zoneCol[k], alpha: 0.13 }));
      pplot.opts.xlim = [0, z[4]];
      const lo = Math.min(...tr.th), hi = Math.max(...tr.th);
      pplot.opts.ylim = [Math.min(-3, lo - 1), Math.max(13, hi + 1)];
      const steps = IP.$$('.ip-step', $('#pipeSteps'));
      steps.forEach(s => s.classList.remove('is-done', 'is-running'));
      $('#pipeReadouts').innerHTML = '';
      $('#pipeRun').disabled = true;
      let k = 0;
      const speed = N / 9;          // ≈ 9 s de animación
      if (play) play.stop();
      play = IP.animate($('#pipeline'), (dt) => {
        k = Math.min(N, k + Math.max(1, Math.round(speed * dt)));
        const zi = tr.zone[k - 1] - 1;
        steps.forEach((s, i) => { s.classList.toggle('is-done', i < zi || k >= N); s.classList.toggle('is-running', i === zi && k < N); });
        $('#pipeZone').textContent = zoneName[zi]; $('#pipeZone').style.background = zoneCol[zi] + '33'; $('#pipeZone').style.color = 'var(--text)';
        pplot.overlays = { bands };
        pplot.setSeries([
          { name: T('ángulo', 'angle'), color: '--s1', x: tr.t.slice(0, k), y: tr.th.slice(0, k), width: 2.2, unit: '°' },
          { name: T('consigna', 'setpoint'), color: '--muted', x: tr.t.slice(0, k), y: tr.ref.slice(0, k), width: 1.2, dash: [4, 4], step: true, unit: '°' }
        ]);
        const th = tr.th[k - 1];
        if (axis === 'roll') pg.setAngles(th, 0, 0).setLocks({ pitch: true, yaw: true, roll: false }); else pg.setAngles(0, th, 0).setLocks({ roll: true, yaw: true, pitch: false });
        const tq = IP.clamp(tr.u[k - 1] / 20000, -0.42, 0.42);
        pg.setMotors(axis === 'roll' ? [0.5 + tq, 0.5 + tq, 0.5 - tq, 0.5 - tq] : [0.5 - tq, 0.5 + tq, 0.5 + tq, 0.5 - tq]).render(dt);
        if (k >= N) { play.stop(); $('#pipeRun').disabled = false; $('#pipeZone').textContent = T('Terminado', 'Finished'); pipeResults(E, rule, axis); }
      });
      play.start();
    }
    function pipeResults(E, rule, axis) {
      const c = (k, v, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${v}</b></div>`;
      const b = E.before, a = E.after;
      const imp = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x > 0 ? `${fmt(100 * (1 - y / x), 0)} %` : '—';
      $('#pipeReadouts').innerHTML =
        c(T('Modelo velocidad', 'Rate model'), E.idR ? `${fmt(E.idR.I.kp, 4)}/s · D=${fmt(E.idR.I.D, 3)}` : T('sin ciclo', 'no cycle')) +
        c(T(`PID velocidad (${rule})`, `Rate PID (${rule})`), E.gR ? `${fmt(E.gR.Kp, 0)} / ${fmt(E.gR.Ki, 0)} / ${fmt(E.gR.Kd, 1)}` : '—') +
        c(T('Modelo actitud', 'Attitude model'), E.idA ? `${fmt(E.idA.I.kp, 2)}/s · D=${fmt(E.idA.I.D, 3)}` : T('sin ciclo', 'no cycle')) +
        c(T(`PID actitud (${rule})`, `Attitude PID (${rule})`), E.gA ? `${fmt(E.gA.Kp, 2)} / ${fmt(E.gA.Ki, 2)} / ${fmt(E.gA.Kd, 3)}` : '—') +
        c(T('t_r antes → después', 't_r before → after'), `${fmt(b.tr, 2)} → ${fmt(a.tr, 2)} s`, 'hl') +
        c(T('Mejora en t_r', 'Improvement in t_r'), imp(b.tr, a.tr), 'hl') +
        c(T('IAE antes → después', 'IAE before → after'), `${fmt(b.iae, 2)} → ${fmt(a.iae, 2)}`) +
        c(T('Artículo (t_r)', 'Paper (t_r)'), axis === 'roll' ? T('−85,9 % (AMIGO PID)', '−85.9% (AMIGO PID)') : T('−76,2 % (SIMC)', '−76.2% (SIMC)'));
    }
    $('#pipeRun').addEventListener('click', runPipe);
    // vista previa estática
    pg.setLocks({ pitch: true, yaw: true }); pg.render(0);
    IP.animate($('#pipeGimbal'), (dt) => { if (!play || !play.running) pg.render(dt); }).start();
  })();

  /* ------------------------------------------------------------
     6. Control basado en eventos
     ------------------------------------------------------------ */
  (function events() {
    const p1 = new IP.Plot($('#evPlot'), { height: 230, ylabel: T('ángulo (°)', 'angle (°)'), xname: 't', xunit: 's' });
    const p2 = new IP.Plot($('#evPlot2'), { height: 160, xlabel: T('tiempo (s)', 'time (s)'), xname: 't', xunit: 's' });
    const ps = new IP.Plot($('#evSweepPlot'), { height: 240, xlabel: 'c₀', ylabel: T('% del periódico', '% of periodic'), xname: 'c₀' });
    let ctl;
    const ranges = { rate: [0.1, 5, 0.1], att: [0.05, 1, 0.05] };
    // configuración óptima publicada (Secs. 5.2 y 5.3): regla y umbral c0 por eje y lazo
    const BEST = { att: { roll: ['AMIGO PID', 0.1], pitch: ['SIMC', 0.1] }, rate: { roll: ['SIMC', 0.5], pitch: ['AMIGO PI', 2.0] } };
    function build(level, axis) {
      const r = ranges[level], best = BEST[level][axis];
      $('#evControls').innerHTML = '';
      ctl = IP.controls($('#evControls'), [
        { id: 'axis', type: 'select', label: T('Eje', 'Axis'), value: axis, options: [{ value: 'roll', label: 'Roll' }, { value: 'pitch', label: 'Pitch' }] },
        { id: 'level', type: 'select', label: T('Lazo por eventos', 'Event-based loop'), value: level, options: [{ value: 'rate', label: T('Velocidad (umbral en °/s)', 'Rate (threshold in °/s)') }, { value: 'att', label: T('Actitud (umbral en °)', 'Attitude (threshold in °)') }] },
        { id: 'rule', type: 'select', label: T('Sintonía (artículo)', 'Tuning (paper)'), value: best[0], hint: T('Al cambiar de eje o de lazo se carga la mejor configuración del artículo.', 'Changing axis or loop loads the paper\'s best configuration.'), options: ['Default', 'AMIGO PI', 'AMIGO PID', 'SIMC'].map(x => ({ value: x, label: x === 'Default' ? T('Por defecto', 'Default') : x })) },
        { id: 'c0', label: T('Umbral constante', 'Constant threshold'), sym: 'c₀', min: r[0], max: r[1], step: r[2], value: best[1], digits: 2, unit: level === 'rate' ? '°/s' : '°' },
        { id: 'ai', label: T('Peso del error', 'Error weight'), sym: 'aᵢ', min: 0, max: 0.3, step: 0.01, value: 0.05, digits: 2 },
        { id: 'cn', type: 'toggle', label: T('Término de ruido cₙ(t)', 'Noise term cₙ(t)'), value: true }
      ], (v, id) => { if (id === 'level' || id === 'axis') build(v.level, v.axis); run(); });
    }
    function run() {
      const v = ctl.values, axis = v.axis;
      const g = { rate: P.rateGains[axis][v.rule], att: P.attGains[axis][v.rule] };
      const base = R.stepResponse({ axis, rate: g.rate, att: g.att, step: 10, T: 3, seed: 9 });
      const evr = R.stepResponse({ axis, rate: g.rate, att: g.att, step: 10, T: 3, seed: 9, ev: { level: v.level, c0: v.c0, ai: v.ai, noiseTerm: v.cn } });
      const lo = -2;
      p1.overlays = {};
      p1.setSeries([
        { name: T('periódico (500 Hz)', 'periodic (500 Hz)'), color: '--s5', x: base.t, y: base.th, width: 2, dash: [5, 4], unit: '°' },
        { name: T('por eventos', 'event-based'), color: '--s1', x: evr.t, y: evr.th, width: 2.2, unit: '°' },
        { name: 'eventos', color: '--s2', x: evr.evT, y: evr.evT.map(() => lo), points: true, r: 1.6, notip: true }
      ]);
      const sub = (arr) => arr.filter((_, i) => i % 3 === 0);
      p2.opts.ylabel = v.level === 'rate' ? '°/s' : '°';
      p2.opts.ylim = [0, Math.max(...evr.thr.filter(Number.isFinite)) * 2.2];
      p2.setSeries([
        { name: '|e − eₖ|', color: '--s3', x: sub(evr.t), y: sub(evr.diff), width: 1.4 },
        { name: T('umbral c₀ + aᵢ|e| + cₙ', 'threshold c₀ + aᵢ|e| + cₙ'), color: '--s2', x: sub(evr.t), y: sub(evr.thr), width: 2 }
      ]);
      const mb = base.metrics, me = evr.metrics;
      const red = 100 * (1 - me.events / me.calls);
      const c = (k, val, cl = '') => `<div class="ip-readout ${cl}"><span>${k}</span><b>${val}</b></div>`;
      $('#evReadouts').innerHTML =
        c(T('Ejecuciones periódicas', 'Periodic executions'), String(me.calls)) +
        c(T('Ejecuciones por eventos', 'Event-based executions'), String(me.events), 'hl') +
        c(T('Reducción', 'Reduction'), fmt(red, 1) + ' %', 'hl') +
        c(T('IAE periódico', 'Periodic IAE'), fmt(mb.iae, 2)) +
        c(T('IAE por eventos', 'Event-based IAE'), fmt(me.iae, 2), me.iae > mb.iae * 1.15 ? 'bad' : '') +
        c(T('t_r por eventos', 'Event-based t_r'), me.unstable ? 'inestable' : fmt(me.tr, 3) + ' s', me.unstable ? 'bad' : '');
    }
    build('att', 'roll'); run();

    $('#evSweep').addEventListener('click', () => {
      const v = ctl.values, axis = v.axis, r = ranges[v.level];
      const g = { rate: P.rateGains[axis][v.rule], att: P.attGains[axis][v.rule] };
      const base = R.stepResponse({ axis, rate: g.rate, att: g.att, step: 10, T: 3, seed: 9 });
      const cs = [], ev = [], iae = [];
      for (let k = 0; k <= 14; k++) {
        const c0 = r[0] + (r[1] - r[0]) * k / 14;
        const e = R.stepResponse({ axis, rate: g.rate, att: g.att, step: 10, T: 3, seed: 9, ev: { level: v.level, c0, ai: v.ai, noiseTerm: v.cn } });
        cs.push(c0); ev.push(100 * e.metrics.events / e.metrics.calls); iae.push(e.metrics.unstable ? NaN : 100 * e.metrics.iae / base.metrics.iae);
      }
      ps.overlays = { hlines: [{ y: 100, color: '--muted', label: T('periódico', 'periodic') }] };
      ps.setSeries([
        { name: 'ejecuciones', color: '--s2', x: cs, y: ev, width: 2.4, unit: '%' },
        { name: 'IAE', color: '--s1', x: cs, y: iae, width: 2.4, unit: '%' }
      ]);
    });
    $('#evSweep').click();

    // barras de CPU (Tabla 6)
    const cpu = P.cpu, rows = [[T('Ciclos por llamada', 'Cycles per call'), cpu.periodic.cycles, cpu.event.cycles, ''], [T('Tiempo por llamada', 'Time per call'), cpu.periodic.us, cpu.event.us, ' µs'], [T('CPU por segundo', 'CPU per second'), cpu.periodic.ms, cpu.event.ms, ' ms/s']];
    let s = '<svg viewBox="0 0 520 210" role="img" aria-label="Carga de CPU periódica frente a la basada en eventos">';
    rows.forEach((r, i) => {
      const y = 14 + i * 66, w0 = 330, w1 = 330 * r[2] / r[1];
      s += `<text x="0" y="${y + 10}">${r[0]}</text>`;
      s += `<rect x="130" y="${y}" width="${w0}" height="18" rx="5" fill="var(--s5)" opacity="0.55"/><text class="val" x="${136 + w0 - 6}" y="${y + 13}" text-anchor="end">${fmt(r[1], r[1] > 100 ? 0 : 2)}${r[3]}</text>`;
      s += `<rect x="130" y="${y + 24}" width="${w1}" height="18" rx="5" fill="var(--s1)"/><text class="val" x="${136 + w1}" y="${y + 37}">${fmt(r[2], r[2] > 100 ? 0 : 2)}${r[3]}</text>`;
    });
    s += T(`<text x="130" y="206">▬ periódico (500 Hz)</text><text x="300" y="206" style="fill:var(--s1)">▬ por eventos  (−${fmt(cpu.reduction, 2)} %)</text></svg>`, `<text x="130" y="206">▬ periodic (500 Hz)</text><text x="300" y="206" style="fill:var(--s1)">▬ event-based  (−${fmt(cpu.reduction, 2)} %)</text></svg>`);
    $('#cpuBars').innerHTML = s;
  })();

  /* ------------------------------------------------------------
     7. Resultados: KPIs y ganancias
     ------------------------------------------------------------ */
  (function results() {
    const k = [
      [T('85–88 %', '85–88%'), T('ajuste del modelo de roll en validación cruzada (77–83 % en pitch)', 'roll model fit in cross-validation (77–83% in pitch)')],
      [T('−85,9 %', '−85.9%'), T('tiempo de subida en roll con AMIGO PID frente al ajuste manual', 'roll rise time with AMIGO PID vs manual tuning')],
      [T('−76,2 %', '−76.2%'), T('tiempo de subida en pitch con SIMC (0,73 s)', 'pitch rise time with SIMC (0.73 s)')],
      [T('67–98 %', '67–98%'), T('menos actualizaciones del control con el disparo por eventos', 'fewer control updates with event triggering')],
      [T('−30,56 %', '−30.56%'), T('tiempo de CPU del control (6,50 → 4,51 ms/s)', 'control CPU time (6.50 → 4.51 ms/s)')],
      [T('−28,6 %', '−28.6%'), T('IAE en velocidad de roll (SIMC, c₀ = 0,5 °/s), con un 67 % menos de eventos', 'roll-rate IAE (SIMC, c₀ = 0.5 °/s), with 67% fewer events')],
      [T('3 190', '3,190'), T('estimaciones del lazo de velocidad en 110 ensayos del barrido de d y δ', 'rate-loop estimates in 110 tests of the d and δ sweep')],
      ['±35°', T('rango de operación en el que la dinámica se mantiene lineal', 'operating range in which the dynamics remain linear')]
    ];
    $('#kpis').innerHTML = k.map(([b, s]) => `<div class="ip-card"><b>${b}</b><span>${s}</span></div>`).join('');
    function bars(el, table, axis) {
      const methods = Object.keys(table[axis]), labels = ['Kp', 'Ki', 'Kd'];
      const cols = ['var(--s5)', 'var(--s3)', 'var(--s2)', 'var(--s1)'];
      let s = '<svg viewBox="0 0 520 250" role="img" aria-label="Ganancias por método">';
      labels.forEach((lab, gi) => {
        const vals = methods.map(m => table[axis][m][gi]), mx = Math.max(...vals) || 1;
        const x0 = 20 + gi * 168;
        s += `<text x="${x0 + 70}" y="240" text-anchor="middle" style="font-weight:700">${lab}</text>`;
        vals.forEach((v, i) => {
          const h = 180 * v / mx, x = x0 + i * 36;
          s += `<rect x="${x}" y="${210 - h}" width="28" height="${Math.max(1, h)}" rx="4" fill="${cols[i]}"><title>${methods[i]}: ${fmt(v, 3)}</title></rect>`;
          s += `<text class="val" x="${x + 14}" y="${204 - h}" text-anchor="middle">${fmt(v, v >= 100 ? 0 : v >= 10 ? 1 : 2)}</text>`;
        });
      });
      s += '</svg><div class="ip-legend">' + methods.map((m, i) => `<span><i style="background:${cols[i]}"></i>${m === 'Default' ? 'Por defecto' : m}</span>`).join('') + '</div>';
      el.innerHTML = s;
    }
    let ra = 'pitch', aa = 'pitch';
    IP.seg($('#barsRateAxis'), [{ value: 'pitch', label: 'Pitch' }, { value: 'roll', label: 'Roll' }], ra, (v) => bars($('#barsRate'), P.rateGains, v));
    IP.seg($('#barsAttAxis'), [{ value: 'pitch', label: 'Pitch' }, { value: 'roll', label: 'Roll' }], aa, (v) => bars($('#barsAtt'), P.attGains, v));
    bars($('#barsRate'), P.rateGains, ra); bars($('#barsAtt'), P.attGains, aa);
  })();

  /* ------------------------------------------------------------
     8. Autoevaluación
     ------------------------------------------------------------ */
  IP.quiz($('#quizBox'), [
    { q: T('¿Para qué sirve la histéresis δ del relé?', 'What is the relay hysteresis δ for?'), options: [T('Para aumentar la amplitud de la oscilación', 'To increase the oscillation amplitude'), T('Para que el ruido de medida no provoque conmutaciones espurias', 'So that measurement noise does not cause spurious switching'), T('Para eliminar el retardo del proceso', 'To remove the process delay'), T('Para que el relé se comporte como un PID', 'To make the relay behave like a PID')], answer: 1,
      explain: T('El relé sólo cambia de nivel cuando el error supera ±δ. Si δ es mayor que el ruido, las conmutaciones se deben a la dinámica del proceso y no al ruido. Por eso el pitch, cuya señal de velocidad tiene muy baja relación señal/ruido, necesita más histéresis o un filtrado previo.', 'The relay only changes level when the error exceeds ±δ. If δ is larger than the noise, switching is due to the process dynamics and not to noise. That is why pitch, whose rate signal has a very low signal-to-noise ratio, needs more hysteresis or prior filtering.') },
    { q: T('En el gimbal, ¿qué modelo describe mejor la velocidad angular del dron?', 'On the gimbal, which model best describes the drone\'s angular rate?'), options: [T('Un primer orden con retardo', 'A first order plus delay'), T('Un integrador con retardo', 'An integrator plus delay'), T('Una ganancia pura', 'A pure gain'), T('Un segundo orden subamortiguado', 'An underdamped second order')], answer: 1,
      explain: T('El par de los motores acelera el giro, así que la velocidad integra la orden. La identificación de primer orden da constantes de tiempo negativas o enormes (Tabla 2), lo que confirma la estructura integradora.', 'Motor torque accelerates the rotation, so the rate integrates the command. First-order identification gives negative or huge time constants (Table 2), which confirms the integrating structure.') },
    { q: T('Un ensayo de relé con modelo integrador da T<sub>u</sub> = 0,20 s. ¿Qué retardo estimas?', 'A relay test with an integrator model gives T<sub>u</sub> = 0.20 s. What delay do you estimate?'), options: ['0,20 s', '0,10 s', '0,05 s', '0,80 s'], answer: 2,
      explain: T('Con la ec. 8, D = π/(2ω<sub>u</sub>) = T<sub>u</sub>/4 = 0,05 s. Es lo que ocurre en la velocidad de roll del artículo: T<sub>u</sub> = 0,19 s y D ≈ 0,048 s.', 'With eq. 8, D = π/(2ω<sub>u</sub>) = T<sub>u</sub>/4 = 0.05 s. This is what happens in the paper\'s roll rate: T<sub>u</sub> = 0.19 s and D ≈ 0.048 s.') },
    { q: T('Si duplicas la amplitud d del relé en un proceso lineal (con δ pequeño), ¿qué pasa con la amplitud a del ciclo límite y con K<sub>u</sub>?', 'If you double the relay amplitude d in a linear process (with small δ), what happens to the limit-cycle amplitude a and to K<sub>u</sub>?'), options: [T('a se duplica y K<sub>u</sub> apenas cambia', 'a doubles and K<sub>u</sub> barely changes'), T('a no cambia y K<sub>u</sub> se duplica', 'a does not change and K<sub>u</sub> doubles'), T('Ambas se duplican', 'Both double'), T('El ciclo límite desaparece', 'The limit cycle disappears')], answer: 0,
      explain: T('En un proceso lineal la oscilación escala con la excitación: a ∝ d, así que K<sub>u</sub> = 4d/(π√(a²−δ²)) se mantiene. Compruébalo en el laboratorio: es la base del barrido paramétrico (las zonas de color homogéneo).', 'In a linear process the oscillation scales with the excitation: a ∝ d, so K<sub>u</sub> = 4d/(π√(a²−δ²)) is preserved. Check it in the lab: it is the basis of the parameter sweep (the areas of uniform colour).') },
    { q: T('¿Qué hace el término c<sub>n</sub>(t) del umbral de eventos?', 'What does the term c<sub>n</sub>(t) of the event threshold do?'), options: [T('Fija el error máximo tolerado junto a la referencia', 'Sets the maximum error tolerated near the setpoint'), T('Aumenta el umbral lejos de la referencia', 'Increases the threshold far from the setpoint'), T('Adapta el umbral al nivel de ruido para no generar eventos espurios', 'Adapts the threshold to the noise level to avoid spurious events'), T('Cuenta el número de eventos', 'Counts the number of events')], answer: 2,
      explain: T('c<sub>n</sub>(t) es la desviación típica del error en una ventana de 0,2 s. Si la señal es ruidosa, el umbral crece lo suficiente para que el ruido no dispare el controlador.', 'c<sub>n</sub>(t) is the standard deviation of the error in a 0.2 s window. If the signal is noisy, the threshold grows enough for the noise not to trigger the controller.') },
    { q: T('¿Por qué no se identificó el eje de yaw?', 'Why was the yaw axis not identified?'), options: [T('Porque el Crazyflie no mide el yaw', 'Because the Crazyflie does not measure yaw'), T('Porque la estructura de yaw (57 g) se acerca al empuje máximo del dron (≈60 g)', 'Because the yaw structure (57 g) is close to the drone\'s maximum thrust (≈60 g)'), T('Porque el yaw es inestable', 'Because yaw is unstable'), T('Porque el relé no funciona en yaw', 'Because the relay does not work in yaw')], answer: 1,
      explain: T('Cada nivel del gimbal añade masa: 5 g en roll, 25 g en pitch y 57 g en yaw. Con unos 60 g de empuje, mover el anillo de yaw no es viable.', 'Each gimbal level adds mass: 5 g in roll, 25 g in pitch and 57 g in yaw. With about 60 g of thrust, moving the yaw ring is not feasible.') }
  ]);
})();
