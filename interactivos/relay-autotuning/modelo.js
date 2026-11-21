/* ============================================================
   Núcleo de simulación — "Relay-based autotuning for quadrotor
   attitude and rate control" (Mechatronics 119, 2026, 103572)
   ------------------------------------------------------------
   · Planta didáctica por eje (roll / pitch) calibrada con los
     modelos identificados en el artículo (Tablas 2 y 4):
       ω̇ = kp · m(t),  m = motor de 1er orden (τm) con retardo L
       θ̇ = ω            (dron en el gimbal: dinámica integradora)
   · Relé simétrico con histéresis (d, δ), conmutación sobre el
     error, centrado en el punto de equilibrio (bumpless).
   · Identificación (Sec. 4.1): integrador con retardo (ec. 8) y
     primer orden con retardo (ec. 9).
   · Reglas de sintonía (Tabla 1): AMIGO PI/PID y SIMC.
   · Control basado en eventos con umbral adaptativo (ec. 11).
   Paso de integración: 2 ms (lazo interno del Crazyflie, 500 Hz).
   ============================================================ */
(function (global) {
  'use strict';
  const DT = 0.002;
  const IP = global.IP;

  /* ---------------- datos publicados en el artículo ---------------- */
  const PAPER = {
    rateModels: {               // Tabla 2 (integrador con retardo / primer orden)
      pitch: { I: { kp: 0.0125, D: 0.109 }, F: { kp: 0.0039, tau: -0.3202 } },
      roll: { I: { kp: 0.0439, D: 0.0479 }, F: { kp: 3.34e14, tau: 1.75e13 } }
    },
    attModels: {                // Tabla 4
      pitch: { relay: { kp: 1.35, D: 0.19 }, matlab: { kp: 1.18, D: 0.17 }, theo: { kp: 1.03, D: 0.18 } },
      roll: { relay: { kp: 0.81, D: 0.067 }, matlab: { kp: 0.83, D: 0.06 }, theo: { kp: 0.82, D: 0 } }
    },
    rateGains: {                // Tabla 3 (τc pitch 0,15 · roll 0,06)
      pitch: { Default: [250, 500, 2.5], 'AMIGO PI': [277.7584, 188.5567, 0], 'AMIGO PID': [357.1179, 406.0704, 19.6292], SIMC: [334.5768, 321.8323, 0] },
      roll: { Default: [250, 500, 2.5], 'AMIGO PI': [166.43, 259.31, 0], 'AMIGO PID': [213.98, 558.44, 5.12], SIMC: [232.65, 594.12, 0] }
    },
    attGains: {                 // Tabla 5 (τc pitch 0,2 · roll 0,15)
      pitch: { Default: [1.5, 0, 0], 'AMIGO PI': [1.3295, 0.5088, 0], 'AMIGO PID': [1.7094, 1.0975, 0.1667], SIMC: [1.8753, 1.1869, 0] },
      roll: { Default: [2.0, 0, 0], 'AMIGO PI': [5.1293, 5.6379, 0], 'AMIGO PID': [5.2053, 7.1637, 0.2364], SIMC: [5.8072, 6.9133, 0] }
    },
    tauc: { rate: { pitch: 0.15, roll: 0.06 }, att: { pitch: 0.2, roll: 0.15 } },
    relayTests: {               // Figs. 13, 14, 18, 19
      pitchRate: { d: 12000, a: 11.08, delta: 1, Ku: 1384.01, Tu: 0.468 },
      rollRate: { d: 10000, a: 17.5089, delta: 2, Ku: 17.50, Tu: 0.19 },
      roll: { d: 10, a: 1.05, delta: 0.40, Ku: 11.36, Tu: 0.65 },
      pitch: { d: 10, a: 3.46, delta: 0.4, Ku: 3.65, Tu: 0.98 }
    },
    cpu: { periodic: { cycles: 2200, us: 13.00, ms: 6.50 }, event: { cycles: 1517, us: 9.02, ms: 4.51 }, reduction: 30.56 },
    masses: { roll: 5, pitch: 25, yaw: 57, thrust: 60 },
    highlights: { riseRoll: 85.9, risePitch: 76.2, eventsMin: 67, eventsMax: 98, fitRoll: [85, 88], fitPitch: [77, 83] }
  };

  /* ---------------- planta didáctica por eje ---------------- */
  // kp de la Tabla 2; L + τm ≈ D identificado. Ruido: el pitch rate tiene muy baja SNR (Fig. 11).
  const AXES = {
    roll: { name: 'Roll', sym: 'φ', kp: 0.0439, L: 0.020, tm: 0.028, nRate: 1.0, nAtt: 0.02 },
    pitch: { name: 'Pitch', sym: 'θ', kp: 0.0125, L: 0.050, tm: 0.060, nRate: 2.0, nAtt: 0.03 }
  };
  const UMAX = 32000;        // saturación del lazo de velocidad (cuentas de motor)
  const RATE_MAX = 300;      // saturación de la consigna de velocidad (°/s)

  class Axis {
    constructor(p, seed = 7) {
      this.p = Object.assign({}, p);
      this.delay = new IP.sim.DelayLine(Math.max(1, Math.round(p.L / DT)));
      this.m = 0; this.w = 0; this.th = 0; this.t = 0;
      this.rng = IP.sim.rng(seed);
      this.noise = true;
    }
    /** avanza un paso con la orden u; devuelve medidas con ruido {w, th} */
    step(u) {
      const ud = this.delay.push(u);
      this.m += DT * (ud - this.m) / this.p.tm;
      this.w += DT * this.p.kp * this.m;
      this.th += DT * this.w;
      this.t += DT;
      const k = this.noise ? 1 : 0;
      return { w: this.w + k * this.p.nRate * this.rng.gauss(), th: this.th + k * this.p.nAtt * this.rng.gauss() };
    }
  }

  /* ---------------- relé con histéresis ---------------- */
  class Relay {
    constructor(d, delta) { this.d = d; this.delta = delta; this.lvl = 1; }
    /** e = r − y. Conmuta a +d cuando e > δ y a −d cuando e < −δ. Devuelve {u, sw} */
    step(e) {
      let sw = 0;
      if (this.lvl < 0 && e > this.delta) { this.lvl = 1; sw = 1; }
      else if (this.lvl > 0 && e < -this.delta) { this.lvl = -1; sw = -1; }
      return { u: this.lvl * this.d, sw };
    }
  }

  /**
   * Estimador en línea del ciclo límite (como en el firmware):
   *  · Tu = tiempo entre conmutaciones ascendentes consecutivas
   *  · a  = (máx − mín)/2 de la salida en ese periodo
   *  · D  = tiempo entre una conmutación y el siguiente extremo de la salida
   */
  class CycleMeter {
    constructor() { this.reset(); }
    reset() { this.cycles = []; this.lastUp = null; this.lastSw = null; this.ymax = -Infinity; this.ymin = Infinity; this.ext = null; this.Ds = []; this.dir = 0; }
    push(t, y, sw) {
      if (this.lastUp !== null) { if (y > this.ymax) this.ymax = y; if (y < this.ymin) this.ymin = y; }
      // seguimiento del extremo posterior a la última conmutación
      if (this.lastSw !== null && this.ext) {
        if ((this.dir > 0 && y > this.ext.y) || (this.dir < 0 && y < this.ext.y)) this.ext = { t, y };
      }
      if (sw) {
        if (this.lastSw !== null && this.ext) this.Ds.push(this.ext.t - this.lastSw);
        this.lastSw = t; this.dir = sw > 0 ? -1 : 1; this.ext = { t, y };   // tras conmutar a +d la salida aún baja hasta un mínimo
        if (sw > 0) {
          if (this.lastUp !== null && this.ymax > this.ymin) this.cycles.push({ Tu: t - this.lastUp, a: (this.ymax - this.ymin) / 2, t });
          this.lastUp = t; this.ymax = -Infinity; this.ymin = Infinity;
        }
      }
    }
    /** media de los últimos n ciclos, descartando el primero (transitorio) */
    result(n = 3) {
      const c = this.cycles.slice(1).slice(-n);
      if (!c.length) return null;
      const Ds = this.Ds.slice(2).slice(-2 * n);
      return {
        Tu: c.reduce((s, x) => s + x.Tu, 0) / c.length,
        a: c.reduce((s, x) => s + x.a, 0) / c.length,
        Dmeas: Ds.length ? Ds.reduce((s, x) => s + x, 0) / Ds.length : NaN,
        n: this.cycles.length
      };
    }
  }

  /* ---------------- identificación (Sec. 4.1) ---------------- */
  function identify({ a, Tu, Dmeas, d, delta }) {
    const Ku = 4 * d / (Math.PI * Math.sqrt(Math.max(a * a - delta * delta, 1e-12)));   // ec. (7)
    const wu = 2 * Math.PI / Tu;
    const I = { kp: wu / Ku, D: Math.PI / (2 * wu) };                                 // ec. (8)
    const tau = Math.tan(Math.PI - Dmeas * wu) / wu;                                   // ec. (9)
    const F = { tau, kp: Math.sqrt((tau * wu) ** 2 + 1) / Ku, D: Dmeas };
    F.valid = Number.isFinite(tau) && tau > 0 && tau < 50 && Number.isFinite(F.kp);
    return { Ku, wu, Tu, a, I, F };
  }

  /* ---------------- reglas de sintonía (Tabla 1) ---------------- */
  /** rule: 'AMIGO PI' | 'AMIGO PID' | 'SIMC';  m: {kp, D, tau?};  type 'I' | 'F' */
  function tune(rule, m, type = 'I', tauc = null) {
    const { kp, D } = m, tau = m.tau;
    let K, Ti, Td = 0;
    if (type === 'I') {
      if (rule === 'AMIGO PI') { K = 0.35 / (kp * D); Ti = 13.4 * D; }
      else if (rule === 'AMIGO PID') { K = 0.45 / (kp * D); Ti = 8 * D; Td = 0.5 * D; }
      else { const tc = tauc ?? D; K = 1 / (kp * (tc + D)); Ti = 4 * (tc + D); }
    } else {
      if (rule === 'AMIGO PI') { K = 0.15 / kp + (0.35 - D * tau / (D + tau) ** 2) * tau / (kp * D); Ti = 0.35 * D + 13 * D * tau * tau / (tau * tau + 12 * D * tau + 7 * D * D); }
      else if (rule === 'AMIGO PID') { K = (0.2 + 0.45 * tau / D) / kp; Ti = (0.4 * D + 0.8 * tau) / (D + 0.1 * tau) * D; Td = 0.5 * D * tau / (0.3 * D + tau); }
      else { const tc = tauc ?? D; K = tau / (kp * (tc + D)); Ti = Math.min(tau, 4 * (tc + D)); }
    }
    return { Kp: K, Ki: K / Ti, Kd: K * Td, Ti, Td };
  }

  /* ---------------- disparo por eventos (ec. 11) ---------------- */
  /**
   * f = |e(t) − e(t_k)| − (c0 + ai·|e(t)| + cn(t)) > 0  ⇒ evento.
   * cn(t): nivel de ruido del error en una ventana de 0,2 s.
   * (En el firmware el término ai·|e| se satura a ai.)
   */
  class Trigger {
    constructor({ c0 = 0.5, ai = 0.05, win = 0.2, noiseTerm = true } = {}) {
      this.c0 = c0; this.ai = ai; this.noiseTerm = noiseTerm;
      this.std = new IP.sim.MovingStd(Math.round(win / DT));
      this.ek = null; this.th = c0; this.ep = null;
    }
    check(e, x) {
      // cₙ(t): nivel de ruido en una ventana de 0,2 s. Se estima con la desviación típica de los
      // incrementos de la medida x (σ(Δx)/√2): ni la tendencia del transitorio ni los saltos de
      // la referencia lo inflan. Sin x se usan los incrementos del error.
      const sig = x === undefined ? e : x;
      const de = this.ep === null ? 0 : sig - this.ep; this.ep = sig;
      const cn = this.std.push(de) / Math.SQRT2;
      this.th = this.c0 + this.ai * Math.abs(e) + (this.noiseTerm ? cn : 0);
      this.diff = this.ek === null ? Infinity : Math.abs(e - this.ek);
      if (this.diff > this.th) { this.ek = e; return true; }
      return false;
    }
  }

  /** PID con ejecución periódica o por eventos (dt real desde la última ejecución). */
  class Loop {
    constructor(g, umax, trig) {
      this.pid = new IP.sim.PID({ kp: g[0], ki: g[1], kd: g[2], umax });
      this.trig = trig || null; this.u = 0; this.tLast = 0; this.events = 0; this.calls = 0;
    }
    step(e, t, x) {
      this.calls++;
      if (!this.trig || this.trig.check(e, x)) {
        const dt = this.trig ? Math.max(DT, t - this.tLast) : DT;
        this.u = this.pid.step(e, dt); this.tLast = t; this.events++;
        return { u: this.u, ev: true };
      }
      return { u: this.u, ev: false };
    }
  }

  /* ---------------- respuesta en frecuencia (Nyquist) ---------------- */
  const C = {
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    exp: (ph) => [Math.cos(ph), Math.sin(ph)],
    abs: (a) => Math.hypot(a[0], a[1])
  };
  /** G de la velocidad: kp e^{-Ls} / (s (τm s + 1)) · filtro media móvil (opcional) */
  function Grate(ax, w, Tf = 0) {
    let g = C.div([ax.kp, 0], C.mul([0, w], [1, w * ax.tm]));
    g = C.mul(g, C.exp(-w * ax.L));
    if (Tf > 0) g = C.mul(g, C.div(C.add([1, 0], C.mul([-1, 0], C.exp(-w * Tf))), [0, w * Tf]));
    return g;
  }
  /** PID paralelo en jω (derivada sin filtro) */
  function Cpid(g, w) { return [g[0], g[2] * w - g[1] / w]; }
  /** G de la actitud vista por el relé: (1/s) · T_interno(jω) */
  function Gatt(ax, w, gRate) {
    const L = C.mul(Cpid(gRate, w), Grate(ax, w));
    const T = C.div(L, C.add([1, 0], L));
    return C.div(T, [0, w]);
  }
  /** Curva G(jω) con fase "desenrollada" para el intervalo [w0, w1] */
  function nyquist(fn, w0, w1, n = 400) {
    const out = []; let prev = null, off = 0;
    for (let i = 0; i < n; i++) {
      const w = w0 * Math.pow(w1 / w0, i / (n - 1));
      const g = fn(w); let ph = Math.atan2(g[1], g[0]);
      if (prev !== null) { while (ph + off - prev > Math.PI) off -= 2 * Math.PI; while (ph + off - prev < -Math.PI) off += 2 * Math.PI; }
      ph += off; prev = ph;
      out.push({ w, re: g[0], im: g[1], mag: C.abs(g), ph });
    }
    return out;
  }
  /** Predicción del ciclo límite por función descriptiva: G(jω) = −1/N(a) */
  function predictDF(curve, d, delta) {
    for (let i = 1; i < curve.length; i++) {
      const f = (p) => { const a = 4 * d * p.mag / Math.PI; if (a <= delta) return null; return p.ph + Math.PI - Math.asin(delta / a); };
      const f0 = f(curve[i - 1]), f1 = f(curve[i]);
      if (f0 === null || f1 === null) continue;
      if (f0 > 0 && f1 <= 0) {
        const s = f0 / (f0 - f1), p0 = curve[i - 1], p1 = curve[i];
        const w = p0.w * Math.pow(p1.w / p0.w, s), mag = p0.mag + s * (p1.mag - p0.mag);
        const a = 4 * d * mag / Math.PI;
        return { w, Tu: 2 * Math.PI / w, a, re: p0.re + s * (p1.re - p0.re), im: p0.im + s * (p1.im - p0.im) };
      }
    }
    return null;
  }

  /* ---------------- experimento completo (fuera de línea) ---------------- */
  /**
   * Simula la secuencia de la Fig. 24 en un eje:
   *   zona 1 (0–T1): controladores iniciales, perfil de consigna
   *   zona 2: relé en velocidad → modelo → PID de velocidad
   *   zona 3: relé en actitud (con el nuevo PID de velocidad) → modelo → PID de actitud
   *   zona 4: controladores autosintonizados, mismo perfil
   */
  function autotuneExperiment(o) {
    const ax = Object.assign({}, AXES[o.axis]);
    const plant = new Axis(ax, o.seed || 11); plant.noise = o.noise !== false;
    const prof = (tt) => (tt > 0.4 && tt < 2.4) ? o.step : 0;   // escalón de ida y vuelta
    const Tz = 4.0, Tr = o.rateRelayTime || 1.6, Ta = o.attRelayTime || 4.0;
    const T1 = Tz, T2 = T1 + Tr, T3 = T2 + Ta, T4 = T3 + Tz;
    const tr = { t: [], th: [], ref: [], w: [], u: [], wr: [], zone: [] };
    const gr0 = o.rate0, ga0 = o.att0;
    let rate = new Loop(gr0, UMAX), att = new Loop(ga0, RATE_MAX);
    const rRelay = new Relay(o.rateRelay.d, o.rateRelay.delta), aRelay = new Relay(o.attRelay.d, o.attRelay.delta);
    const mR = new CycleMeter(), mA = new CycleMeter();
    const fw = new IP.sim.MovingAvg(Math.round((o.filter ? 0.2 : DT) / DT));
    let u = 0, meas = { w: 0, th: 0 }, idR = null, idA = null, gR = null, gA = null, uEq = 0, wrEq = 0;
    let zone = 1, t = 0;
    const n = Math.round(T4 / DT);
    for (let k = 0; k < n; k++) {
      t = k * DT;
      meas = plant.step(u);
      let ref = 0, wr = 0;
      if (t < T1) { ref = prof(t); wr = att.step(ref - meas.th, t).u; u = rate.step(wr - meas.w, t).u; zone = 1; }
      else if (t < T2) {
        if (zone === 1) { uEq = 0; zone = 2; }
        const wf = fw.push(meas.w);
        const r = rRelay.step(0 - wf); u = uEq + r.u; mR.push(t, wf, r.sw); wr = 0;
      } else if (t < T3) {
        if (zone === 2) {
          const res = mR.result(3);
          idR = res ? identify({ a: res.a, Tu: res.Tu, Dmeas: res.Dmeas, d: o.rateRelay.d, delta: o.rateRelay.delta }) : null;
          gR = idR ? tune(o.rule, idR.I, 'I', o.taucRate) : { Kp: gr0[0], Ki: gr0[1], Kd: gr0[2] };
          rate = new Loop([gR.Kp, gR.Ki, gR.Kd], UMAX); wrEq = 0; zone = 3;
        }
        const r = aRelay.step(0 - meas.th); wr = wrEq + r.u; mA.push(t, meas.th, r.sw);
        u = rate.step(wr - meas.w, t).u;
      } else {
        if (zone === 3) {
          const res = mA.result(2);
          idA = res ? identify({ a: res.a, Tu: res.Tu, Dmeas: res.Dmeas, d: o.attRelay.d, delta: o.attRelay.delta }) : null;
          gA = idA ? tune(o.rule, idA.I, 'I', o.taucAtt) : { Kp: ga0[0], Ki: ga0[1], Kd: ga0[2] };
          att = new Loop([gA.Kp, gA.Ki, gA.Kd], RATE_MAX); zone = 4;
        }
        ref = prof(t - T3); wr = att.step(ref - meas.th, t).u; u = rate.step(wr - meas.w, t).u;
      }
      if (k % 2 === 0) { tr.t.push(t); tr.th.push(plant.th); tr.ref.push(ref); tr.w.push(meas.w); tr.u.push(u); tr.wr.push(wr); tr.zone.push(zone); }
    }
    const seg = (z, off) => {
      const tt = [], yy = [];
      // sólo el tramo del escalón de subida (consigna = step entre 0,4 y 2,4 s de la zona)
      tr.t.forEach((x, i) => { const r = x - off; if (tr.zone[i] === z && r < 2.4) { tt.push(r); yy.push(tr.th[i]); } });
      return IP.sim.stepMetrics(tt, yy, o.step, 0.4, 0);
    };
    return { tr, zones: [0, T1, T2, T3, T4], idR, idA, gR, gA, mR: mR.result(3), mA: mA.result(2), before: seg(1, 0), after: seg(4, T3) };
  }

  /**
   * Respuesta a escalón de actitud en cascada (para comparar sintonías).
   * ev: null | {level:'rate'|'att', c0, ai}
   */
  function stepResponse({ axis, rate, att, step = 10, T = 3, ev = null, noise = true, seed = 5, free = false }) {
    if (ev && ev.noiseTerm === undefined) ev.noiseTerm = true;
    const ax = Object.assign({}, AXES[axis]);
    if (free) { ax.kp *= 2.2; ax.L *= 0.8; }
    const plant = new Axis(ax, seed); plant.noise = noise;
    const trig = ev ? new Trigger({ c0: ev.c0, ai: ev.ai ?? 0.05, noiseTerm: ev.noiseTerm }) : null;
    const rl = new Loop(rate, UMAX, ev && ev.level === 'rate' ? trig : null);
    const al = new Loop(att, RATE_MAX, ev && ev.level === 'att' ? trig : null);
    const out = { t: [], th: [], ref: [], u: [], evT: [], evY: [], diff: [], thr: [] };
    let u = 0; const t0 = 0.3; const n = Math.round(T / DT);
    let unstable = false;
    for (let k = 0; k < n; k++) {
      const t = k * DT, m = plant.step(u), r = t >= t0 ? step : 0;
      const a = al.step(r - m.th, t, m.th), b = rl.step(a.u - m.w, t, m.w); u = b.u;
      const evNow = ev ? (ev.level === 'rate' ? b.ev : a.ev) : false;
      if (evNow) { out.evT.push(t); out.evY.push(plant.th); }
      if (Math.abs(plant.th) > 120) { unstable = true; }
      out.t.push(t); out.th.push(IP.clamp(plant.th, -200, 200)); out.ref.push(r); out.u.push(u);
      if (trig) { out.diff.push(Number.isFinite(trig.diff) ? trig.diff : NaN); out.thr.push(trig.th); }
    }
    const lvl = ev ? (ev.level === 'rate' ? rl : al) : al;
    const M = IP.sim.stepMetrics(out.t, out.th, step, t0, 0);
    M.events = lvl.events; M.calls = lvl.calls; M.unstable = unstable || M.os > 150;
    const span = (n * DT - t0);
    M.energy = out.u.reduce((s, v) => s + Math.abs(v), 0) * DT / span;
    out.metrics = M;
    return out;
  }

  global.RELAY = { DT, PAPER, AXES, UMAX, RATE_MAX, Axis, Relay, CycleMeter, identify, tune, Trigger, Loop, Grate, Gatt, Cpid, nyquist, predictDF, autotuneExperiment, stepResponse, Cx: C };
})(window);
