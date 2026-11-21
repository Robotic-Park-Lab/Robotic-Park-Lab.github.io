/* ============================================================
   MA — sistemas multi-robot con muestreo periódico o por eventos
   ------------------------------------------------------------
   Modelo jerárquico de Robotic Park:
     · capa de coordinación (10–100 Hz): calcula u_i con las últimas
       posiciones RECIBIDAS de los vecinos;
     · cada agente publica su posición periódicamente (f Hz) o sólo
       cuando se ha movido más de δ desde el último envío (send-on-delta,
       comprobado a fcheck Hz);
     · control individual (100–500 Hz): sigue la consigna de velocidad
       con un retardo de primer orden τ. Los robots terrestres tienen z fija.

   new MA.Swarm({
     agents: [{ type: 'cf'|'kh'|'tb'|'origin', p: [x,y,z], real: true,
                noise?: σ propio, every?: publica 1 de cada n periodos,
                wobble?: intensidad de la oscilación propia }],
     edges:  [[i, j, d*]],                         // control por distancias
     law:    'distance' | 'consensus',
     rel:    [[i, j, [dx,dy,dz]]],                 // consenso: p_j − p_i deseado
     mu, sphere: { R, c, k },                      // término de superficie (opcional)
     sampling: { mode: 'periodic', f } | { mode: 'event', delta, fcheck },
     fc: frecuencia de coordinación, tau, vmax, noise, seed, Ti (PI en consenso)
   })
   swarm.advance(T) · swarm.metrics() · MA.draw(scene, swarm, opts)
   ============================================================ */
