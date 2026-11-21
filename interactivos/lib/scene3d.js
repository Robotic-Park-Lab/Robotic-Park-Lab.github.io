/* ============================================================
   IP.Scene3D — visor 3D ligero en canvas 2D (sin WebGL)
   ------------------------------------------------------------
   Modo inmediato: en cada frame se añaden primitivas y se llama
   a draw(); el visor las ordena por profundidad y las pinta con
   perspectiva. Arrastrar con el ratón (o el dedo) gira la cámara.

     const sc = new IP.Scene3D(canvas, { az: -40, el: 25, radius: 2, target: [0, 0, 0.5] });
     sc.begin();
     sc.line([0,0,0], [1,0,0], { color: '--s1', width: 2 });
     sc.polyline(puntos, { color: '--muted', closed: true, alpha: 0.5 });
     sc.point([0,0,1], { r: 5, color: '--accent' });
     sc.drone([0,0,1], { color: '--s1', size: 0.08 });
     sc.text([0,0,1.2], 'etiqueta');
     sc.draw(dt);

   Colores: nombres de token CSS ('--s1', '--accent'…) o cualquier color CSS.
   Requiere ip.js (usa IP.color e IP.onTheme).
   ============================================================ */
(function (global) {
  'use strict';
  const IP = global.IP;
  const D2R = Math.PI / 180;

  class Scene3D {
    constructor(canvas, o = {}) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ az: -40, el: 25, radius: 1.5, target: [0, 0, 0], dist: 6, autoRotate: 0, interactive: true, minEl: -5, maxEl: 89 }, o);
      this.az = this.o.az; this.el = this.o.el;
      this.prims = []; this._user = false; this._cache = {};
      if (this.o.interactive) this._drag();
      IP.onTheme(() => (this._cache = {}));
    }
    setView(az, el) { this.az = az; this.el = el; return this; }
    _drag() {
      let d = null;
      this.cv.style.touchAction = 'none';
      this.cv.addEventListener('pointerdown', (e) => { d = { x: e.clientX, y: e.clientY, az: this.az, el: this.el }; this.cv.setPointerCapture(e.pointerId); this._user = true; });
      this.cv.addEventListener('pointermove', (e) => {
        if (!d) return;
        this.az = d.az - (e.clientX - d.x) * 0.45;
        this.el = Math.max(this.o.minEl, Math.min(this.o.maxEl, d.el + (e.clientY - d.y) * 0.35));
        if (this.onChange) this.onChange();
      });
      const up = () => { d = null; };
      this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    }
    col(c) { if (!c) return IP.css('--text'); if (!(c in this._cache)) this._cache[c] = IP.color(c); return this._cache[c]; }
    begin() { this.prims.length = 0; return this; }
    line(a, b, s = {}) { this.prims.push({ t: 'l', a, b, s }); return this; }
    polyline(pts, s = {}) {
      const n = pts.length; if (n < 2) return this;
      for (let i = 0; i < n - 1; i++) this.prims.push({ t: 'l', a: pts[i], b: pts[i + 1], s });
      if (s.closed) this.prims.push({ t: 'l', a: pts[n - 1], b: pts[0], s });
      return this;
    }
    poly(pts, s = {}) { this.prims.push({ t: 'p', pts, s }); return this; }
    point(p, s = {}) { this.prims.push({ t: 'o', p, s }); return this; }
    text(p, str, s = {}) { this.prims.push({ t: 't', p, str, s }); return this; }
    /** Cuadricóptero esquemático en el plano horizontal, centrado en p. */
    drone(p, s = {}) {
      const k = s.size || 0.08, c = s.color || '--s1', w = s.width || 2;
      const arms = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
      arms.forEach(([x, y]) => {
        const m = [p[0] + x * k, p[1] + y * k, p[2]];
        this.line(p, m, { color: s.armColor || c, width: w });
        const ring = [];
        for (let i = 0; i < 10; i++) { const a = i / 10 * 2 * Math.PI; ring.push([m[0] + 0.55 * k * Math.cos(a), m[1] + 0.55 * k * Math.sin(a), m[2]]); }
        this.poly(ring, { fill: c, alpha: s.alpha ?? 0.25, stroke: c, width: 1 });
      });
      this.point(p, { r: s.dot ?? 3, color: c });
      return this;
    }
    /** Robot terrestre: disco en el plano horizontal con indicador de rumbo. */
    rover(p, heading = 0, s = {}) {
      const k = s.size || 0.1, c = s.color || '--s2', ring = [];
      for (let i = 0; i < 16; i++) { const a = i / 16 * 2 * Math.PI; ring.push([p[0] + k * Math.cos(a), p[1] + k * Math.sin(a), p[2] + 0.005]); }
      this.poly(ring, { fill: c, alpha: s.virtual ? 0.15 : 0.45, stroke: c, width: s.virtual ? 1 : 1.6 });
      this.line([p[0], p[1], p[2] + 0.01], [p[0] + k * Math.cos(heading), p[1] + k * Math.sin(heading), p[2] + 0.01], { color: c, width: 2.2 });
      return this;
    }
    _setup() {
      const cv = this.cv, W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return null;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { W, H };
    }
    /** Proyección de un punto del mundo a la pantalla: {x, y, z, f} */
    project(p) {
      const t = this.o.target, x = p[0] - t[0], y = p[1] - t[1], z = p[2] - t[2];
      const ca = Math.cos(this._a), sa = Math.sin(this._a), ce = Math.cos(this._e), se = Math.sin(this._e);
      const x1 = ca * x + sa * y, y1 = -sa * x + ca * y;      // giro azimutal
      const sx = y1, depth = x1 * ce + z * se, sy = -x1 * se + z * ce;   // elevación
      const f = this.o.dist / (this.o.dist - depth / this.o.radius * 1.2);
      return { x: this._cx + sx * this._s * f, y: this._cy - sy * this._s * f, z: depth, f };
    }
    draw(dt = 0) {
      const g = this._setup(); if (!g) return;
      const { W, H } = g, ctx = this.ctx;
      ctx.clearRect(0, 0, W, H);
      if (this.o.autoRotate && !this._user) this.az += this.o.autoRotate * dt;
      this._a = this.az * D2R; this._e = this.el * D2R;
      this._s = Math.min(W, H) * 0.42 / this.o.radius; this._cx = W / 2; this._cy = H / 2;
      const items = [];
      for (const q of this.prims) {
        if (q.t === 'l') { const A = this.project(q.a), B = this.project(q.b); items.push({ q, A, B, z: (A.z + B.z) / 2 + (q.s.zb || 0) }); }
        else if (q.t === 'p') { const Q = q.pts.map(p => this.project(p)); items.push({ q, Q, z: Q.reduce((s, v) => s + v.z, 0) / Q.length + (q.s.zb || 0) }); }
        else { const A = this.project(q.p); items.push({ q, A, z: A.z + (q.s.zb || 0) + 1e-6 }); }
      }
      items.sort((a, b) => a.z - b.z);
      const R = this.o.radius;
      const font = IP.css('--font') || 'sans-serif';
      for (const it of items) {
        const s = it.q.s, depthK = Math.max(0, Math.min(1, (it.z / R + 1.2) / 2.4));
        const fog = s.fog === false ? 1 : 0.45 + 0.55 * depthK;
        ctx.globalAlpha = (s.alpha ?? 1) * (it.q.t === 'p' ? 1 : fog);
        if (it.q.t === 'l') {
          ctx.strokeStyle = this.col(s.color); ctx.lineWidth = (s.width || 1.5) * (s.scaleWidth === false ? 1 : (it.A.f + it.B.f) / 2);
          ctx.setLineDash(s.dash || []); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(it.A.x, it.A.y); ctx.lineTo(it.B.x, it.B.y); ctx.stroke();
        } else if (it.q.t === 'p') {
          ctx.beginPath(); it.Q.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath();
          if (s.fill) { ctx.fillStyle = this.col(s.fill); ctx.globalAlpha = s.alpha ?? 0.2; ctx.fill(); }
          if (s.stroke) { ctx.strokeStyle = this.col(s.stroke); ctx.lineWidth = s.width || 1; ctx.globalAlpha = Math.min(1, (s.alpha ?? 0.2) * 2.5); ctx.setLineDash([]); ctx.stroke(); }
        } else if (it.q.t === 'o') {
          const r = (s.r || 4) * (s.scaleWidth === false ? 1 : it.A.f);
          ctx.fillStyle = this.col(s.color || '--accent'); ctx.beginPath(); ctx.arc(it.A.x, it.A.y, r, 0, 2 * Math.PI); ctx.fill();
          if (s.stroke) { ctx.strokeStyle = this.col(s.stroke); ctx.lineWidth = s.strokeWidth || 1.5; ctx.setLineDash([]); ctx.stroke(); }
        } else {
          ctx.fillStyle = this.col(s.color || '--muted'); ctx.font = `${s.weight || 600} ${s.size || 11}px ${font}`;
          ctx.textAlign = s.align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.q.str, it.A.x + (s.dx || 0), it.A.y + (s.dy || 0));
        }
      }
      ctx.globalAlpha = 1; ctx.setLineDash([]);
    }
    /** Índice del punto más cercano al cursor entre `pts` (para seleccionar agentes). */
    pick(clientX, clientY, pts, maxPx = 16) {
      const r = this.cv.getBoundingClientRect(), x = clientX - r.left, y = clientY - r.top;
      let best = -1, bd = maxPx;
      pts.forEach((p, i) => { const A = this.project(p); const d = Math.hypot(A.x - x, A.y - y); if (d < bd) { bd = d; best = i; } });
      return best;
    }
  }
  IP.Scene3D = Scene3D;
})(window);
