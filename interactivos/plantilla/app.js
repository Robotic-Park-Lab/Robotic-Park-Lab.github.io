/* ============================================================
   PLANTILLA — código de la página interactiva
   ------------------------------------------------------------
   Cada bloque corresponde a una sección de index.html. Borra los
   que no necesites y copia los que quieras repetir. La API de la
   librería está documentada en interactivos/README.md y en la
   cabecera de interactivos/lib/ip.js.
   ============================================================ */
(function () {
  'use strict';
  const $ = IP.$, fmt = IP.fmt, T = IP.t;

  // Menú con sección activa, barra de progreso, animaciones al hacer scroll,
  // botones «Copiar» y fórmulas KaTeX. Llámalo siempre al principio.
  IP.page();

  /* ------------------------------------------------------------
     PORTADA — canvas animado (sustitúyelo por tu propio dibujo)
     IP.animate(elemento, paso) ejecuta paso(dt, t) en cada frame y
     se pausa solo cuando la portada no está en pantalla.
     ------------------------------------------------------------ */
  (function hero() {
    const cv = $('#heroCanvas'), ctx = cv.getContext('2d');
    IP.animate(cv.parentElement, (dt, t) => {
      const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      // EDITA AQUÍ: ejemplo de figura de Lissajous con estela
      for (let k = 0; k < 120; k++) {
        const s = t - k * 0.012, a = 1 - k / 120;
        const x = W / 2 + W * 0.38 * Math.sin(1.9 * s), y = H / 2 + H * 0.32 * Math.sin(2.7 * s + 0.6);
        ctx.fillStyle = `rgba(79,185,138,${a})`; ctx.beginPath(); ctx.arc(x, y, 5 * a + 1, 0, 2 * Math.PI); ctx.fill();
      }
    }).start();
  })();

  /* ------------------------------------------------------------
     1. MAPA CONCEPTUAL
     · x, y: posición del centro de cada nodo en el sistema `view`
     · mx, my: posición en la vista móvil `mobileView` (opcional)
     · kind: 'problem' | 'method' | 'theory' | 'result' (color del borde)
     · text: HTML que se muestra al pulsar (admite fórmulas \( … \))
     · href: sección a la que lleva el botón «Ir a la sección»
     ------------------------------------------------------------ */
  // EDITA AQUÍ
  IP.conceptMap($('#cmap'), {
    view: [900, 420], mobileView: [420, 560],
    nodes: [
      { id: 'prob', label: T('Problema', 'Problem'), kind: 'problem', x: 140, y: 80, mx: 110, my: 60, href: '#teoria', text: T('<p>Qué limitación o pregunta motiva el trabajo.</p>', '<p>What limitation or question motivates the work.</p>') },
      { id: 'model', label: 'Modelo\nG(s)', kind: 'theory', x: 450, y: 80, mx: 310, my: 60, href: '#teoria', text: T('<p>Modelo del proceso: \\(G(s)=\\tfrac{K}{Ts+1}e^{-Ls}\\).</p>', '<p>Process model: \\(G(s)=\\tfrac{K}{Ts+1}e^{-Ls}\\).</p>') },
      { id: 'method', label: T('Método\npropuesto', 'Proposed\nmethod'), kind: 'method', x: 760, y: 80, mx: 210, my: 200, href: '#simulador', text: T('<p>La aportación principal del artículo.</p>', '<p>The main contribution of the paper.</p>') },
      { id: 'exp', label: T('Experimentos', 'Experiments'), kind: 'method', x: 300, y: 300, mx: 110, my: 350, href: '#simulador', text: T('<p>Plataforma, montaje y ensayos realizados.</p>', '<p>Platform, setup and tests performed.</p>') },
      { id: 'res', label: T('Resultados', 'Results'), kind: 'result', x: 650, y: 300, mx: 310, my: 350, href: '#citar', text: T('<p>Cifras clave y conclusiones.</p>', '<p>Key figures and conclusions.</p>') }
    ],
    edges: [
      { from: 'prob', to: 'model', label: T('se modela', 'modelled as') },
      { from: 'model', to: 'method', label: 'permite' },
      { from: 'method', to: 'exp', label: T('se valida en', 'validated on') },
      { from: 'exp', to: 'res', label: 'produce' }
    ]
  }, { panel: $('#cmapPanel'), initial: 'method' });

  /* ------------------------------------------------------------
     3. SIMULADOR
     Patrón: IP.controls → simular() → plot.setSeries → lecturas
     ------------------------------------------------------------ */
  (function simulator() {
    const plot = new IP.Plot($('#simPlot'), { height: 300, xlabel: T('tiempo (s)', 'time (s)'), ylabel: 'salida', xname: 't', xunit: 's' });
    let mode = 'pi';
    // Botones segmentados para elegir entre variantes
    IP.seg($('#modeSeg'), [{ value: 'ol', label: T('Lazo abierto', 'Open loop') }, { value: 'pi', label: T('Control PI', 'PI control') }], mode, (v) => { mode = v; run(); });

    // EDITA AQUÍ: un objeto por control. type: 'range' (por defecto) | 'select' | 'toggle'
    const ctl = IP.controls($('#simControls'), [
      { id: 'K', label: T('Ganancia', 'Gain'), sym: 'K', min: 0.2, max: 3, step: 0.1, value: 1, digits: 1 },
      { id: 'T', label: T('Constante de tiempo', 'Time constant'), sym: 'T', min: 0.2, max: 5, step: 0.1, value: 1.5, unit: 's', digits: 1 },
      { id: 'L', label: T('Retardo', 'Delay'), sym: 'L', min: 0, max: 2, step: 0.05, value: 0.3, unit: 's', digits: 2 },
      { id: 'kp', label: T('Ganancia proporcional', 'Proportional gain'), sym: 'Kp', min: 0.1, max: 5, step: 0.05, value: 1.2, digits: 2 },
      { id: 'ki', label: T('Ganancia integral', 'Integral gain'), sym: 'Ki', min: 0, max: 5, step: 0.05, value: 0.8, digits: 2 },
      { id: 'noise', type: 'toggle', label: T('Ruido de medida', 'Measurement noise'), value: false }
    ], run);

    function simulate(v) {
      // Simulación por Euler con paso fijo. IP.sim ofrece DelayLine, PID, MovingAvg, rng…
      const dt = 0.01, Tend = 15, delay = new IP.sim.DelayLine(Math.max(1, Math.round(v.L / dt)));
      const pid = new IP.sim.PID({ kp: v.kp, ki: v.ki, umax: 20 }), rng = IP.sim.rng(3);
      const t = [], y = [], u = [], r = [];
      let x = 0, uk = 0;
      for (let k = 0; k <= Tend / dt; k++) {
        const tk = k * dt, ref = tk >= 1 ? 1 : 0;
        const ym = x + (v.noise ? 0.02 * rng.gauss() : 0);
        uk = mode === 'ol' ? ref : pid.step(ref - ym, dt);
        const ud = delay.push(uk);
        x += dt * (v.K * ud - x) / v.T;
        t.push(tk); y.push(ym); u.push(uk); r.push(ref);
      }
      return { t, y, u, r };
    }

    function run() {
      const v = ctl.values, s = simulate(v);
      plot.setSeries([
        { name: T('salida y(t)', 'output y(t)'), color: '--s1', x: s.t, y: s.y, width: 2.4 },
        { name: T('control u(t)', 'control u(t)'), color: '--s2', x: s.t, y: s.u, width: 1.6, dash: [6, 4] },
        { name: 'referencia', color: '--muted', x: s.t, y: s.r, width: 1.2, step: true, nolegend: true, notip: true }
      ]);
      // Índices de la respuesta a escalón (sobreoscilación, t. subida, t. establecimiento, IAE, ITAE)
      const yf = mode === 'ol' ? v.K : 1;
      const m = IP.sim.stepMetrics(s.t, s.y, yf, 1, 0);
      $('#simReadouts').innerHTML = [
        [T('Sobreoscilación', 'Overshoot'), fmt(m.os, 1) + ' %'],
        [T('T. subida', 'Rise time'), fmt(m.tr, 2) + ' s'],
        [T('T. establecimiento', 'Settling time'), fmt(m.ts, 2) + ' s'],
        ['IAE', fmt(m.iae, 2)]
      ].map(([k, val]) => `<div class="ip-readout"><span>${k}</span><b>${val}</b></div>`).join('');
      const bad = m.os > 40;
      $('#simBadge').textContent = bad ? T('Muy oscilatorio', 'Very oscillatory') : T('Respuesta aceptable', 'Acceptable response');
      $('#simBadge').className = 'ip-pill ' + (bad ? 'danger' : '');
    }
    run();
  })();

  /* ------------------------------------------------------------
     4. AUTOEVALUACIÓN — answer es el índice (desde 0) de la opción correcta
     ------------------------------------------------------------ */
  // EDITA AQUÍ
  IP.quiz($('#quizBox'), [
    { q: T('¿Qué efecto tiene aumentar el retardo L con el mismo controlador?', 'What is the effect of increasing the delay L with the same controller?'), options: [T('La respuesta se vuelve más oscilatoria', 'The response becomes more oscillatory'), T('La respuesta se acelera', 'The response speeds up'), T('No cambia nada', 'Nothing changes')], answer: 0,
      explain: T('El retardo resta fase al lazo, reduce el margen de fase y aumenta la oscilación. Compruébalo en el simulador.', 'The delay subtracts phase from the loop, reduces the phase margin and increases oscillation. Check it in the simulator.') },
    { q: T('¿Qué elimina la acción integral?', 'What does integral action remove?'), options: [T('El ruido de medida', 'Measurement noise'), T('El error en régimen permanente ante un escalón', 'The steady-state error to a step'), T('El retardo del proceso', 'The process delay')], answer: 1,
      explain: T('La integral acumula el error mientras no sea nulo, así que la salida acaba alcanzando la referencia.', 'The integral accumulates the error while it is non-zero, so the output ends up reaching the setpoint.') }
  ]);
})();
