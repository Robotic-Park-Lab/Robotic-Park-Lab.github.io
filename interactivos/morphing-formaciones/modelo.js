/* ============================================================
   MORPH — morphing distribuido de formaciones sobre semielipsoides
   («Morphing de formaciones en sistemas multi-agente robóticos», Simposio CEA 2026)
   ------------------------------------------------------------
   Fase 1 (0 – tm): control por distancias + restricción de superficie
     u_i = −k1 Σ_j (‖p_i − p_j‖² − d*_ij²)(p_i − p_j) − (k2/2) f_i(p_i) ∇f_i(p_i)
   (equivalente a la ley de Guinaldo et al., 2024) hacia el semielipsoide inicial.
   Fase 2 (t ≥ tm): la geometría cambia de los semiejes A0 a A1.
     · 'switch': conmutación brusca (todas las consignas cambian a la vez).
     · 'morph':  cada agente tiene su propio parámetro de transición s_i ∈ [0, 1];
                 un agente informado sigue un perfil suave s_ref(t) (polinomio de
                 grado 5) y el resto lo acuerda por consenso con sus vecinos:
                 ṡ_i = γ Σ_j (s_j − s_i) [+ γ (s_ref − s_i) si está informado].
     Cada arista usa d*_ij(s̄), s̄ = (s_i + s_j)/2, y cada agente su superficie S(s_i).
   La formación objetivo para cada s se obtiene escalando la inicial
   (P_i(s) = P_i(0) ⊙ A(s) / A0), así siempre está sobre S(s).
   Implementación didáctica del marco propuesto en el artículo.
   ============================================================ */