(function (global) {
  'use strict';
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => Math.sqrt(dot(a, a));

  function rng(seed) {
    let s = (seed >>> 0) || 1;
    const u = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
    return { u, g: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) };
  }

  class Swarm {
    constructor(o) {
      Object.assign(this, { law: 'distance', mu: 1, fc: 10, tau: 0.25, vmax: 1, noise: 0, dt: 0.005, seed: 1, Ti: 0, sphere: null, track: null }, o);
      this.sampling = Object.assign({ mode: 'periodic', f: 10, delta: 0.02, fcheck: 50 }, o.sampling || {});
      const A = this.agents;
      this.N = A.length; this.rng = rng(this.seed);
      this.p = A.map(a => a.p.slice()); this.v = A.map(() => [0, 0, 0]); this.u = A.map(() => [0, 0, 0]);
      this.sent = this.p.map(q => q.slice());            // última posición publicada
      this.nb = A.map(() => []);
      (this.edges || []).forEach(([i, j, d], k) => { this.nb[i].push({ j, k, d }); this.nb[j].push({ j: i, k, d }); });
      (this.rel || []).forEach(([i, j, r], k) => { this.nb[i].push({ j, k, r }); this.nb[j].push({ j: i, k, r: r.map(x => -x) }); });
      this.integ = A.map(() => [0, 0, 0]); this.wob = A.map(() => [0, 0, 0]);
      this.t = 0; this.nextC = 0; this.nextS = 0; this.nextChk = 0;
      this.msgs = A.map(() => 0); this.execs = A.map(() => 0);
      this.hist = { t: [], e: [], eAgent: A.map(() => []), msgs: [] };
      this.iae = 0; this.itae = 0; this.trails = this.p.map(q => [q.slice()]); this.lastRec = -1;
      this.record();
    }
    measured(i) {   // medida con ruido del sistema de posicionamiento
      const q = this.p[i], sg = this.agents[i].noise ?? this.noise; if (!sg) return q.slice();   // ruido propio del agente (opcional)
      return [q[0] + sg * this.rng.g(), q[1] + sg * this.rng.g(), q[2] + sg * this.rng.g()];
    }
    publish() {
      const s = this.sampling; this.pubTick = (this.pubTick || 0) + 1;
      for (let i = 0; i < this.N; i++) {
        if (this.agents[i].type === 'origin') continue;
        if (s.mode === 'periodic' && this.agents[i].every > 1 && (this.pubTick - 1) % this.agents[i].every) continue;   // publica 1 de cada «every» ticks
        const m = this.measured(i);
        if (s.mode === 'periodic' || norm(sub(m, this.sent[i])) > s.delta) { this.sent[i] = m; this.msgs[i]++; }
      }
    }
    coordinate() {
      const dtc = 1 / this.fc;
      for (let i = 0; i < this.N; i++) {
        const a = this.agents[i]; if (a.type === 'origin') continue;
        const pi = this.measured(i); let u = [0, 0, 0];   // posición propia: fresca; vecinos: último mensaje recibido
        if (this.law === 'distance') {
          for (const { j, d } of this.nb[i]) { const z = sub(pi, this.sent[j]); u = add(u, mul(z, -this.mu * (dot(z, z) - d * d))); }
        } else {      // consenso con posiciones relativas deseadas (P o PI)
          let c = [0, 0, 0]; const n = this.nb[i].length || 1;
          for (const { j, r } of this.nb[i]) c = add(c, sub(sub(this.sent[j], pi), r));
          c = mul(c, 1 / n);
          if (this.Ti > 0) this.integ[i] = add(this.integ[i], mul(c, dtc));
          u = mul(add(c, this.Ti > 0 ? mul(this.integ[i], 1 / this.Ti) : [0, 0, 0]), this.mu);
        }
        if (this.sphere) { const S = this.sphere, w = sub(pi, S.c); u = add(u, mul(w, S.k * (S.R * S.R - dot(w, w)))); if (S.upper && w[2] < 0) u[2] += 2 * S.k * -w[2]; }   // upper: sólo el casquete z ≥ z0
        if (this.track && this.track[i]) { const q = this.track[i](this.t); if (q) u = add(u, mul(sub(q, pi), this.track.k || 1)); }
        if (a.type !== 'cf') u[2] = 0;
        const n = norm(u); if (n > this.vmax) u = mul(u, this.vmax / n);
        this.u[i] = u; this.execs[i]++;
      }
    }
    advance(T) {
      const steps = Math.max(1, Math.round(T / this.dt));
      for (let s = 0; s < steps; s++) {
        const s0 = this.sampling;
        if (s0.mode === 'periodic') { if (this.t >= this.nextS - 1e-9) { this.publish(); this.nextS += 1 / s0.f; } }
        else if (this.t >= this.nextChk - 1e-9) { this.publish(); this.nextChk += 1 / s0.fcheck; }
        if (this.t >= this.nextC - 1e-9) { this.coordinate(); this.nextC += 1 / this.fc; }
        for (let i = 0; i < this.N; i++) {
          if (this.agents[i].type === 'origin') continue;
          this.v[i] = add(this.v[i], mul(sub(this.u[i], this.v[i]), this.dt / this.tau));
          const wb = this.agents[i].wobble;   // oscilación propia (p. ej. dron en estacionario): Ornstein-Uhlenbeck en velocidad
          if (wb) { const w = this.wob[i]; for (let k = 0; k < 3; k++) { w[k] += -w[k] / 0.5 * this.dt + wb * Math.sqrt(this.dt) * this.rng.g(); } this.v[i] = add(this.v[i], mul(w, this.dt / this.tau)); }
          this.p[i] = add(this.p[i], mul(this.v[i], this.dt));
        }
        this.t += this.dt;
        const e = this.err(); this.iae += e * this.dt; this.itae += this.t * e * this.dt;
        if (this.t - this.lastRec >= 0.05 - 1e-9) { this.lastRec = this.t; this.record(e); }
      }
    }
    /** error global: Σ |d_ij − d*_ij| (distancias) o Σ ‖(p_j − p_i) − r*‖ (consenso) */
    err(perAgent) {
      const ea = perAgent ? this.p.map(() => 0) : null; let e = 0;
      (this.edges || []).forEach(([i, j, d]) => { const x = Math.abs(norm(sub(this.p[i], this.p[j])) - d); e += x; if (ea) { ea[i] += x / 2; ea[j] += x / 2; } });
      (this.rel || []).forEach(([i, j, r]) => { const w = sub(sub(this.p[j], this.p[i]), r); if (this.agents[i].type !== 'cf' || this.agents[j].type !== 'cf') { if (this.agents[i].type !== 'cf' && this.agents[j].type !== 'cf') w[2] = 0; } const x = norm(w); e += x; if (ea) { ea[i] += x / 2; ea[j] += x / 2; } });
      return perAgent ? ea : e;
    }
    record(e = this.err()) {
      this.hist.t.push(this.t); this.hist.e.push(e); this.hist.msgs.push(this.msgs.reduce((a, b) => a + b, 0));
      const ea = this.err(true); ea.forEach((x, i) => this.hist.eAgent[i].push(x));
      this.p.forEach((q, i) => { const tr = this.trails[i], l = tr[tr.length - 1]; if (norm(sub(q, l)) > 0.01) tr.push(q.slice()); });
    }
    /** tiempo de establecimiento: última vez que el error supera el `band` (2 %) del inicial */
    metrics(band = 0.02) {
      const h = this.hist, e0 = Math.max(...h.e.slice(0, 3)) || 1e-9; let te = 0;
      for (let k = h.e.length - 1; k >= 0; k--) if (h.e[k] > band * e0) { te = h.t[k]; break; }
      const msgs = this.msgs.reduce((a, b) => a + b, 0), execs = this.execs.reduce((a, b) => a + b, 0);
      const real = this.agents.filter(a => a.type !== 'origin').length;
      return { te, iae: this.iae, itae: this.itae, msgs, execs, Tmean: this.t * real / Math.max(1, msgs), e: h.e[h.e.length - 1] };
    }
  }

  /** Dibujo en IP.Scene3D: drones, robots terrestres, origen virtual, enlaces y trazas. */
  function draw(sc, sw, o = {}) {
    const col = o.colorOf || ((i) => (sw.agents[i].type === 'cf' ? '--s1' : sw.agents[i].type === 'origin' ? '--muted' : '--s2'));
    if (o.ground) { const g = o.ground, r = []; for (let k = 0; k <= 48; k++) { const a = k / 48 * 2 * Math.PI; r.push([g * Math.cos(a), g * Math.sin(a), 0]); } sc.poly(r, { fill: o.groundFill || '--surface-2', alpha: o.groundAlpha ?? 0.55, stroke: o.groundStroke || '--border', zb: -2e3 }); }
    if (o.box) { const [bx, by, bz] = o.box, c = [[-bx, -by], [bx, -by], [bx, by], [-bx, by]]; c.forEach((q, k) => { const n = c[(k + 1) % 4]; sc.line([q[0], q[1], 0], [n[0], n[1], 0], { color: '--border', width: 1 }); sc.line([q[0], q[1], bz], [n[0], n[1], bz], { color: '--border', width: 0.6, alpha: 0.5 }); sc.line([q[0], q[1], 0], [q[0], q[1], bz], { color: '--border', width: 0.6, alpha: 0.5 }); }); }
    if (o.trails !== false) sw.trails.forEach((tr, i) => { if (tr.length > 1) sc.polyline(tr, { color: col(i), width: 1, alpha: 0.4 }); });
    (sw.edges || sw.rel || []).forEach((e, k) => {
      const [i, j] = e; let bad = false;
      if (sw.edges) bad = Math.abs(norm(sub(sw.p[i], sw.p[j])) - e[2]) / e[2] > 0.1;
      sc.line(sw.p[i], sw.p[j], { color: bad ? '--s2' : '--s3', width: 1.3, alpha: 0.7, dash: sw.agents[i].type === 'origin' || sw.agents[j].type === 'origin' ? [4, 4] : [] });
    });
    sw.p.forEach((q, i) => {
      const a = sw.agents[i], s = o.size || 0.08, c = col(i);
      if (a.type === 'cf') sc.drone(q, { color: c, size: s, alpha: a.real === false ? 0.12 : 0.3 });
      else if (a.type === 'origin') sc.point(q, { r: 5, color: '--muted', stroke: '--surface' });
      else sc.rover(q, Math.atan2(sw.v[i][1], sw.v[i][0]), { color: c, size: s * 1.3, virtual: a.real === false });
      if (o.labels && a.name) sc.text(q, a.name, { dy: -14, size: 10, color: c });
    });
  }

  global.MA = { Swarm, draw, rng, v: { sub, add, mul, dot, norm } };
})(window);
