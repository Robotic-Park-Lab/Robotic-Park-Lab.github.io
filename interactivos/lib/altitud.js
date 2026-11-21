/* ============================================================
   ALT — altitud de un Crazyflie 2.1 con control periódico o por eventos
   ------------------------------------------------------------
   Modelo vertical: m·z̈ = k_T·PWM_f − m·g, con el empuje filtrado por la
   dinámica de los motores (τ_m) y saturación PWM de 16 bits.
   El empuje de equilibrio PWM_h = 36000 fija k_T = m·g / PWM_h.

   ALT.simulate({
     mode: 'pid' | 'cascade',
     trigger: 'periodic' | 'fixed' | 'relative',  c0, a, l   (se vigila el error e = r − z_m),
     T (s), Ts (periodo base, s), noise (σ de la medida, m), ref(t), seed,
     gains: { kp, ki, kd, nd }            // 'pid'  (salida en bits PWM)
            { kpz, kiz, kpw, kiw, scale } // 'cascade': z → w → PWM (escala supuesta)
   }) → { t, z, zm, ref, u, evT, gap, thr, diff, metrics }
   ============================================================ */
(function (global) {
  'use strict';
  const M = 0.027, G = 9.81, PWM_H = 36000, KT = M * G / PWM_H, TAU_M = 0.03;

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    const u = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
    return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  }

  function simulate(o) {
    const T = o.T ?? 30, Ts = o.Ts ?? 0.01, dt = 0.001, g = rng(o.seed ?? 3);
    const ref = o.ref || ((t) => (t < 0.2 ? 0 : 1));
    const out = { t: [], z: [], zm: [], ref: [], u: [], evT: [], evZ: [], thr: [], diff: [] };
    let z = 0, vz = 0, f = PWM_H * 0.0, u = 0;
    // estados del controlador
    let I = 0, D = 0, eprev = 0, Iz = 0, Iw = 0, tLast = 0, wref = 0, pkw = null, ezPrev = 0, ewPrev = 0, tLastW = 0, evZ = 0, evW = 0;
    let pk = null; const win = [];
    let events = 0, maxGap = 0, iae = 0, itae = 0, ise = 0;
    const steps = Math.round(T / dt), every = Math.round(Ts / dt);
    for (let k = 0; k <= steps; k++) {
      const t = k * dt;
      if (k % every === 0) {
        const zm = z + (o.noise || 0) * g(), r = ref(t);
        // umbral de disparo
        win.push(zm); if (win.length > (o.l || 20)) win.shift();
        const mean = win.reduce((a, b) => a + b, 0) / win.length;
        const cn = o.trigger === 'relative' ? Math.max(...win.map(y => Math.abs(y - mean))) : 0;
        // la señal vigilada es la entrada del controlador, el error e = r − z_m (así los cambios
        // de referencia también disparan); el término relativo pondera |e| = |p − p_ref|
        const sig = r - zm;
        const thr = o.trigger === 'periodic' ? 0 : (o.c0 ?? 0.01) + (o.trigger === 'relative' ? (o.a ?? 0.015) * Math.abs(sig) + cn : 0);
        const diff = pk === null ? Infinity : Math.abs(pk - sig);
        let fire = o.trigger === 'periodic' || diff > thr;
        if (fire) {
          const Tk = Math.max(Ts, t - tLast); maxGap = Math.max(maxGap, t - tLast); tLast = t; pk = sig; events++;
          const e = r - zm;
          if (o.mode === 'cascade') {
            // lazo externo Z (este evento) → consigna de velocidad w_ref
            const q = o.gains;
            Iz += q.kiz * Tk * ezPrev; ezPrev = e; wref = q.kpz * e + Iz; evZ++;   // I_k = I_{k-1} + K_i T_k e_{k-1}
          } else {
            const q = o.gains;
            I += q.ki * Tk * eprev;
            D = q.kd / (q.kd + q.nd * Tk * q.kp) * D + (q.kd * q.nd) / (q.kd / q.kp + q.nd * Tk) * (e - eprev);
            eprev = e;
            u = q.kp * e + I + D;
          }
          out.evT.push(t); out.evZ.push(zm);
        }
        if (o.mode === 'cascade') {
          // lazo interno W: velocidad estimada por diferencias; dispara con su propio umbral
          // velocidad vertical del estimador a bordo (EKF): valor real + ruido pequeño
          const wf = vz + (o.noiseW ?? 0.01) * g();
          const ew = wref - wf, thrW = o.trigger === 'periodic' ? 0 : (o.c0w ?? 0.02) + (o.trigger === 'relative' ? (o.a ?? 0.015) * Math.abs(ew) : 0);
          if (o.trigger === 'periodic' || pkw === null || Math.abs(pkw - ew) > thrW) {
            const Tw = Math.max(Ts, t - tLastW); tLastW = t; pkw = ew; evW++;
            const q = o.gains; Iw += q.kiw * Tw * ewPrev; ewPrev = ew; u = (q.kpw * ew + Iw) * (q.scale || 1000);
          }
        }
        out.t.push(t); out.z.push(z); out.zm.push(zm); out.ref.push(r); out.u.push(u);
        out.thr.push(thr); out.diff.push(Number.isFinite(diff) ? diff : NaN);
        const e = Math.abs(r - z); iae += e * Ts; itae += t * e * Ts; ise += e * e * Ts;
      }
      // planta: motores de primer orden + dinámica vertical (suelo en z = 0)
      const pwm = Math.min(65535, Math.max(0, PWM_H + u));
      f += dt * (pwm - f) / TAU_M;
      let az = KT * f / M - G;
      vz += az * dt; z += vz * dt;
      if (z < 0) { z = 0; if (vz < 0) vz = 0; }
    }
    // potencia estimada ∝ Σ ω² (proporcional al empuje medio): sólo para comparar casos
    const pmean = out.u.reduce((s, x) => s + Math.min(65535, Math.max(0, PWM_H + x)), 0) / out.u.length;
    out.metrics = { events, evZ, evW, iae, itae, mse: ise / T, maxGap, pmean };
    return out;
  }

  /** Perfil del artículo: despegue a 1 m y dos descensos del 20 % durante el cuadrado. */
  const profile = (t) => (t < 0.2 ? 0 : (t > 10 && t < 12.5) || (t > 20 && t < 22.5) ? 0.8 : 1);

  global.ALT = { simulate, profile, PWM_H };
})(window);
