/* ============================================================
   Robotic Park Lab — librería "ip" para páginas interactivas
   ------------------------------------------------------------
   Sin dependencias. Expone el objeto global `IP` con:

     IP.controls(el, specs, onChange)   sliders / selects / toggles
     IP.seg(el, options, value, onChange) botones segmentados
     new IP.Plot(el, opts)              gráfica en canvas (HiDPI,
                                        tooltip, leyenda, ejes)
     IP.conceptMap(el, map, opts)       mapa conceptual SVG clicable
     IP.quiz(el, preguntas)             autoevaluación con feedback
     IP.tabs(el)                        pestañas accesibles
     IP.animate(el, step)               bucle rAF que se pausa
                                        fuera de pantalla
     IP.sim.{DelayLine, PID, MovingStd} bloques de simulación
     IP.page({ ... })                   inicialización estándar:
                                        menú, barra de progreso,
                                        reveal, KaTeX, copiar

   Cada página interactiva carga ip.css + ip.js y después su
   propio app.js. Consulta interactivos/README.md.
   ============================================================ */
(function (global) {
  'use strict';

  const IP = {};
  IP.version = '1.0.0';
  /** Errores de JavaScript capturados (útil para depurar páginas nuevas: IP.errors en la consola). */
  IP.errors = [];
  global.addEventListener('error', (e) => IP.errors.push(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));

  /* ---------------- utilidades ---------------- */
  IP.$ = (s, r = document) => r.querySelector(s);
  IP.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  IP.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  IP.lerp = (a, b, t) => a + (b - a) * t;
  IP.css = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();
  IP.color = (c) => (typeof c === 'string' && c.startsWith('--')) ? IP.css(c) : c;

  /** Formato numérico en español (coma decimal). */
  IP.fmt = function (v, d = 2) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e6 || a < Math.pow(10, -d))) {
      const [m, e] = v.toExponential(Math.max(1, d)).split('e');
      return m.replace('.', ',') + '·10' + IP.sup(parseInt(e, 10));
    }
    return v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  IP.sup = (n) => String(n).split('').map(ch => ({ '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }[ch] || ch)).join('');
  IP.el = function (tag, attrs = {}, html) {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  IP.svg = function (tag, attrs = {}) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  IP.debounce = function (fn, ms = 60) {
    let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  };
  IP.reducedMotion = () => global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Llama a cb cuando cambia el tema (sistema o atributo data-theme). */
  const themeCbs = [];
  IP.onTheme = (cb) => themeCbs.push(cb);
  if (global.matchMedia) {
    const mq = global.matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => themeCbs.forEach(f => f()));
  }
  new MutationObserver(() => themeCbs.forEach(f => f())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------------- controles ---------------- */
  /**
   * specs: [{ id, label, sym?, type:'range'|'select'|'toggle', min, max, step, value,
   *           unit?, digits?, options?:[{value,label}], hint?, format?(v) }]
   * Devuelve { values, get(id), set(id, v, silent), el(id) }.
   */
  IP.controls = function (container, specs, onChange) {
    const values = {}, els = {};
    container.classList.add('ip-controls');
    const fire = (id) => onChange && onChange(values, id);
    specs.forEach(sp => {
      const wrap = IP.el('div', { class: 'ip-control' });
      const type = sp.type || 'range';
      if (type === 'toggle') {
        const lab = IP.el('label', { class: 'ip-toggle', style: 'justify-content:flex-start' });
        const inp = IP.el('input', { type: 'checkbox', id: 'ipc-' + sp.id });
        inp.checked = !!sp.value; values[sp.id] = !!sp.value;
        inp.addEventListener('change', () => { values[sp.id] = inp.checked; fire(sp.id); });
        lab.append(inp, document.createTextNode(sp.label));
        wrap.append(lab); els[sp.id] = inp;
      } else if (type === 'select') {
        const lab = IP.el('label', { for: 'ipc-' + sp.id }, `<span>${sp.label}</span>`);
        const sel = IP.el('select', { id: 'ipc-' + sp.id });
        sp.options.forEach(o => sel.append(IP.el('option', { value: o.value }, o.label)));
        sel.value = sp.value; values[sp.id] = sp.value;
        sel.addEventListener('change', () => { values[sp.id] = sel.value; fire(sp.id); });
        wrap.append(lab, sel); els[sp.id] = sel;
      } else {
        const out = IP.el('output', { for: 'ipc-' + sp.id });
        const lab = IP.el('label', { for: 'ipc-' + sp.id }, `<span>${sp.label}${sp.sym ? `<span class="ip-sym">${sp.sym}</span>` : ''}</span>`);
        lab.append(out);
        const inp = IP.el('input', { type: 'range', id: 'ipc-' + sp.id, min: sp.min, max: sp.max, step: sp.step || 'any' });
        const fmt = sp.format || (v => IP.fmt(v, sp.digits ?? 2) + (sp.unit ? ' ' + sp.unit : ''));
        const paint = () => {
          const v = parseFloat(inp.value);
          out.textContent = fmt(v);
          inp.style.setProperty('--p', ((v - sp.min) / (sp.max - sp.min) * 100) + '%');
        };
        inp.value = sp.value; values[sp.id] = parseFloat(sp.value); paint();
        inp.addEventListener('input', () => { values[sp.id] = parseFloat(inp.value); paint(); fire(sp.id); });
        inp._paint = paint;
        wrap.append(lab, inp); els[sp.id] = inp;
      }
      if (sp.hint) wrap.append(IP.el('div', { class: 'ip-hint' }, sp.hint));
      container.append(wrap);
    });
    return {
      values,
      get: (id) => values[id],
      el: (id) => els[id],
      set(id, v, silent) {
        const e = els[id]; if (!e) return;
        if (e.type === 'checkbox') { e.checked = !!v; values[id] = !!v; }
        else if (e.tagName === 'SELECT') { e.value = v; values[id] = v; }
        else { e.value = v; values[id] = parseFloat(e.value); e._paint && e._paint(); }
        if (!silent) fire(id);
      }
    };
  };

  /** Botones segmentados: options [{value,label}] */
  IP.seg = function (container, options, value, onChange) {
    container.classList.add('ip-seg');
    container.setAttribute('role', 'group');
    const btns = options.map(o => {
      const b = IP.el('button', { type: 'button', 'aria-pressed': String(o.value === value) }, o.label);
      b.addEventListener('click', () => { api.set(o.value); onChange && onChange(o.value); });
      container.append(b); return b;
    });
    const api = {
      value,
      set(v) { api.value = v; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v))); }
    };
    return api;
  };

  /* ---------------- gráfica en canvas ---------------- */
  function niceStep(range, target) {
    const raw = range / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  function ticks(a, b, target) {
    if (!(b > a)) return [a];
    const st = niceStep(b - a, target), out = [];
    for (let v = Math.ceil(a / st) * st; v <= b + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
    return out;
  }
  function tickFmt(v, step) {
    const d = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
    return v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  /**
   * new IP.Plot(container, {
   *   height: 260, xlabel, ylabel, xlim:[a,b]|null, ylim:[a,b]|null, equal:false,
   *   legend:true, tooltip:true, xunit:'', yunit:'', padY:0.08
   * })
   * plot.setSeries([{ name, color:'--s1', x:[], y:[], width:2, dash:[], step:false,
   *                   fill:false, points:false, hidden:false }])
   * plot.overlays = { hlines:[{y,color,dash,label}], vlines:[{x,...}], bands:[{y0,y1,color}],
   *                   markers:[{x,y,color,r,label}], texts:[{x,y,text,color,align}] }
   */
  class Plot {
    constructor(container, opts = {}) {
      this.opts = Object.assign({ height: 260, legend: true, tooltip: true, padY: 0.08, equal: false, xunit: '', yunit: '' }, opts);
      this.container = container;
      container.classList.add('ip-plot');
      container.style.height = this.opts.height + 'px';
      this.canvas = IP.el('canvas');
      this.tip = IP.el('div', { class: 'ip-plot-tip' });
      container.append(this.canvas, this.tip);
      if (this.opts.legend) {
        this.legendEl = IP.el('div', { class: 'ip-legend' });
        container.after(this.legendEl);
      }
      this.series = [];
      this.overlays = {};
      this.ctx = this.canvas.getContext('2d');
      this._hoverX = null;
      const ro = new ResizeObserver(() => this.draw());
      ro.observe(container);
      IP.onTheme(() => this.draw());
      if (this.opts.tooltip) {
        const move = (ev) => {
          const r = this.canvas.getBoundingClientRect();
          const p = ev.touches ? ev.touches[0] : ev;
          this._hover = { px: p.clientX - r.left, py: p.clientY - r.top };
          this.draw();
        };
        this.canvas.addEventListener('mousemove', move);
        this.canvas.addEventListener('touchstart', move, { passive: true });
        this.canvas.addEventListener('touchmove', move, { passive: true });
        const leave = () => { this._hover = null; this.tip.style.opacity = 0; this.draw(); };
        this.canvas.addEventListener('mouseleave', leave);
        this.canvas.addEventListener('touchend', leave);
      }
    }
    setSeries(series) {
      this.series = series;
      const sig = series.filter(s => s.name && !s.nolegend).map(s => s.name + s.color + (s.dash || []).length).join('|');
      if (sig !== this._sig) { this._sig = sig; this._legend(); }
      this.draw(); return this;
    }
    _legend() {
      if (!this.legendEl) return;
      this.legendEl.innerHTML = '';
      this.series.filter(s => s.name && !s.nolegend).forEach(s => {
        const c = IP.color(s.color || '--s1');
        const i = IP.el('i', { class: s.dash && s.dash.length ? 'dash' : '', style: `background:${c};color:${c}` });
        const sp = IP.el('span'); sp.append(i, document.createTextNode(s.name));
        this.legendEl.append(sp);
      });
    }
    _range() {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const s of this.series) {
        if (s.hidden || s.noscale) continue;
        const n = s.x.length;
        for (let i = 0; i < n; i++) {
          const x = s.x[i], y = s.y[i];
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      const ov = this.overlays || {};
      (ov.hlines || []).forEach(h => { if (h.scale !== false) { y0 = Math.min(y0, h.y); y1 = Math.max(y1, h.y); } });
      (ov.markers || []).forEach(m => { if (m.scale !== false) { x0 = Math.min(x0, m.x); x1 = Math.max(x1, m.x); y0 = Math.min(y0, m.y); y1 = Math.max(y1, m.y); } });
      if (!Number.isFinite(x0)) { x0 = 0; x1 = 1; }
      if (!Number.isFinite(y0)) { y0 = -1; y1 = 1; }
      if (this.opts.xlim) [x0, x1] = this.opts.xlim;
      if (this.opts.ylim) [y0, y1] = this.opts.ylim;
      else {
        if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
        const p = (y1 - y0) * this.opts.padY; y0 -= p; y1 += p;
        if (this.opts.yMinSpan && y1 - y0 < this.opts.yMinSpan) { const c = (y0 + y1) / 2; y0 = c - this.opts.yMinSpan / 2; y1 = c + this.opts.yMinSpan / 2; }
      }
      if (x1 - x0 < 1e-12) x1 = x0 + 1;
      return { x0, x1, y0, y1 };
    }
    draw() {
      const cv = this.canvas, ctx = this.ctx;
      const W = this.container.clientWidth, H = this.container.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(global.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const font = IP.css('--font') || 'sans-serif';
      const axisC = IP.css('--axis'), gridC = IP.css('--grid'), mutedC = IP.css('--muted');
      const ml = this.opts.ylabel ? 58 : 46, mr = 12, mt = 10, mb = this.opts.xlabel ? 40 : 26;
      const pw = Math.max(10, W - ml - mr), ph = Math.max(10, H - mt - mb);
      let { x0, x1, y0, y1 } = this._range();
      if (this.opts.equal) {
        const sx = (x1 - x0) / pw, sy = (y1 - y0) / ph, s = Math.max(sx, sy);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        x0 = cx - s * pw / 2; x1 = cx + s * pw / 2; y0 = cy - s * ph / 2; y1 = cy + s * ph / 2;
      }
      this.view = { x0, x1, y0, y1, ml, mt, pw, ph };
      const X = (x) => ml + (x - x0) / (x1 - x0) * pw;
      const Y = (y) => mt + (1 - (y - y0) / (y1 - y0)) * ph;
      this.X = X; this.Y = Y;

      // rejilla y ticks
      ctx.font = `11px ${font}`;
      ctx.fillStyle = mutedC; ctx.strokeStyle = gridC; ctx.lineWidth = 1;
      const xt = ticks(x0, x1, Math.max(3, Math.floor(pw / 90))), yt = ticks(y0, y1, Math.max(3, Math.floor(ph / 45)));
      const xs = xt.length > 1 ? xt[1] - xt[0] : 1, ys = yt.length > 1 ? yt[1] - yt[0] : 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      xt.forEach(v => { const px = X(v); ctx.beginPath(); ctx.moveTo(px, mt); ctx.lineTo(px, mt + ph); ctx.stroke(); ctx.fillText(tickFmt(v, xs), px, mt + ph + 6); });
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      yt.forEach(v => { const py = Y(v); ctx.beginPath(); ctx.moveTo(ml, py); ctx.lineTo(ml + pw, py); ctx.stroke(); ctx.fillText(tickFmt(v, ys), ml - 6, py); });
      ctx.strokeStyle = axisC; ctx.strokeRect(ml + 0.5, mt + 0.5, pw - 1, ph - 1);
      if (y0 < 0 && y1 > 0) { ctx.beginPath(); ctx.moveTo(ml, Y(0)); ctx.lineTo(ml + pw, Y(0)); ctx.stroke(); }
      if (this.opts.equal && x0 < 0 && x1 > 0) { ctx.beginPath(); ctx.moveTo(X(0), mt); ctx.lineTo(X(0), mt + ph); ctx.stroke(); }
      ctx.fillStyle = mutedC; ctx.font = `600 11.5px ${font}`;
      if (this.opts.xlabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(this.opts.xlabel, ml + pw / 2, H - 2); }
      if (this.opts.ylabel) { ctx.save(); ctx.translate(12, mt + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(this.opts.ylabel, 0, -2); ctx.restore(); }

      ctx.save();
      ctx.beginPath(); ctx.rect(ml, mt, pw, ph); ctx.clip();
      const ov = this.overlays || {};
      (ov.bands || []).forEach(b => {
        ctx.fillStyle = IP.color(b.color || '--primary-soft'); ctx.globalAlpha = b.alpha ?? 0.6;
        if (b.y0 !== undefined) ctx.fillRect(ml, Y(b.y1), pw, Y(b.y0) - Y(b.y1));
        else ctx.fillRect(X(b.x0), mt, X(b.x1) - X(b.x0), ph);
        ctx.globalAlpha = 1;
      });
      // series
      for (const s of this.series) {
        if (s.hidden) continue;
        const c = IP.color(s.color || '--s1');
        const n = s.x.length; if (!n) continue;
        ctx.strokeStyle = c; ctx.lineWidth = s.width || 2; ctx.setLineDash(s.dash || []);
        ctx.lineJoin = 'round'; ctx.globalAlpha = s.alpha ?? 1;
        // decimación: como mucho ~2 puntos por píxel
        const stride = Math.max(1, Math.floor(n / (pw * 2)));
        if (s.points) {
          ctx.fillStyle = c;
          for (let i = 0; i < n; i += stride) { if (!Number.isFinite(s.y[i])) continue; ctx.beginPath(); ctx.arc(X(s.x[i]), Y(s.y[i]), s.r || 3, 0, 2 * Math.PI); ctx.fill(); }
        } else {
          ctx.beginPath(); let pen = false, lastY = 0;
          for (let i = 0; i < n; i += stride) {
            const xv = s.x[i], yv = s.y[i];
            if (!Number.isFinite(yv) || !Number.isFinite(xv)) { pen = false; continue; }
            const px = X(xv), py = Y(yv);
            if (!pen) { ctx.moveTo(px, py); pen = true; }
            else if (s.step) { ctx.lineTo(px, lastY); ctx.lineTo(px, py); }
            else ctx.lineTo(px, py);
            lastY = py;
          }
          ctx.stroke();
          if (s.fill) {
            ctx.lineTo(X(s.x[n - 1]), Y(Math.max(y0, 0))); ctx.lineTo(X(s.x[0]), Y(Math.max(y0, 0))); ctx.closePath();
            ctx.globalAlpha = 0.12; ctx.fillStyle = c; ctx.fill();
          }
        }
        ctx.globalAlpha = 1; ctx.setLineDash([]);
      }
      (ov.hlines || []).forEach(h => {
        ctx.strokeStyle = IP.color(h.color || '--axis'); ctx.setLineDash(h.dash || [5, 4]); ctx.lineWidth = h.width || 1.3;
        ctx.beginPath(); ctx.moveTo(ml, Y(h.y)); ctx.lineTo(ml + pw, Y(h.y)); ctx.stroke(); ctx.setLineDash([]);
        if (h.label) { ctx.fillStyle = IP.color(h.color || '--muted'); ctx.font = `600 11px ${font}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(h.label, ml + pw - 6, Y(h.y) - 3); }
      });
      (ov.vlines || []).forEach(v => {
        ctx.strokeStyle = IP.color(v.color || '--axis'); ctx.setLineDash(v.dash || [5, 4]); ctx.lineWidth = v.width || 1.3;
        ctx.beginPath(); ctx.moveTo(X(v.x), mt); ctx.lineTo(X(v.x), mt + ph); ctx.stroke(); ctx.setLineDash([]);
        if (v.label) { ctx.fillStyle = IP.color(v.color || '--muted'); ctx.font = `600 11px ${font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(v.label, X(v.x) + 4, mt + 4); }
      });
      (ov.markers || []).forEach(m => {
        const px = X(m.x), py = Y(m.y);
        ctx.fillStyle = IP.color(m.color || '--accent'); ctx.strokeStyle = IP.css('--surface'); ctx.lineWidth = 2;
        ctx.beginPath();
        if (m.shape === 'diamond') { const r = m.r || 6; ctx.moveTo(px, py - r); ctx.lineTo(px + r, py); ctx.lineTo(px, py + r); ctx.lineTo(px - r, py); ctx.closePath(); }
        else ctx.arc(px, py, m.r || 5, 0, 2 * Math.PI);
        ctx.fill(); ctx.stroke();
        if (m.label) { ctx.fillStyle = IP.color(m.color || '--accent'); ctx.font = `700 11.5px ${font}`; ctx.textAlign = m.align || 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(m.label, px + (m.align === 'right' ? -8 : 8), py - 6); }
      });
      (ov.texts || []).forEach(t => {
        ctx.fillStyle = IP.color(t.color || '--muted'); ctx.font = `${t.weight || 600} ${t.size || 11.5}px ${font}`;
        ctx.textAlign = t.align || 'left'; ctx.textBaseline = t.baseline || 'middle'; ctx.fillText(t.text, X(t.x), Y(t.y));
      });
      ctx.restore();

      // tooltip con cursor vertical
      if (this._hover && this.opts.tooltip) {
        const { px, py } = this._hover;
        if (px >= ml && px <= ml + pw && py >= mt && py <= mt + ph) {
          const xv = x0 + (px - ml) / pw * (x1 - x0);
          ctx.strokeStyle = axisC; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(px, mt); ctx.lineTo(px, mt + ph); ctx.stroke(); ctx.setLineDash([]);
          const rows = [];
          for (const s of this.series) {
            if (s.hidden || !s.name || s.points || !s.x.length || s.notip) continue;
            const i = nearest(s.x, xv); if (i < 0) continue;
            const yv = s.y[i]; if (!Number.isFinite(yv)) continue;
            const c = IP.color(s.color || '--s1');
            ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(s.x[i]), Y(yv), 3.5, 0, 2 * Math.PI); ctx.fill();
            rows.push(`<div><i style="background:${c}"></i>${s.name}: <b>${IP.fmt(yv, s.digits ?? 2)}</b>${s.unit ? ' ' + s.unit : ''}</div>`);
          }
          if (rows.length) {
            this.tip.innerHTML = `<div>${this.opts.xname || 'x'} = ${IP.fmt(xv, this.opts.xdigits ?? 3)}${this.opts.xunit ? ' ' + this.opts.xunit : ''}</div>` + rows.join('');
            this.tip.style.opacity = 1;
            const tw = this.tip.offsetWidth;
            this.tip.style.left = (px + 14 + tw > W ? px - tw - 14 : px + 14) + 'px';
            this.tip.style.top = Math.max(0, mt + 4) + 'px';
          } else this.tip.style.opacity = 0;
        } else this.tip.style.opacity = 0;
      }
    }
  }
  function nearest(arr, v) {
    const n = arr.length; if (!n) return -1;
    if (arr[n - 1] < arr[0]) { // no monótono: búsqueda lineal
      let bi = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.abs(arr[i] - v); if (d < bd) { bd = d; bi = i; } } return bi;
    }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m; else hi = m; }
    return Math.abs(arr[lo] - v) < Math.abs(arr[hi] - v) ? lo : hi;
  }
  IP.Plot = Plot;

  /* ---------------- mapa conceptual ---------------- */
  /**
   * map = {
   *   view: [ancho, alto],                 // sistema de coordenadas (escritorio)
   *   mobileView: [ancho, alto],           // opcional, para pantallas estrechas
   *   nodes: [{ id, label:'Línea 1\nLínea 2', tag?, kind:'problem|method|theory|result',
   *             x, y, mx?, my?, w?, text:'<p>HTML</p>', href?:'#seccion' }],
   *   edges: [{ from, to, label? }]
   * }
   * opts.panel: elemento donde se muestra la explicación del nodo.
   */
  IP.conceptMap = function (container, map, opts = {}) {
    container.classList.add('ip-cmap-canvas');
    const panel = opts.panel;
    let active = null, mobile = null;
    const byId = {}; map.nodes.forEach(n => byId[n.id] = n);

    function render() {
      const isMobile = !!map.mobileView && container.clientWidth < 620;
      if (isMobile === mobile && container.firstChild) return;
      mobile = isMobile;
      container.innerHTML = '';
      const [VW, VH] = isMobile ? map.mobileView : map.view;
      const svg = IP.svg('svg', { viewBox: `0 0 ${VW} ${VH}`, role: 'img', 'aria-label': opts.label || 'Mapa conceptual' });
      const defs = IP.svg('defs');
      const mk = IP.svg('marker', { id: 'ipArrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
      mk.append(IP.svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: IP.css('--axis') }));
      defs.append(mk); svg.append(defs);
      const gE = IP.svg('g'), gN = IP.svg('g');
      svg.append(gE, gN);
      const pos = {};
      map.nodes.forEach(n => {
        const lines = n.label.split('\n');
        const w = n.w || Math.max(120, Math.max(...lines.map(l => l.length)) * 10.6 + 32);
        const h = 30 + lines.length * 23 + (n.tag ? 14 : 0);
        const x = isMobile && n.mx !== undefined ? n.mx : n.x, y = isMobile && n.my !== undefined ? n.my : n.y;
        pos[n.id] = { x, y, w, h };
      });
      map.edges.forEach((e, i) => {
        const a = pos[e.from], b = pos[e.to]; if (!a || !b) return;
        const p1 = border(a, b.x, b.y), p2 = border(b, a.x, a.y);
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
        const bend = e.bend ?? 0.12;
        const cx = mx - dy / len * len * bend, cy = my + dx / len * len * bend;
        const d = `M${p1.x},${p1.y} Q${cx},${cy} ${p2.x},${p2.y}`;
        const g = IP.svg('g', { class: 'edge', 'data-from': e.from, 'data-to': e.to });
        g.append(IP.svg('path', { d, 'marker-end': 'url(#ipArrow)' }));
        g.append(IP.svg('path', { d, class: 'flow' }));
        if (e.label && !isMobile) {
          const lx = 0.25 * p1.x + 0.5 * cx + 0.25 * p2.x, ly = 0.25 * p1.y + 0.5 * cy + 0.25 * p2.y;
          const t = IP.svg('text', { x: lx, y: ly + 4, 'text-anchor': 'middle' }); t.textContent = e.label;
          const bg = IP.svg('rect', { class: 'lbl-bg', x: lx - e.label.length * 3.8 - 4, y: ly - 10, width: e.label.length * 7.6 + 8, height: 20, rx: 4 });
          g.append(bg, t);
        }
        gE.append(g);
      });
      map.nodes.forEach(n => {
        const p = pos[n.id];
        const g = IP.svg('g', { class: `node k-${n.kind || 'method'}`, tabindex: 0, role: 'button', 'data-id': n.id, 'aria-label': n.label.replace(/\n/g, ' ') });
        g.append(IP.svg('rect', { x: p.x - p.w / 2, y: p.y - p.h / 2, width: p.w, height: p.h, rx: 14 }));
        let ty = p.y - p.h / 2 + 27;
        if (n.tag) { const tg = IP.svg('text', { x: p.x, y: ty - 2, 'text-anchor': 'middle', class: 'tag' }); tg.textContent = n.tag; g.append(tg); ty += 15; }
        n.label.split('\n').forEach((l, i) => { const t = IP.svg('text', { x: p.x, y: ty + i * 23, 'text-anchor': 'middle' }); t.textContent = l; g.append(t); });
        g.addEventListener('click', () => select(n.id, true));
        g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(n.id, true); } });
        g.addEventListener('mouseenter', () => hot(n.id));
        g.addEventListener('mouseleave', () => hot(active));
        gN.append(g);
      });
      container.append(svg, IP.el('div', { class: 'ip-cmap-hint' }, 'Pulsa un concepto'));
      if (active) select(active, false);
    }
    function border(p, tx, ty) {
      const dx = tx - p.x, dy = ty - p.y;
      const sx = Math.abs(dx) > 1e-9 ? (p.w / 2 + 4) / Math.abs(dx) : Infinity;
      const sy = Math.abs(dy) > 1e-9 ? (p.h / 2 + 4) / Math.abs(dy) : Infinity;
      const s = Math.min(sx, sy);
      return { x: p.x + dx * s, y: p.y + dy * s };
    }
    function hot(id) {
      const neigh = new Set([id]);
      IP.$$('.edge', container).forEach(g => {
        const on = id && (g.dataset.from === id || g.dataset.to === id);
        g.classList.toggle('is-hot', !!on);
        g.classList.toggle('is-dim', !!id && !on);
        if (on) { neigh.add(g.dataset.from); neigh.add(g.dataset.to); }
      });
      IP.$$('.node', container).forEach(g => g.classList.toggle('is-dim', !!id && !neigh.has(g.dataset.id)));
    }
    function select(id, user) {
      active = id;
      IP.$$('.node', container).forEach(g => g.classList.toggle('is-active', g.dataset.id === id));
      hot(id);
      const n = byId[id];
      if (panel && n) {
        const kinds = { problem: ['Problema', 'danger'], method: ['Método', ''], theory: ['Teoría', 'muted'], result: ['Resultado', 'accent'] };
        const k = kinds[n.kind || 'method'];
        const ins = map.edges.filter(e => e.to === id).map(e => byId[e.from]);
        const outs = map.edges.filter(e => e.from === id).map(e => byId[e.to]);
        const link = (m) => `<a href="#" data-goto="${m.id}">${m.label.replace(/\n/g, ' ')}</a>`;
        panel.innerHTML = `<span class="ip-pill ${k[1]}">${k[0]}</span><h3>${n.label.replace(/\n/g, ' ')}</h3>${n.text || ''}` +
          (ins.length ? `<p class="ip-small ip-muted"><b>Viene de:</b> ${ins.map(link).join(' · ')}</p>` : '') +
          (outs.length ? `<p class="ip-small ip-muted"><b>Conduce a:</b> ${outs.map(link).join(' · ')}</p>` : '') +
          (n.href ? `<a class="ip-btn small" href="${n.href}">Ir a la sección →</a>` : '');
        IP.$$('[data-goto]', panel).forEach(a => a.addEventListener('click', (ev) => { ev.preventDefault(); select(a.dataset.goto, true); }));
        if (global.renderMathInElement) IP.math(panel);
      }
      if (opts.onSelect) opts.onSelect(id, user);
    }
    render();
    new ResizeObserver(IP.debounce(render, 80)).observe(container);
    IP.onTheme(() => { mobile = null; render(); });
    if (opts.initial) select(opts.initial, false);
    return { select };
  };

  /* ---------------- autoevaluación ---------------- */
  /** preguntas: [{ q:'texto (HTML)', options:['a','b',...], answer: índice, explain:'HTML' }] */
  IP.quiz = function (container, questions) {
    container.classList.add('ip-quiz');
    let score = 0, done = 0;
    const head = IP.el('div', { class: 'ip-score' }, `<span>Aciertos: <b class="ip-sc">0</b> / ${questions.length}</span><div class="ip-score-bar"><i></i></div>`);
    const reset = IP.el('button', { class: 'ip-btn small ghost', type: 'button' }, 'Reiniciar');
    head.append(reset);
    container.append(head);
    const cards = questions.map((q, qi) => {
      const card = IP.el('div', { class: 'ip-q' }, `<h4><small>${qi + 1}.</small>${q.q}</h4>`);
      const opts = IP.el('div', { class: 'ip-opts' });
      q.options.forEach((o, oi) => {
        const b = IP.el('button', { class: 'ip-opt', type: 'button' }, o);
        b.addEventListener('click', () => {
          if (card.classList.contains('answered')) return;
          card.classList.add('answered'); done++;
          IP.$$('.ip-opt', opts).forEach((x, xi) => { x.disabled = true; if (xi === q.answer) x.classList.add('ok'); });
          if (oi === q.answer) score++; else b.classList.add('ko');
          IP.$('.ip-sc', head).textContent = score;
          IP.$('.ip-score-bar i', head).style.width = (score / questions.length * 100) + '%';
        });
        opts.append(b);
      });
      card.append(opts, IP.el('div', { class: 'ip-explain' }, q.explain || ''));
      container.append(card);
      return card;
    });
    reset.addEventListener('click', () => {
      score = 0; done = 0; IP.$('.ip-sc', head).textContent = 0; IP.$('.ip-score-bar i', head).style.width = '0';
      cards.forEach(c => { c.classList.remove('answered'); IP.$$('.ip-opt', c).forEach(b => { b.disabled = false; b.classList.remove('ok', 'ko'); }); });
    });
    if (global.renderMathInElement) IP.math(container);
  };

  /* ---------------- pestañas ---------------- */
  /** Marcado: <div class="ip-tabs"><div role="tablist"><button role="tab" aria-controls="p1">…</button></div><div role="tabpanel" id="p1">…</div></div> */
  IP.tabs = function (root, onChange) {
    const tabs = IP.$$('[role="tab"]', root);
    const show = (t) => {
      tabs.forEach(x => {
        const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
        const p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on;
      });
      onChange && onChange(t.getAttribute('aria-controls'));
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => show(t));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); show(n); }
      });
    });
    show(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0]);
  };

  /* ---------------- animación ---------------- */
  /**
   * Ejecuta step(dt_segundos, t_total) en cada frame mientras `el` está visible
   * y la pestaña activa. Devuelve { start, stop, running }.
   */
  IP.animate = function (el, step) {
    let raf = 0, last = 0, t = 0, visible = true, wanted = false;
    const loop = (now) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now; t += dt;
      step(dt, t);
      raf = requestAnimationFrame(loop);
    };
    const run = () => { if (!raf && wanted && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(loop); } };
    const halt = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    if (el && 'IntersectionObserver' in global) {
      new IntersectionObserver((ents) => { visible = ents[0].isIntersecting; visible ? run() : halt(); }, { threshold: 0.01 }).observe(el);
    }
    document.addEventListener('visibilitychange', () => document.hidden ? halt() : run());
    const api = {
      start() { wanted = true; run(); },
      stop() { wanted = false; halt(); },
      get running() { return wanted; }
    };
    return api;
  };

  /* ---------------- bloques de simulación ---------------- */
  IP.sim = {};
  /** Retardo puro de n muestras (buffer circular). */
  IP.sim.DelayLine = class {
    constructor(n, init = 0) { this.resize(n, init); }
    resize(n, init = 0) { this.n = Math.max(1, Math.round(n)); this.buf = new Float64Array(this.n).fill(init); this.i = 0; }
    push(v) { const out = this.buf[this.i]; this.buf[this.i] = v; this.i = (this.i + 1) % this.n; return out; }
  };
  /**
   * PID en forma paralela (como el firmware del Crazyflie):
   *   u = Kp·e + Ki·∫e dt + Kd·de/dt, con saturación y anti-windup por "clamping".
   * step(e, dt) admite dt variable (útil para control basado en eventos).
   */
  IP.sim.PID = class {
    constructor({ kp = 1, ki = 0, kd = 0, umax = Infinity, ilim = Infinity } = {}) {
      Object.assign(this, { kp, ki, kd, umax, ilim }); this.reset();
    }
    reset() { this.i = 0; this.ep = null; this.u = 0; }
    step(e, dt) {
      const de = this.ep === null ? 0 : (e - this.ep) / dt; this.ep = e;
      const up = this.kp * e + this.kd * de;
      let u = up + this.i;
      const sat = Math.abs(u) >= this.umax;
      if (!sat || u * e < 0) this.i = IP.clamp(this.i + this.ki * e * dt, -this.ilim, this.ilim);
      u = IP.clamp(up + this.i, -this.umax, this.umax);
      this.u = u; return u;
    }
  };
  /** Desviación típica en ventana deslizante de n muestras. */
  IP.sim.MovingStd = class {
    constructor(n) { this.n = Math.max(2, n); this.buf = []; this.s = 0; this.s2 = 0; }
    push(v) {
      this.buf.push(v); this.s += v; this.s2 += v * v;
      if (this.buf.length > this.n) { const o = this.buf.shift(); this.s -= o; this.s2 -= o * o; }
      const m = this.s / this.buf.length; return Math.sqrt(Math.max(0, this.s2 / this.buf.length - m * m));
    }
  };
  /** Media móvil de n muestras. */
  IP.sim.MovingAvg = class {
    constructor(n) { this.n = Math.max(1, n); this.buf = []; this.s = 0; }
    push(v) { this.buf.push(v); this.s += v; if (this.buf.length > this.n) this.s -= this.buf.shift(); return this.s / this.buf.length; }
  };
  /** Generador gaussiano reproducible (semilla). */
  IP.sim.rng = function (seed = 1) {
    let s = seed >>> 0 || 1;
    const u = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
    return { uniform: u, gauss: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) };
  };
  /** Índices de respuesta a escalón: sobreoscilación, t. subida 10-90 %, t. establecimiento 5 %, IAE, ITAE. */
  IP.sim.stepMetrics = function (t, y, ref, t0 = 0, y0 = 0) {
    const span = ref - y0; let ymax = -Infinity, t10 = null, t90 = null, ts = null, iae = 0, itae = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i] < t0) continue;
      const yi = (y[i] - y0) / span;
      if (yi > ymax) ymax = yi;
      if (t10 === null && yi >= 0.1) t10 = t[i];
      if (t90 === null && yi >= 0.9) t90 = t[i];
      const dt = i ? t[i] - t[i - 1] : 0, e = Math.abs(ref - y[i]);
      iae += e * dt; itae += (t[i] - t0) * e * dt;
    }
    for (let i = t.length - 1; i >= 0 && t[i] >= t0; i--) {
      if (Math.abs(ref - y[i]) > 0.05 * Math.abs(span)) { ts = (i + 1 < t.length ? t[i + 1] : t[i]) - t0; break; }
    }
    if (ts === null) ts = 0;
    return {
      os: Math.max(0, (ymax - 1) * 100),
      tr: (t10 !== null && t90 !== null) ? t90 - t10 : NaN,
      ts, iae, itae
    };
  };

  /* ---------------- fórmulas (KaTeX opcional) ---------------- */
  IP.math = function (root = document.body) {
    if (!global.renderMathInElement) return;
    global.renderMathInElement(root, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\(', right: '\\)', display: false }],
      throwOnError: false
    });
  };

  /* ---------------- inicialización de página ---------------- */
  /**
   * IP.page() — engancha:
   *  · menú superior con resaltado de la sección visible (.ip-topnav a[href^="#"])
   *  · barra de progreso de lectura (.ip-progress)
   *  · aparición al hacer scroll (.ip-reveal)
   *  · botones de copiar ([data-copy] = selector del texto a copiar)
   *  · fórmulas KaTeX (si la librería está cargada)
   */
  IP.page = function () {
    const prog = IP.$('.ip-progress');
    const links = IP.$$('.ip-topnav a[href^="#"]');
    const secs = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    const onScroll = () => {
      const h = document.documentElement;
      if (prog) prog.style.width = (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) * 100) + '%';
      let cur = null; secs.forEach(s => { if (s.getBoundingClientRect().top < 140) cur = s.id; });
      links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + cur));
    };
    global.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    const rv = IP.$$('.ip-reveal');
    if ('IntersectionObserver' in global && !IP.reducedMotion()) {
      const io = new IntersectionObserver((ents) => ents.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } }), { threshold: 0.08 });
      rv.forEach(e => io.observe(e));
    } else rv.forEach(e => e.classList.add('is-visible'));

    IP.$$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      const src = IP.$(b.dataset.copy); if (!src) return;
      const txt = src.innerText.replace(/\s*Copiar\s*$/, '');
      try { await navigator.clipboard.writeText(txt); b.textContent = '¡Copiado!'; }
      catch (e) { b.textContent = 'Selecciona y copia'; }
      setTimeout(() => (b.textContent = 'Copiar'), 1600);
    }));

    if (global.renderMathInElement) IP.math();
    else global.addEventListener('load', () => IP.math());
  };

  global.IP = IP;
})(window);
