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
  const $ = IP.$, fmt = IP.fmt;

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
      { id: 'prob', label: 'Problema', kind: 'problem', x: 140, y: 80, mx: 110, my: 60, href: '#teoria', text: '<p>Qué limitación o pregunta motiva el trabajo.</p>' },
      { id: 'model', label: 'Modelo\nG(s)', kind: 'theory', x: 450, y: 80, mx: 310, my: 60, href: '#teoria', text: '<p>Modelo del proceso: \\(G(s)=\\tfrac{K}{Ts+1}e^{-Ls}\\).</p>' },
      { id: 'method', label: 'Método\npropuesto', kind: 'method', x: 760, y: 80, mx: 210, my: 200, href: '#simulador', text: '<p>La aportación principal del artículo.</p>' },
      { id: 'exp', label: 'Experimentos', kind: 'method', x: 300, y: 300, mx: 110, my: 350, href: '#simulador', text: '<p>Plataforma, montaje y ensayos realizados.</p>' },
      { id: 'res', label: 'Resultados', kind: 'result', x: 650, y: 300, mx: 310, my: 350, href: '#citar', text: '<p>Cifras clave y conclusiones.</p>' }
    ],
    edges: [
      { from: 'prob', to: 'model', label: 'se modela' },
      { from: 'model', to: 'method', label: 'permite' },
      { from: 'method', to: 'exp', label: 'se valida en' },
      { from: 'exp', to: 'res', label: 'produce' }
    ]
  }, { panel: $('#cmapPanel'), initial: 'method' });

  /* ------------------------------------------------------------
     3. SIMULADOR
     Patrón: IP.controls → simular() → plot.setSeries → lecturas
     ------------------------------------------------------------ */
  (function simulator() {
    const plot = new IP.Plot($('#simPlot'), { height: 300, xlabel: 'tiempo (s)', ylabel: 'salida', xname: 't', xunit: 's' });
    let mode = 'pi';
    // Botones segmentados para elegir entre variantes
    IP.seg($('#modeSeg'), [{ value: 'ol', label: 'Lazo abierto' }, { value: 'pi', label: 'Control PI' }], mode, (v) => { mode = v; run(); });

    // EDITA AQUÍ: un objeto por control. type: 'range' (por defecto) | 'select' | 'toggle'
    const ctl = IP.controls($('#simControls'), [
      { id: 'K', label: 'Ganancia', sym: 'K', min: 0.2, max: 3, step: 0.1, value: 1, digits: 1 },
      { id: 'T', label: 'Constante de tiempo', sym: 'T', min: 0.2, max: 5, step: 0.1, value: 1.5, unit: 's', digits: 1 },
      { id: 'L', label: 'Retardo', sym: 'L', min: 0, max: 2, step: 0.05, value: 0.3, unit: 's', digits: 2 },
      { id: 'kp', label: 'Ganancia proporcional', sym: 'Kp', min: 0.1, max: 5, step: 0.05, value: 1.2, digits: 2 },
      { id: 'ki', label: 'Ganancia integral', sym: 'Ki', min: 0, max: 5, step: 0.05, value: 0.8, digits: 2 },
      { id: 'noise', type: 'toggle', label: 'Ruido de medida', value: false }
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
        { name: 'salida y(t)', color: '--s1', x: s.t, y: s.y, width: 2.4 },
        { name: 'control u(t)', color: '--s2', x: s.t, y: s.u, width: 1.6, dash: [6, 4] },
        { name: 'referencia', color: '--muted', x: s.t, y: s.r, width: 1.2, step: true, nolegend: true, notip: true }
      ]);
      // Índices de la respuesta a escalón (sobreoscilación, t. subida, t. establecimiento, IAE, ITAE)
      const yf = mode === 'ol' ? v.K : 1;
      const m = IP.sim.stepMetrics(s.t, s.y, yf, 1, 0);
      $('#simReadouts').innerHTML = [
        ['Sobreoscilación', fmt(m.os, 1) + ' %'],
        ['T. subida', fmt(m.tr, 2) + ' s'],
        ['T. establecimiento', fmt(m.ts, 2) + ' s'],
        ['IAE', fmt(m.iae, 2)]
      ].map(([k, val]) => `<div class="ip-readout"><span>${k}</span><b>${val}</b></div>`).join('');
      const bad = m.os > 40;
      $('#simBadge').textContent = bad ? 'Muy oscilatorio' : 'Respuesta aceptable';
      $('#simBadge').className = 'ip-pill ' + (bad ? 'danger' : '');
    }
    run();
  })();

  /* ------------------------------------------------------------
     4. AUTOEVALUACIÓN — answer es el índice (desde 0) de la opción correcta
     ------------------------------------------------------------ */
  // EDITA AQUÍ
  IP.quiz($('#quizBox'), [
    { q: '¿Qué efecto tiene aumentar el retardo L con el mismo controlador?', options: ['La respuesta se vuelve más oscilatoria', 'La respuesta se acelera', 'No cambia nada'], answer: 0,
      explain: 'El retardo resta fase al lazo, reduce el margen de fase y aumenta la oscilación. Compruébalo en el simulador.' },
    { q: '¿Qué elimina la acción integral?', options: ['El ruido de medida', 'El error en régimen permanente ante un escalón', 'El retardo del proceso'], answer: 1,
      explain: 'La integral acumula el error mientras no sea nulo, así que la salida acaba alcanzando la referencia.' }
  ]);
})();
