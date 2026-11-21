/* ============================================================
   LF — líder-seguidor con tres Crazyflie 2.1 y comunicación send-on-delta
   («Control de formación basado en eventos para Crazyflie 2.1», Simposio CEA 2022)
   ------------------------------------------------------------
   · dron01 (líder) sigue la consigna γ(t): despegue a 1 m y cuadrado de 0,5 m.
   · dron01 → dron02 y dron02 → dron03 publican su posición; cada seguidor
     usa como consigna la última posición recibida más el desplazamiento
     deseado p* = (0,25, 0,25, 0,1) m.
   · Comunicación periódica cada 50 ms o por eventos: se publica cuando
     ‖p_i(t) − p_i(t_k)‖ > c_i0 (comprobado cada 50 ms).
   · Control de posición a bordo: segundo orden por eje (ω_n, ζ), con una
     pequeña oscilación de vuelo estacionario y ruido de Vicon de 1 mm.
   Modelo didáctico: las cifras del artículo están en LF.PAPER.
   ============================================================ */
(function (global) {
  'use strict';
  const PAPER = {
    T: 46.4, period: 0.05, side: 0.5, z: 1, offset: [0.25, 0.25, 0.1],
    msgs: { P: [928, 930], BE5: [69, 94], BE10: [42, 57] },           // Tabla 2 (dron01, dron02)
    delay: { P: 0.6, BE5: 0.8, BE10: 1.0 },                           // retardo entre señales (s)
    rel: {                                                            // Tabla 1, µ ± σ (m)
      P:    [[-0.25, 0.10], [-0.24, 0.09], [-0.11, 0.04], [-0.25, 0.09], [-0.25, 0.09], [-0.11, 0.04]],
      BE5:  [[-0.25, 0.11], [-0.24, 0.09], [-0.11, 0.04], [-0.25, 0.09], [-0.26, 0.09], [-0.11, 0.03]],
      BE10: [[-0.25, 0.10], [-0.24, 0.11], [-0.10, 0.03], [-0.25, 0.09], [-0.25, 0.09], [-0.11, 0.03]]
    },
    reduction: 95.47, poseBytes: 56, posBytes: 24
  };

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    const u = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
    return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  }

  /** Consigna del líder: despegue (2–8 s), espera, cuadrado de 0,5 m (12–32 s) y espera. */
  function gamma(t, o = {}) {
    const L = o.side ?? PAPER.side, Z = o.z ?? PAPER.z, t0 = 12, ts = o.sideTime ?? 4;
    const z = t < 2 ? 0 : t < 8 ? Z * (t - 2) / 6 : Z;
    const C = [[0, 0], [L, 0], [L, L], [0, L], [0, 0]];
    let x = 0, y = 0;
    if (t > t0) {
      const k = Math.min(3, Math.floor((t - t0) / ts)), s = Math.min(1, (t - t0 - k * ts) / ts);
      if (t - t0 >= 4 * ts) { x = 0; y = 0; } else { x = C[k][0] + (C[k + 1][0] - C[k][0]) * s; y = C[k][1] + (C[k + 1][1] - C[k][1]) * s; }
    }
    return [x - L / 2, y - L / 2, z];
  }

  /**
   * simulate({ mode: 'P' | 'E', c (m), T, wn, zeta, latency, wobble, seed })
   * → { t[], p[3][][3], sp[3][][3], sent[2][][3], msgT[2][], msgs[2], lag, rel[6][2] }
   */
  function simulate(o = {}) {
    const T = o.T ?? PAPER.T, dt = 0.005, Ts = PAPER.period, wn = o.wn ?? 2.6, zeta = o.zeta ?? 0.6;
    const lat = o.latency ?? 0.1, wob = o.wobble ?? 0.3, g = rng(o.seed ?? 11), off = PAPER.offset;
    const c = o.mode === 'P' ? 0 : (o.c ?? 0.05);
    const p = [[-0.25, -0.25, 0], [0, 0, 0], [0.25, 0.25, 0]], v = p.map(() => [0, 0, 0]), dist = p.map(() => [0, 0, 0]);
    const sent = [p[0].slice(), p[1].slice()];                    // última posición publicada por dron01 y dron02
    const queue = [[], []];                                        // mensajes en vuelo (latencia del canal)
    const recv = [p[0].slice(), p[1].slice()];                     // lo que ha llegado a dron02 y dron03
    const out = { t: [], p: [[], [], []], sp: [[], [], []], sent: [[], []], msgT: [[], []], msgs: [0, 0] };
    let nextChk = 0, rec = 0;
    const meas = (q) => [q[0] + 0.001 * g(), q[1] + 0.001 * g(), q[2] + 0.001 * g()];
    for (let k = 0, n = Math.round(T / dt); k <= n; k++) {
      const t = k * dt;
      if (t >= nextChk - 1e-9) {
        nextChk += Ts;
        for (let i = 0; i < 2; i++) {
          const m = meas(p[i]);
          const d = Math.hypot(m[0] - sent[i][0], m[1] - sent[i][1], m[2] - sent[i][2]);
          if (o.mode === 'P' || d > c) { sent[i] = m; out.msgs[i]++; out.msgT[i].push(t); queue[i].push([t + lat, m]); }
        }
      }
      for (let i = 0; i < 2; i++) while (queue[i].length && queue[i][0][0] <= t) recv[i] = queue[i].shift()[1];
      const sp = [gamma(t, o), [recv[0][0] + off[0], recv[0][1] + off[1], recv[0][2] + off[2]], [recv[1][0] + off[0], recv[1][1] + off[1], recv[1][2] + off[2]]];
      if (t < 2) { sp[1][2] = 0; sp[2][2] = 0; }                   // los seguidores despegan con el líder
      for (let i = 0; i < 3; i++) {
        const air = p[i][2] > 0.05 || sp[i][2] > 0.05;
        for (let a = 0; a < 3; a++) {
          // perturbación de vuelo (Ornstein-Uhlenbeck) sólo en el aire
          dist[i][a] += (-dist[i][a] / 0.6) * dt + (air ? wob * Math.sqrt(dt) * g() : 0);
          const acc = wn * wn * (sp[i][a] - p[i][a]) - 2 * zeta * wn * v[i][a] + (air ? dist[i][a] : 0);
          v[i][a] += acc * dt; p[i][a] += v[i][a] * dt;
        }
        if (p[i][2] < 0) { p[i][2] = 0; v[i][2] = Math.max(0, v[i][2]); }
      }
      if (t >= rec - 1e-9) {
        rec += 0.05; out.t.push(t);
        for (let i = 0; i < 3; i++) { out.p[i].push(p[i].slice()); out.sp[i].push(sp[i].slice()); }
        out.sent[0].push(sent[0].slice()); out.sent[1].push(sent[1].slice());
      }
    }
    // posición relativa (Tabla 1): µ ± σ de p_i − p_j por eje entre 10 y 40 s
    const idx = out.t.map((t, k) => (t >= 10 && t <= 40 ? k : -1)).filter(k => k >= 0);
    out.rel = [];
    [[0, 1], [1, 2]].forEach(([i, j]) => { for (let a = 0; a < 3; a++) { const x = idx.map(k => out.p[i][k][a] - out.p[j][k][a]); const m = x.reduce((s, y) => s + y, 0) / x.length; const sd = Math.sqrt(x.reduce((s, y) => s + (y - m) ** 2, 0) / x.length); out.rel.push([m, sd]); } });
    // retardo: desplazamiento que mejor alinea dron02 − p* con dron01 durante el cuadrado
    let best = 0, bestE = Infinity; const kk = out.t.map((t, k) => (t >= 12 && t <= 36 ? k : -1)).filter(k => k >= 0);
    for (let s = 0; s <= 50; s++) {
      let e = 0; kk.forEach(k => { const a = out.p[0][k - s] || out.p[0][0], b = out.p[1][k]; e += Math.abs(b[0] - off[0] - a[0]) + Math.abs(b[1] - off[1] - a[1]); });
      if (e < bestE) { bestE = e; best = s; }
    }
    out.lag = best * 0.05;
    return out;
  }

  global.LF = { PAPER, gamma, simulate };
})(typeof window !== 'undefined' ? window : globalThis);