(function (global) {
  'use strict';
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => Math.sqrt(dot(a, a));
  const lerp = (A, B, s) => A.map((x, k) => x + (B[k] - x) * s);
  const quintic = (x) => { const s = Math.max(0, Math.min(1, x)); return s * s * s * (10 - 15 * s + 6 * s * s); };

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  }

  const TARGETS = {
    corridor: { A: [1.45, 0.62, 1.0] },     // pasillo estrecho
    ceiling: { A: [1.3, 1.3, 0.55] },       // techo bajo
    expand: { A: [1.35, 1.35, 1.35] }        // cubrir más superficie
  };

  class Sim {
    /**
     * new MORPH.Sim({ F, A0, A1, mode: 'morph'|'switch', tm, Tm, k1, k2, gamma, umax, tau, seed, informed })
     *   F: formación de FORM.buildShield sobre el semielipsoide A0
     */
    constructor(o) {
      Object.assign(this, { mode: 'morph', tm: 10, Tm: 8, k1: 0.6, k2: 1.2, gamma: 4, umax: 0.8, tau: 0.2, dt: 0.01, seed: 3, informed: null, rho: 0.35 }, o);
      const F = this.F, N = F.P.length, r = rng(this.seed);
      this.N = N; this.P0 = F.P.map(q => q.slice());
      this.p = this.P0.map(q => [q[0] * 0.8 + (r() - 0.5) * this.rho * 2, q[1] * 0.8 + (r() - 0.5) * this.rho * 2, Math.max(0.05, q[2] * 0.4 + (r() - 0.5) * this.rho)]);   // despegue: posiciones bajas cerca de la formación
      this.v = this.p.map(() => [0, 0, 0]); this.s = new Array(N).fill(0);
      if (this.informed === null) { let top = 0; this.P0.forEach((q, i) => { if (q[2] > this.P0[top][2]) top = i; }); this.informed = top; }
      this.t = 0; this.hist = { t: [], ed: [], es: [], umax: [], s: this.p.map(() => []), sref: [] }; this.lastRec = -1;
      this.trails = this.p.map(q => [q.slice()]); this.uRaw = this.p.map(() => 0);
      this.record();
    }
    axes(s) { return lerp(this.A0, this.A1, s); }
    target(i, s) { const A = this.axes(s); return [this.P0[i][0] * A[0] / this.A0[0], this.P0[i][1] * A[1] / this.A0[1], this.P0[i][2] * A[2] / this.A0[2]]; }
    dstar(k, s) { const [i, j] = this.F.edges[k]; return norm(sub(this.target(i, s), this.target(j, s))); }
    sref(t) { return t < this.tm ? 0 : this.mode === 'switch' ? 1 : quintic((t - this.tm) / this.Tm); }
    step() {
      const dt = this.dt, F = this.F, N = this.N, t = this.t;
      // transición: conmutación brusca o consenso sobre s
      if (this.mode === 'switch') { const v = this.sref(t); this.s.fill(v); }
      else {
        const ds = this.s.map((si, i) => {
          let d = 0; F.nb[i].forEach(([j]) => { d += this.s[j] - si; });
          if (i === this.informed) d += this.sref(t) - si;
          return this.gamma * d;
        });
        this.s = this.s.map((si, i) => Math.max(0, Math.min(1, si + ds[i] * dt)));
      }
      let um = 0;
      const u = this.p.map((pi, i) => {
        let w = [0, 0, 0];
        F.nb[i].forEach(([j, k]) => { const z = sub(pi, this.p[j]), d = this.dstar(k, (this.s[i] + this.s[j]) / 2); w = sub(w, mul(z, this.k1 * (dot(z, z) - d * d))); });
        const A = this.axes(this.s[i]), A2 = A.map(a => a * a);
        const f = pi[0] * pi[0] / A2[0] + pi[1] * pi[1] / A2[1] + pi[2] * pi[2] / A2[2] - 1;
        w = sub(w, mul([2 * pi[0] / A2[0], 2 * pi[1] / A2[1], 2 * pi[2] / A2[2]], this.k2 / 2 * f));
        const n = norm(w); this.uRaw[i] = n; um = Math.max(um, n);
        return n > this.umax ? mul(w, this.umax / n) : w;
      });
      this.um = um;
      for (let i = 0; i < N; i++) {
        this.v[i] = add(this.v[i], mul(sub(u[i], this.v[i]), dt / this.tau));
        this.p[i] = add(this.p[i], mul(this.v[i], dt));
        if (this.p[i][2] < 0.02) this.p[i][2] = 0.02;
      }
      this.t += dt;
      if (this.t - this.lastRec >= 0.05 - 1e-9) {
        this.record();
        this.p.forEach((q, i) => { const tr = this.trails[i]; if (norm(sub(q, tr[tr.length - 1])) > 0.01) tr.push(q.slice()); });
      }
    }
    advance(T) { const n = Math.max(1, Math.round(T / this.dt)); for (let k = 0; k < n; k++) this.step(); }
    record() {
      this.lastRec = this.t; const F = this.F; let ed = 0, es = 0;
      F.edges.forEach(([i, j], k) => { ed += Math.abs(norm(sub(this.p[i], this.p[j])) - this.dstar(k, (this.s[i] + this.s[j]) / 2)); });
      this.p.forEach((q, i) => { const A = this.axes(this.s[i]); es += Math.abs(q[0] * q[0] / A[0] ** 2 + q[1] * q[1] / A[1] ** 2 + q[2] * q[2] / A[2] ** 2 - 1); });
      const h = this.hist; h.t.push(this.t); h.ed.push(ed); h.es.push(es); h.umax.push(this.um || 0); h.sref.push(this.sref(this.t));
      this.s.forEach((x, i) => h.s[i].push(x));
    }
    /** pico de ‖u‖ (sin saturar) y error máximo de distancias tras el inicio de la transición */
    summary() {
      const h = this.hist, k0 = h.t.findIndex(t => t >= this.tm);
      const um = Math.max(...h.umax.slice(k0)), ed = Math.max(...h.ed.slice(k0));
      let ts = 0; const tol = 0.02 * this.F.edges.length;
      for (let k = h.t.length - 1; k >= k0; k--) if (h.ed[k] > tol) { ts = h.t[k] - this.tm; break; }
      return { umPeak: um, edPeak: ed, settle: ts };
    }
  }

  global.MORPH = { Sim, TARGETS, quintic, v: { sub, add, mul, dot, norm } };
})(typeof window !== 'undefined' ? window : globalThis);
