/* ============================================================
   Visor 3D del Open Gimbal + Crazyflie 2.1 (canvas 2D, sin WebGL)
   ------------------------------------------------------------
   Estructura en cascada (Mañas-Álvarez et al., 2026, Sec. 2):
     · anillo exterior vertical  → giro en yaw   (ψ, eje z)
     · anillo intermedio completo → giro en pitch (θ, eje y)
     · viga interior (verde)      → giro en roll  (φ, eje x)
   El dron va solidario a la viga de roll; los tres ejes se cortan
   en su centro de gravedad.

   new Gimbal3D(canvas, { az, el, autoRotate, interactive, compact })
     .setAngles(rollDeg, pitchDeg, yawDeg)
     .setMotors([m1, m2, m3, m4])    // 0..1, longitud de flechas de empuje
     .setLocks({ roll, pitch, yaw }) // ejes bloqueados se pintan atenuados
     .highlight('roll'|'pitch'|'yaw'|null)
     .render(dt)
   ============================================================ */
(function (global) {
  'use strict';
  const D2R = Math.PI / 180;

  function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function mul(A, B) {
    const C = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return C;
  }
  function app(M, p) { return [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]]; }
  function hexA(hex, a) {
    if (!hex) return `rgba(128,128,128,${a})`;
    if (hex.startsWith('rgb')) return hex.replace(/rgba?\(([^)]+)\)/, (m, g) => { const p = g.split(',').slice(0, 3); return `rgba(${p.join(',')},${a})`; });
    let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function shade(hex, k) {
    let h = (hex || '#888888').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    const f = (v) => Math.round(Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k))));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  class Gimbal3D {
    constructor(canvas, opts = {}) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.o = Object.assign({ az: -35, el: 18, dist: 6.2, autoRotate: 0, interactive: true, compact: false, showStand: true, showLabels: false }, opts);
      this.az = this.o.az; this.el = this.o.el;
      this.ang = { roll: 0, pitch: 0, yaw: 0 };
      this.motors = [0.5, 0.5, 0.5, 0.5];
      this.locks = { roll: false, pitch: false, yaw: false };
      this.hl = null; this.blade = 0;
      this.R1 = 1.32; this.R2 = 1.08; this.L = 1.0;
      if (this.o.interactive) this._drag();
    }
    setAngles(r, p, y) { this.ang.roll = r || 0; this.ang.pitch = p || 0; this.ang.yaw = y || 0; return this; }
    setMotors(m) { this.motors = m.slice(0, 4); return this; }
    setLocks(l) { Object.assign(this.locks, l); return this; }
    highlight(axis) { this.hl = axis; return this; }
    _drag() {
      let down = null;
      this.cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, az: this.az, el: this.el }; this.cv.setPointerCapture(e.pointerId); this._user = true; });
      this.cv.addEventListener('pointermove', (e) => {
        if (!down) return;
        this.az = down.az - (e.clientX - down.x) * 0.45;
        this.el = Math.max(-10, Math.min(80, down.el + (e.clientY - down.y) * 0.35));
      });
      const up = () => { down = null; };
      this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    }
    _colors() {
      const css = (n, d) => (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d);
      const dark = (css('color-scheme', 'light').includes('dark'));
      return {
        dark,
        roll: '#3fae7e',
        pitch: dark ? '#e9eeeb' : '#f4f6f5',
        pitchEdge: dark ? '#7d8a83' : '#9aa7a0',
        yaw: dark ? '#8d9a93' : '#7d8a83',
        stand: dark ? '#56625c' : '#5c6862',
        body: dark ? '#cfd6d2' : '#2a2f33',
        arm: dark ? '#aab4ae' : '#3b4246',
        prop: dark ? 'rgba(220,230,225,0.55)' : 'rgba(40,48,52,0.45)',
        thrust: css('--accent', '#d9782e'),
        hl: css('--accent', '#d9782e'),
        led: '#e74c3c',
        led2: '#3498db',
        shadow: dark ? 'rgba(0,0,0,0.5)' : 'rgba(20,30,25,0.18)'
      };
    }
    render(dt = 0) {
      const cv = this.cv, ctx = this.ctx;
      const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      if (this.o.autoRotate && !this._user) this.az += this.o.autoRotate * dt;
      const avg = this.motors.reduce((a, b) => a + b, 0) / 4;
      this.blade += dt * (18 + 40 * avg);
      const C = this._colors();

      // cámara
      const az = this.az * D2R, el = this.el * D2R;
      const V = mul(rotX(-(Math.PI / 2 - el)), rotZ(-az - Math.PI / 2));
      // escala: el anillo exterior (R ≈ 1,3) ocupa ~40 % del lado menor del lienzo
      const scale = Math.min(W, H) * (this.o.compact ? 0.27 : 0.255);
      const cx = W / 2, cy = H / 2 - (this.o.showStand ? H * 0.035 : 0);
      const P = (p) => {
        const q = app(V, p);
        const f = this.o.dist / (this.o.dist - q[2]);       // perspectiva
        return { x: cx + q[0] * scale * f, y: cy - q[1] * scale * f, z: q[2], f };
      };
      const prims = [];
      const line = (a, b, color, w, extra) => { const A = P(a), B = P(b); prims.push(Object.assign({ t: 'l', A, B, z: (A.z + B.z) / 2, color, w: w * (A.f + B.f) / 2 }, extra)); };
      const poly = (pts, fill, stroke, w, zb = 0) => { const Q = pts.map(P); prims.push({ t: 'p', Q, z: Q.reduce((s, q) => s + q.z, 0) / Q.length + zb, fill, stroke, w }); };

      const Ry = rotZ(this.ang.yaw * D2R);
      const Rp = mul(Ry, rotY(this.ang.pitch * D2R));
      const Rr = mul(Rp, rotX(this.ang.roll * D2R));
      const lockA = (ax) => this.locks[ax] ? 0.45 : 1;

      // soporte fijo
      const R1 = this.R1, R2 = this.R2;
      if (this.o.showStand) {
        const zb = -R1 - 0.42;
        const disc = []; for (let i = 0; i < 40; i++) { const a = i / 40 * 2 * Math.PI; disc.push([0.85 * Math.cos(a), 0.85 * Math.sin(a), zb]); }
        poly(disc, hexA(C.stand, 0.35), C.stand, 1.2, -50);
        line([0, 0, zb], [0, 0, -R1 - 0.04], C.stand, 7);
        // arco trasero que sujeta el cojinete superior
        const N = 28, Ra = R1 + 0.28; let prev = null;
        for (let i = 0; i <= N; i++) {
          const a = -Math.PI / 2 + i / N * Math.PI;
          const p = [-Ra * Math.cos(a), 0, Ra * Math.sin(a)];   // semicírculo detrás (x < 0)
          if (prev) line(prev, p, C.stand, 5);
          prev = p;
        }
        line([0, 0, -Ra], [0, 0, zb], C.stand, 5);
        line([0, 0, Ra], [0, 0, R1 + 0.02], C.stand, 5);
      }
      // sombra del dron en la base
      // anillo de yaw (vertical, plano y-z)
      const ring = (R, M, plane, color, edge, w, axis, alpha) => {
        const N = 72; let prev = null;
        const hl = this.hl === axis;
        for (let i = 0; i <= N; i++) {
          const a = i / N * 2 * Math.PI;
          const loc = plane === 'yz' ? [0, R * Math.cos(a), R * Math.sin(a)] : [R * Math.cos(a), R * Math.sin(a), 0];
          const p = app(M, loc);
          if (prev) {
            line(prev, p, edge, w + 2.4, { alpha });
            line(prev, p, hl ? C.hl : color, w, { alpha, light: true });
          }
          prev = p;
        }
      };
      ring(R1, Ry, 'yz', C.yaw, shade(C.yaw, -0.35), 4.2, 'yaw', lockA('yaw'));
      // cojinetes de yaw
      [[0, 0, R1], [0, 0, -R1]].forEach(p => line(p, [p[0], p[1], p[2] * 1.03], C.stand, 9));
      // ejes de pitch: del anillo de yaw al de pitch (en ±y)
      [[0, R1, 0], [0, -R1, 0]].forEach(p => line(app(Ry, p), app(Ry, [0, p[1] * R2 / R1 * 0.98, 0]), C.yaw, 5, { alpha: lockA('pitch') }));
      ring(R2, Rp, 'xy', C.pitch, C.pitchEdge, 6.5, 'pitch', lockA('pitch'));
      // viga de roll (en x) con ejes en el anillo de pitch
      const beamH = 0.07;
      line(app(Rp, [-R2, 0, 0]), app(Rp, [-this.L * 0.25, 0, 0]), C.pitchEdge, 4.5);
      line(app(Rp, [R2, 0, 0]), app(Rp, [this.L * 0.25, 0, 0]), C.pitchEdge, 4.5);
      const hlR = this.hl === 'roll';
      line(app(Rr, [-this.L * 0.98, 0, -beamH]), app(Rr, [this.L * 0.98, 0, -beamH]), shade(C.roll, -0.3), 9, { alpha: lockA('roll') });
      line(app(Rr, [-this.L * 0.98, 0, -beamH]), app(Rr, [this.L * 0.98, 0, -beamH]), hlR ? C.hl : C.roll, 6.5, { alpha: lockA('roll'), light: true });

      // Crazyflie (configuración X): brazos a 45°
      const arm = 0.44, zc = 0.03;
      // M1 delante-derecha, M2 detrás-derecha, M3 detrás-izquierda, M4 delante-izquierda (x hacia delante)
      const motorsLoc = [[arm, -arm, zc], [-arm, -arm, zc], [-arm, arm, zc], [arm, arm, zc]];
      // brazos
      motorsLoc.forEach(m => line(app(Rr, [0, 0, zc]), app(Rr, m), C.arm, 5));
      // placa central
      const bw = 0.17, bl = 0.24;
      poly([[-bl, -bw, zc + 0.01], [bl, -bw, zc + 0.01], [bl, bw, zc + 0.01], [-bl, bw, zc + 0.01]].map(p => app(Rr, p)), C.body, shade(C.body, 0.25), 1, 0.02);
      // LEDs (frontal en +x)
      line(app(Rr, [bl * 0.95, -0.06, zc + 0.03]), app(Rr, [bl * 0.95, -0.05, zc + 0.03]), C.led, 5);
      line(app(Rr, [-bl * 0.95, 0.06, zc + 0.03]), app(Rr, [-bl * 0.95, 0.05, zc + 0.03]), C.led2, 5);
      // motores, hélices y empuje
      motorsLoc.forEach((m, k) => {
        line(app(Rr, [m[0], m[1], zc - 0.05]), app(Rr, [m[0], m[1], zc + 0.06]), C.body, 7);
        const pr = 0.2, ring2 = [];
        for (let i = 0; i < 24; i++) { const a = i / 24 * 2 * Math.PI; ring2.push(app(Rr, [m[0] + pr * Math.cos(a), m[1] + pr * Math.sin(a), zc + 0.07])); }
        poly(ring2, C.prop.replace(/[\d.]+\)$/, '0.10)'), C.prop, 1, 0.01);
        const dir = (k % 2 ? -1 : 1);
        for (let b = 0; b < 2; b++) {
          const a = dir * this.blade + b * Math.PI;
          line(app(Rr, [m[0] - pr * 0.95 * Math.cos(a), m[1] - pr * 0.95 * Math.sin(a), zc + 0.07]), app(Rr, [m[0] + pr * 0.95 * Math.cos(a), m[1] + pr * 0.95 * Math.sin(a), zc + 0.07]), C.prop, 3);
        }
        const T = Math.max(0, Math.min(1, this.motors[k] ?? 0.5));
        if (T > 0.02) {
          const base = app(Rr, [m[0], m[1], zc + 0.1]), tip = app(Rr, [m[0], m[1], zc + 0.1 + 0.15 + 0.75 * T]);
          line(base, tip, C.thrust, 3.2, { arrow: true });
        }
      });

      // dibujar en orden de profundidad (lejos → cerca)
      prims.sort((a, b) => a.z - b.z);
      const zmin = -2.2, zmax = 2.2;
      for (const p of prims) {
        const depth = Math.max(0, Math.min(1, (p.z - zmin) / (zmax - zmin)));
        ctx.globalAlpha = (p.alpha ?? 1);
        if (p.t === 'l') {
          ctx.strokeStyle = p.light ? shade(toHex(p.color), (depth - 0.5) * 0.35) : p.color;
          ctx.lineWidth = Math.max(0.6, p.w * (0.75 + 0.35 * depth)); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.A.x, p.A.y); ctx.lineTo(p.B.x, p.B.y); ctx.stroke();
          if (p.arrow) {
            const ang = Math.atan2(p.B.y - p.A.y, p.B.x - p.A.x), s = 7;
            ctx.fillStyle = p.color; ctx.beginPath();
            ctx.moveTo(p.B.x + Math.cos(ang) * 3, p.B.y + Math.sin(ang) * 3);
            ctx.lineTo(p.B.x - Math.cos(ang - 0.5) * s, p.B.y - Math.sin(ang - 0.5) * s);
            ctx.lineTo(p.B.x - Math.cos(ang + 0.5) * s, p.B.y - Math.sin(ang + 0.5) * s);
            ctx.closePath(); ctx.fill();
          }
        } else {
          ctx.beginPath(); p.Q.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
          if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
          if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.w || 1; ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  function toHex(c) {
    if (!c || c[0] === '#') return c;
    const m = c.match(/\d+/g); if (!m) return '#888888';
    return '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('');
  }
  global.Gimbal3D = Gimbal3D;
})(window);
