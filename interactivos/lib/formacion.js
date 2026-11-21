/* ============================================================
   FORM — formaciones rígidas sobre superficies virtuales
   ------------------------------------------------------------
   Basado en:
   [RAS24] Guinaldo, Sánchez-Moreno, Zaragoza, Mañas-Álvarez (2024).
           Distributed multi-UAV shield formation based on virtual
           surface constraints. Robotics and Autonomous Systems 176.
   [ECC26] Mañas-Álvarez, Guinaldo, Dormido, Dormido (2026). Rigid
           formation control in multi-robot systems using Lagrange
           multipliers. ECC 2026.

   FORM.surface(tipo, parámetros)   cuádricas: elipsoide, esfera, cilindro, cono
   FORM.buildShield(S, N, opts)     Algoritmo 1 [RAS24] + enlaces → formación objetivo
   FORM.circumcircle(A, B, C)       Lema 1 [RAS24]
   FORM.inCap(A, B, C, D)           Teorema 1 [RAS24] (signo de |M_ABCD|)
   FORM.delaunay(F)                 comprueba todos los triángulos de la formación
   FORM.rankJR(F, S)                rango de la matriz aumentada J_R (Lema 4)
   new FORM.Sim(opts)               simulación con las leyes 'ras' (= 'base'), 'rfc', 'prf'
   ============================================================ */
(function (global) {
  'use strict';
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => Math.sqrt(dot(a, a));
  const P_TH = 1.6075;   // exponente de la fórmula de Knud Thomsen

  /** Área aproximada de medio elipsoide de semiejes (a, b, H) — fórmula de Thomsen. */
  function halfEllipsoidArea(a, b, H) {
    if (a <= 0 || b <= 0 || H <= 0) return 0;
    return 2 * Math.PI * Math.pow((Math.pow(a * b, P_TH) + Math.pow(a * H, P_TH) + Math.pow(b * H, P_TH)) / 3, 1 / P_TH);
  }
  /** Perímetro de una elipse (Ramanujan II). */
  function ellipsePerimeter(a, b) {
    if (a <= 0 || b <= 0) return 0;
    const h = ((a - b) / (a + b)) ** 2;
    return Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
  }

  /* ---------------- superficies ---------------- */
  /**
   * Cada superficie expone:
   *   f(p)        función de la cuádrica (f = 0 sobre la superficie), en forma normal
   *   grad(p)     ∇f
   *   q           diagonal de Q1 (para la discusión de simetrías)
   *   hmax        altura máxima; section(h) → semiejes {ax, ay} del corte z = h
   *   capArea(h)  área por encima de z = h (aproximación usada en el Algoritmo 1)
   *   perim(h)    perímetro del corte
   *   proj(p)     punto más cercano de la superficie y multiplicador λ (Lagrange)
   *   zmax        cota superior en z (cilindro y cono), o null
   */
  function surface(type, prm) {
    if (type === 'esfera') return surface('elipsoide', { a: prm.R, b: prm.R, c: prm.R, name: 'Semiesfera' });
    if (type === 'elipsoide') {
      const { a, b, c } = prm;
      const A2 = [a * a, b * b, c * c];
      const S = {
        type, name: prm.name || 'Semielipsoide', prm, q: [1 / A2[0], 1 / A2[1], 1 / A2[2]], hmax: c, zmax: null,
        f: (p) => p[0] * p[0] / A2[0] + p[1] * p[1] / A2[1] + p[2] * p[2] / A2[2] - 1,
        grad: (p) => [2 * p[0] / A2[0], 2 * p[1] / A2[1], 2 * p[2] / A2[2]],
        section: (h) => { const k = Math.sqrt(Math.max(0, 1 - (h / c) ** 2)); return { ax: a * k, ay: b * k }; },
        capArea: (h) => { const k = Math.sqrt(Math.max(0, 1 - (h / c) ** 2)); return halfEllipsoidArea(a * k, b * k, c - h); },
        perim: (h) => { const k = Math.sqrt(Math.max(0, 1 - (h / c) ** 2)); return ellipsePerimeter(a * k, b * k); },
        proj: (p) => {
          if (a === b && b === c) { const n = norm(p) || 1e-9; return { p: mul(p, a / n), lambda: n / a - 1 }; }
          // x*_k = a_k² p_k / (a_k² + λ), con Σ a_k² p_k² / (a_k² + λ)² = 1  (Newton)
          const g = (l) => A2.reduce((s, ak, k) => s + ak * p[k] * p[k] / (ak + l) ** 2, 0) - 1;
          const dg = (l) => A2.reduce((s, ak, k) => s - 2 * ak * p[k] * p[k] / (ak + l) ** 3, 0);
          let l = 0, lo = -Math.min(...A2) + 1e-12;
          for (let it = 0; it < 60; it++) { const st = g(l) / dg(l); let ln = l - st; if (ln <= lo) ln = (l + lo) / 2; if (Math.abs(ln - l) < 1e-12) { l = ln; break; } l = ln; }
          return { p: [A2[0] * p[0] / (A2[0] + l), A2[1] * p[1] / (A2[1] + l), A2[2] * p[2] / (A2[2] + l)], lambda: l };
        },
        hess: () => [[2 / A2[0], 0, 0], [0, 2 / A2[1], 0], [0, 0, 2 / A2[2]]]
      };
      return S;
    }
    if (type === 'cilindro') {
      const { a, c } = prm, A2 = a * a;
      return {
        type, name: 'Cilindro', prm, q: [1 / A2, 1 / A2, 0], hmax: c, zmax: c,
        f: (p) => (p[0] * p[0] + p[1] * p[1]) / A2 - 1,
        grad: (p) => [2 * p[0] / A2, 2 * p[1] / A2, 0],
        section: () => ({ ax: a, ay: a }),
        capArea: (h) => 2 * Math.PI * a * Math.max(0, c - h),
        perim: () => 2 * Math.PI * a,
        proj: (p) => { const r = Math.hypot(p[0], p[1]) || 1e-9; return { p: [a * p[0] / r, a * p[1] / r, p[2]], lambda: r / a - 1 }; },
        hess: () => [[2 / A2, 0, 0], [0, 2 / A2, 0], [0, 0, 0]]
      };
    }
    if (type === 'cono') {
      // g = (x² + y²)/a² − (z − c)²/c²  (vértice en z = c, base de radio a en z = 0) [ECC26, Ej. 2]
      const { a, c } = prm, A2 = a * a, C2 = c * c;
      return {
        type, name: 'Cono', prm, q: [1 / A2, 1 / A2, -1 / C2], hmax: c, zmax: c,
        f: (p) => (p[0] * p[0] + p[1] * p[1]) / A2 - (p[2] - c) ** 2 / C2,
        grad: (p) => [2 * p[0] / A2, 2 * p[1] / A2, -2 * (p[2] - c) / C2],
        section: (h) => { const r = a * Math.max(0, 1 - h / c); return { ax: r, ay: r }; },
        capArea: (h) => { const r = a * Math.max(0, 1 - h / c); return Math.PI * r * Math.hypot(r, c - h); },
        perim: (h) => 2 * Math.PI * a * Math.max(0, 1 - h / c),
        proj: (p) => {
          // solución cerrada de 2(p* − p) + λ∇g(p*) = 0, g(p*) = 0 (rama inferior del cono)
          const rho = Math.hypot(p[0], p[1]) || 1e-9, w = Math.abs(p[2] - c);
          const l = (a * rho * C2 - c * w * A2) / (a * rho + c * w);
          const rs = A2 * rho / (A2 + l), zs = (C2 * p[2] - l * c) / (C2 - l);
          return { p: [rs * p[0] / rho, rs * p[1] / rho, zs], lambda: l };
        },
        hess: () => [[2 / A2, 0, 0], [0, 2 / A2, 0], [0, 0, -2 / C2]]
      };
    }
    throw new Error('Superficie desconocida: ' + type);
  }

  /** Malla de alambre de la superficie (para dibujar). */
  function wire(S, nh = 7, nt = 48) {
    const lines = [];
    for (let k = 0; k <= nh; k++) {
      const h = S.hmax * (S.type === 'cono' ? 0.98 : 1) * k / nh, { ax, ay } = S.section(h);
      if (ax < 1e-6) continue;
      const ring = []; for (let i = 0; i <= nt; i++) { const t = i / nt * 2 * Math.PI; ring.push([ax * Math.cos(t), ay * Math.sin(t), h]); }
      lines.push(ring);
    }
    for (let i = 0; i < 12; i++) {
      const t = i / 12 * 2 * Math.PI, mer = [];
      for (let k = 0; k <= 30; k++) { const h = S.hmax * k / 30, { ax, ay } = S.section(h); mer.push([ax * Math.cos(t), ay * Math.sin(t), h]); }
      lines.push(mer);
    }
    return lines;
  }

  /* ---------------- Algoritmo 1 [RAS24] ---------------- */
  /**
   * d ≤ (L_b + √(L_b² + 32/√3 · A · (N−1))) / (4(N−1))            (ec. 15)
   * n_b = ⌈L_b / d⌉                                                (ec. 16)
   * h_k: A_k(h) = (2N_k − 2 − L_k(h)/d)·(√3/4)·d²                 (ec. 17)
   * n_k = ⌈L_k / d⌉,  d_k = L_k / n_k                              (ecs. 18–19)
   */
  function rings(S, N) {
    const A = S.capArea(0), Lb = S.perim(0);
    const d = (Lb + Math.sqrt(Lb * Lb + 32 / Math.sqrt(3) * A * (N - 1))) / (4 * (N - 1));
    const nb = Math.min(N, Math.ceil(Lb / d - 1e-9));
    const out = [{ h: 0, n: nb, d: Lb / nb, L: Lb }];
    let Nk = N - nb, hprev = 0;
    const top = S.hmax * (S.type === 'cono' ? 0.97 : 1);
    while (Nk > 0) {
      const F = (h) => S.capArea(h) - (2 * Nk - 2 - S.perim(h) / d) * Math.sqrt(3) / 4 * d * d;
      let lo = hprev + 1e-6, hi = top - 1e-9, h;
      if (F(lo) < 0) h = (hprev + top) / 2;           // sin raíz: anillo intermedio (salvaguarda)
      else { for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2; if (F(m) > 0) lo = m; else hi = m; } h = (lo + hi) / 2; }
      const L = S.perim(h);
      let n = Math.max(1, Math.ceil(L / d - 1e-9)); if (n > Nk) n = Nk;
      out.push({ h, n, d: L / n, L }); Nk -= n; hprev = h;
      if (out.length > 60) break;
    }
    return { d, rings: out, A, Lb };
  }

  /** Puntos equiespaciados en longitud de arco sobre la elipse del corte z = h. */
  function ringPoints(S, h, n, phase) {
    const { ax, ay } = S.section(h);
    if (n === 1 || ax < 1e-9) return [[0, 0, h]];
    const M = 720, cum = [0];
    let prev = [ax, 0];
    for (let i = 1; i <= M; i++) { const t = i / M * 2 * Math.PI, q = [ax * Math.cos(t), ay * Math.sin(t)]; cum.push(cum[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1])); prev = q; }
    const L = cum[M], pts = [];
    for (let k = 0; k < n; k++) {
      const s = ((phase + k) / n % 1) * L;
      let i = 1; while (i < M && cum[i] < s) i++;
      const t = ((i - 1) + (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)) / M * 2 * Math.PI;
      pts.push([ax * Math.cos(t), ay * Math.sin(t), h]);
    }
    return pts;
  }

  /**
   * Formación objetivo: anillos + enlaces.
   *  · cada nodo se une a sus dos vecinos del anillo;
   *  · cada nodo del nivel k se une a los del nivel k+1 con d_ij ≤ d + ε,
   *    descartando enlaces cuya proyección en z = 0 cruce otra ya creada;
   *  · d*_ij = distancia real resultante.
   * opts.eps (por defecto 0,3·d, cota de la Obs. 2: (√2 − 1)·d)
   */
  function buildShield(S, N, opts = {}) {
    const R = rings(S, N), d = R.d, eps = opts.eps ?? 0.3 * d, h0 = opts.h0 ?? 0;
    // El anillo inferior se coloca a h0 > ε del plano z = 0 (simplificación práctica, Sec. 6.1)
    if (h0 > 0) R.rings[0].h = h0;
    const P = [], level = [];
    // Fase de cada anillo: la que deja sus nodos lo más «al tresbolillo» posible respecto al
    // anillo inferior (maximiza la mínima separación angular), para triángulos casi equiláteros.
    let below = null;
    R.rings.forEach((r, k) => {
      let best = null, bestGap = -1;
      const cands = below ? Array.from({ length: 24 }, (_, i) => i / 24) : [0];
      for (const ph of cands) {
        const pts = ringPoints(S, r.h, r.n, ph);
        if (!below) { best = pts; break; }
        let gap = Infinity;
        pts.forEach(q => below.forEach(b => { let da = Math.abs(Math.atan2(q[1], q[0]) - Math.atan2(b[1], b[0])); da = Math.min(da, 2 * Math.PI - da); gap = Math.min(gap, da); }));
        if (gap > bestGap + 1e-9) { bestGap = gap; best = pts; }
      }
      best.forEach(p => { P.push(p); level.push(k); });
      below = best;
    });
    const idx = R.rings.map((_, k) => level.map((l, i) => l === k ? i : -1).filter(i => i >= 0));
    const E = new Map(), key = (i, j) => i < j ? i + ',' + j : j + ',' + i;
    const addE = (i, j) => { if (i !== j) E.set(key(i, j), [Math.min(i, j), Math.max(i, j)]); };
    idx.forEach(ids => {
      if (ids.length === 2) addE(ids[0], ids[1]);
      else if (ids.length > 2) ids.forEach((id, t) => addE(id, ids[(t + 1) % ids.length]));
    });
    const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const crosses = (a, b, c, e) => {
      if (a === c || a === e || b === c || b === e) return false;
      const A = P[a], B = P[b], C = P[c], D = P[e];
      return orient(A, B, C) * orient(A, B, D) < 0 && orient(C, D, A) * orient(C, D, B) < 0;
    };
    for (let k = 0; k < idx.length - 1; k++) {
      const cand = [];
      idx[k].forEach(i => idx[k + 1].forEach(j => cand.push([norm(sub(P[i], P[j])), i, j])));
      cand.sort((x, y) => x[0] - y[0]);
      const inter = [];
      const deg = (j) => inter.filter(e => e[1] === j).length;
      for (const [dd, i, j] of cand) {
        // criterio d + ε; salvaguarda: todo nodo superior queda unido al menos a 2 inferiores
        if (dd > d + eps && deg(j) >= 2) continue;
        if (inter.some(([a, b]) => crosses(i, j, a, b))) continue;
        inter.push([i, j]); addE(i, j);
      }
    }
    // El anillo superior no tiene nodos encima: su polígono se triangula con diagonales
    // (en zigzag, que da triángulos poco alargados). Con 5 nodos añade 2 aristas.
    const topIds = idx[idx.length - 1];
    if (topIds.length >= 4) {
      let lo = 0, hi = topIds.length - 1, turn = 0;
      while (hi - lo >= 2) {
        if (turn % 2 === 0) { addE(topIds[lo], topIds[hi - 1]); hi--; } else { addE(topIds[lo + 1], topIds[hi]); lo++; }
        turn++;
      }
    }
    const edges = [...E.values()];
    const dstar = edges.map(([i, j]) => norm(sub(P[i], P[j])));
    const nb = P.map(() => []);
    edges.forEach(([i, j], k) => { nb[i].push([j, k]); nb[j].push([i, k]); });
    // triángulos = 3-cliques
    const adj = P.map(() => new Set()); edges.forEach(([i, j]) => { adj[i].add(j); adj[j].add(i); });
    const tri = [];
    edges.forEach(([i, j]) => adj[i].forEach(k => { if (k > j && adj[j].has(k)) tri.push([i, j, k]); }));
    return { S, N, d, eps, rings: R.rings, A: R.A, Lb: R.Lb, P, level, edges, dstar, nb, tri };
  }

  /* ---------------- Delaunay local [RAS24, Sec. 4.1] ---------------- */
  function det(M) {
    const n = M.length, A = M.map(r => r.slice()); let D = 1;
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-300) return 0;
      if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; D = -D; }
      D *= A[c][c];
      for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; }
    }
    return D;
  }
  function solve(M, b) {
    const n = M.length, A = M.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[p], A[c]] = [A[c], A[p]];
      for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
    }
    return A.map((r, i) => r[n] / r[i]);
  }
  /** Λ y v_P del Lema 1 / Teorema 1. */
  function lambdaMatrix(A, B, C) {
    const O = [A, B, C], detO = det(O);
    const v = cross(sub(B, A), sub(C, A));                 // normal del plano (a, b, c)
    const Lam = [[...A, 1], [...B, 1], [...C, 1], [...v, 0]];
    const vP = [dot(A, A), dot(B, B), dot(C, C), 2 * detO];
    return { Lam, vP, v, detO };
  }
  /** Circuncentro y radio (Lema 1): (m, γ) = ½ Λ⁻¹ v_P, r = √(2γ + ‖m‖²). */
  function circumcircle(A, B, C) {
    const { Lam, vP, v } = lambdaMatrix(A, B, C);
    const x = solve(Lam, vP).map(t => t / 2), m = [x[0], x[1], x[2]], g = x[3];
    return { m, r: Math.sqrt(Math.max(0, 2 * g + dot(m, m))), v };
  }
  /** Teorema 1: D está dentro de la «tapa esférica» de ABC si |M_ABCD| > 0. */
  function inCap(A, B, C, D) {
    const { Lam, vP } = lambdaMatrix(A, B, C);
    const M = Lam.map((r, i) => [...r, vP[i]]);
    M.push([...D, 1, dot(D, D)]);
    return det(M);
  }
  /**
   * Comprueba todos los triángulos. Las coordenadas se adimensionalizan (÷ máx ‖p‖) y se usa
   * una tolerancia relativa: puntos concíclicos (|M| ≈ 0, p. ej. un pentágono regular) no
   * cuentan como violación.
   */
  function delaunay(F, P = F.P, tol = 1e-7) {
    const sc = Math.max(...P.map(norm)) || 1, Q = P.map(q => mul(q, 1 / sc));
    return F.tri.map(([a, b, c]) => {
      const viol = [];
      for (let k = 0; k < Q.length; k++) if (k !== a && k !== b && k !== c && inCap(Q[a], Q[b], Q[c], Q[k]) > tol) viol.push(k);
      return { tri: [a, b, c], ok: viol.length === 0, viol };
    });
  }

  /**
   * Corrección opcional (NO forma parte de [RAS24]): mientras el test local detecte un
   * triángulo ABC con un nodo D dentro y ABD sea un triángulo vecino, se intercambia la
   * diagonal AB por CD (flip de Lawson). Devuelve una formación nueva y el nº de cambios.
   */
  function flipToDelaunay(F, maxFlips = 200) {
    let edges = F.edges.map(e => e.slice()), flips = 0;
    const rebuildF = () => {
      const adj = F.P.map(() => new Set()); edges.forEach(([i, j]) => { adj[i].add(j); adj[j].add(i); });
      const tri = []; edges.forEach(([i, j]) => adj[i].forEach(k => { if (k > j && adj[j].has(k)) tri.push([i, j, k]); }));
      return { tri, adj };
    };
    for (let it = 0; it < maxFlips; it++) {
      const { tri, adj } = rebuildF();
      const D = delaunay({ tri }, F.P);
      let done = false;
      for (const t of D) {
        if (t.ok) continue;
        const [a, b, c] = t.tri;
        for (const [x, y, z] of [[a, b, c], [b, c, a], [c, a, b]]) {
          const w = t.viol.find(k => adj[x].has(k) && adj[y].has(k));
          if (w === undefined || adj[z].has(w)) continue;
          edges = edges.filter(([i, j]) => !((i === x && j === y) || (i === y && j === x)));
          edges.push([Math.min(z, w), Math.max(z, w)]); flips++; done = true; break;
        }
        if (done) break;
      }
      if (!done) break;
    }
    const { tri } = rebuildF();
    const dstar = edges.map(([i, j]) => norm(sub(F.P[i], F.P[j])));
    const nb = F.P.map(() => []); edges.forEach(([i, j], k) => { nb[i].push([j, k]); nb[j].push([i, k]); });
    return { F: Object.assign({}, F, { edges, dstar, nb, tri }), flips };
  }

  /**
   * Dibuja una formación en un IP.Scene3D.
   * o = { S, F, P, wire:true, colorOf(i), edgeColor(k, e), trails, droneSize, offsetZ, selected }
   */
  function drawScene(sc, o) {
    const dz = o.offsetZ || 0, Z = (q) => [q[0], q[1], q[2] + dz];
    if (o.wire !== false && o.S) wire(o.S, o.wireRings || 6, 40).forEach(l => sc.polyline(l.map(Z), { color: '--muted', width: 0.8, alpha: o.wireAlpha ?? 0.35, zb: -1e3 }));
    if (o.ground) {
      const g = o.ground, ring = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * 2 * Math.PI; ring.push([g * Math.cos(a), g * Math.sin(a), 0]); }
      sc.poly(ring, { fill: '--surface-2', alpha: 0.5, stroke: '--border', zb: -2e3 });
    }
    const P = o.P;
    if (o.trails) o.trails.forEach((tr, i) => { if (tr.length > 1) sc.polyline(tr.map(Z), { color: o.colorOf ? o.colorOf(i) : '--s3', width: 1, alpha: 0.45 }); });
    if (o.F) o.F.edges.forEach(([i, j], k) => {
      const e = o.edgeColor ? o.edgeColor(k, [i, j]) : null;
      sc.line(Z(P[i]), Z(P[j]), { color: e || '--s1', width: e ? 2.2 : 1.4, alpha: e ? 1 : 0.75 });
    });
    P.forEach((q, i) => sc.drone(Z(q), { color: o.colorOf ? o.colorOf(i) : '--s2', size: o.droneSize || 0.05, dot: i === o.selected ? 6 : 3 }));
  }

  /* ---------------- rango de J_R (Lema 4) ---------------- */
  function rank(M, tol = 1e-8) {
    const A = M.map(r => r.slice()); const rows = A.length, cols = A[0].length;
    const scale = Math.max(1e-300, ...A.flat().map(Math.abs));
    let r = 0;
    for (let c = 0; c < cols && r < rows; c++) {
      let p = r; for (let i = r + 1; i < rows; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
      if (Math.abs(A[p][c]) <= tol * scale) continue;
      [A[p], A[r]] = [A[r], A[p]];
      for (let i = r + 1; i < rows; i++) { const f = A[i][c] / A[r][c]; if (f) for (let k = c; k < cols; k++) A[i][k] -= f * A[r][k]; }
      r++;
    }
    return r;
  }
  function rankJR(F, S, P = F.P) {
    const N = P.length, rows = [];
    F.edges.forEach(([i, j]) => { const r = new Array(3 * N).fill(0), z = sub(P[i], P[j]); for (let k = 0; k < 3; k++) { r[3 * i + k] = z[k]; r[3 * j + k] = -z[k]; } rows.push(r); });
    P.forEach((p, i) => { const r = new Array(3 * N).fill(0), g = S.grad(p); for (let k = 0; k < 3; k++) r[3 * i + k] = g[k] / 2; rows.push(r); });
    const rk = rank(rows);
    return { rank: rk, cols: 3 * N, s: 3 * N - rk, rows: rows.length };
  }

  /* ---------------- simulación ---------------- */
  /**
   * new FORM.Sim({ S, F, P0, law, k1, k2, k3, eps, umax, dtc, tau, dt })
   *  law 'ras'/'base':  u_i = −κ1 Σ e_ij (p_i − p_j) − (κ2/2) f(p_i) ∇f(p_i) + u_r      [RAS24 ec. 47]
   *  law 'rfc':         u_i = −κ1 Σ e_ij (p_i − p_j) − κ2 (p_i − p*_i)                   [ECC26 ec. 12]
   *  law 'prf':         u_i = −κ1 P_i Σ (δ_ij − d*²)(p*_i − p*_j) − κ2 (p_i − p*_i)      [ECC26 ec. 19]
   *  dtc: periodo de la capa de coordinación (0 = continuo); tau: retardo de primer orden
   *  del seguimiento de velocidad del dron (0 = integrador puro); umax: saturación ‖u_i‖.
   */
  class Sim {
    constructor(o) {
      Object.assign(this, { law: 'ras', k1: 0.1, k2: 1, k3: 1e-3, eps: 0.05, umax: Infinity, dtc: 0, tau: 0, dt: 0.005, zfloor: 0 }, o);
      const N = this.P0.length;
      this.p = this.P0.map(q => q.slice()); this.v = this.p.map(() => [0, 0, 0]); this.u = this.p.map(() => [0, 0, 0]);
      this.t = 0; this.tc = 0; this.hist = { t: [], ed: [], es: [], ed2: [], es2: [], umax: [], sat: [] }; this.effort = 0; this.trails = this.p.map(q => [q.slice()]);
      this.ps = this.p.map(q => this.S.proj(q).p);
      this.lastRec = -1; this.N = N; this.satCount = 0;
      this.compute(); this.record();
    }
    /** ed, es: sumas de |e_ij| y |f(p_i)|; ed2, es2: normas euclídeas ‖e(z)‖ y ‖f(p)‖. */
    errs() {
      const F = this.F; let ed = 0, ed2 = 0;
      F.edges.forEach(([i, j], k) => { const e = dot(sub(this.p[i], this.p[j]), sub(this.p[i], this.p[j])) - F.dstar[k] ** 2; ed += Math.abs(e); ed2 += e * e; });
      let es = 0, es2 = 0; this.p.forEach(q => { const f = this.S.f(q); es += Math.abs(f); es2 += f * f; });
      return { ed, es, ed2: Math.sqrt(ed2), es2: Math.sqrt(es2) };
    }
    compute() {
      const F = this.F, S = this.S, p = this.p, N = this.N;
      const ps = this.ps = p.map(q => S.proj(q).p);
      let sat = 0, um = 0;
      for (let i = 0; i < N; i++) {
        let u = [0, 0, 0];
        const usePs = this.law === 'prf';
        for (const [j, k] of F.nb[i]) {
          const a = usePs ? ps[i] : p[i], b = usePs ? ps[j] : p[j], z = sub(a, b);
          const e = dot(z, z) - F.dstar[k] ** 2;
          u = sub(u, mul(z, this.k1 * e));
        }
        if (this.law === 'prf') { const g = S.grad(ps[i]), gg = dot(g, g) || 1e-12; u = sub(u, mul(g, dot(u, g) / gg)); }
        if (this.law === 'ras' || this.law === 'base') {
          const f = S.f(p[i]); u = sub(u, mul(S.grad(p[i]), this.k2 / 2 * f));
          // campo repulsivo en z = 0 (ec. 46) y en la cota superior (Obs. 10)
          const z = p[i][2] - this.zfloor, eps = this.eps;
          if (z <= eps) u[2] += this.k3 * (1 / Math.max(z, 1e-3) - 1 / eps) / Math.max(z, 1e-3) ** 2;
          if (S.zmax !== null) { const w = S.zmax - p[i][2]; if (w <= eps) u[2] -= this.k3 * (1 / Math.max(w, 1e-3) - 1 / eps) / Math.max(w, 1e-3) ** 2; }
        } else {
          u = sub(u, mul(sub(p[i], ps[i]), this.k2));
        }
        const nu = norm(u); um = Math.max(um, nu);
        if (nu > this.umax) { u = mul(u, this.umax / nu); sat++; }
        this.u[i] = u;
      }
      this.lastUmax = um; this.lastSat = sat;
    }
    record() {
      const { ed, es, ed2, es2 } = this.errs();
      this.hist.t.push(this.t); this.hist.ed.push(ed); this.hist.es.push(es); this.hist.ed2.push(ed2); this.hist.es2.push(es2);
      this.hist.umax.push(Math.min(this.lastUmax, 1e3)); this.hist.sat.push(this.lastSat);
    }
    /** Avanza la simulación T segundos. */
    advance(T) {
      const steps = Math.max(1, Math.round(T / this.dt));
      for (let s = 0; s < steps; s++) {
        if (this.dtc > 0) { if (this.t >= this.tc - 1e-9) { this.compute(); this.tc += this.dtc; } }
        else this.compute();
        for (let i = 0; i < this.N; i++) {
          if (this.fixed && this.fixed.has(i)) continue;      // nodos ancla (no se mueven)
          let vel = this.u[i];
          if (this.tau > 0) { this.v[i] = add(this.v[i], mul(sub(this.u[i], this.v[i]), this.dt / this.tau)); vel = this.v[i]; }
          this.p[i] = add(this.p[i], mul(vel, this.dt));
          if (this.p[i][2] < this.zfloor + 1e-3) this.p[i][2] = this.zfloor + 1e-3;
          this.effort += norm(vel) * this.dt;
        }
        this.t += this.dt;
        if (this.t - this.lastRec >= 0.05 - 1e-9) {
          this.lastRec = this.t; this.record();
          this.p.forEach((q, i) => { const tr = this.trails[i]; const l = tr[tr.length - 1]; if (norm(sub(q, l)) > 0.004 * (this.S.hmax || 1)) tr.push(q.slice()); });
        }
      }
    }
    /** t. de subida (90 % → 10 %) y de establecimiento (5 %) de una señal de error decreciente. */
    static times(t, e) {
      const e0 = Math.max(...e.slice(0, 3)) || 1e-12;
      const t90 = t.find((_, i) => e[i] <= 0.9 * e0), t10 = t.find((_, i) => e[i] <= 0.1 * e0);
      let ts = 0; for (let i = e.length - 1; i >= 0; i--) if (e[i] > 0.05 * e0) { ts = t[i]; break; }
      let os = 0, minSoFar = e0;   // «sobreoscilación»: rebote del error respecto a su mínimo previo
      e.forEach(v => { minSoFar = Math.min(minSoFar, v); os = Math.max(os, (v - minSoFar) / e0); });
      return { tr: t10 !== undefined && t90 !== undefined ? t10 - t90 : NaN, ts, rebound: 100 * os, e0 };
    }
  }

  /** Condiciones iniciales aleatorias: perturbación de radio ρ de las posiciones objetivo. */
  function perturb(P, rho, seed = 1, zmin = 0.01) {
    let s = seed >>> 0 || 1;
    const r = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    return P.map(q => {
      let v; do { v = [2 * r() - 1, 2 * r() - 1, 2 * r() - 1]; } while (dot(v, v) > 1);
      const p = add(q, mul(v, rho)); p[2] = Math.max(zmin, p[2]); return p;
    });
  }

  global.FORM = { flipToDelaunay, drawScene, surface, wire, rings, buildShield, circumcircle, inCap, delaunay, rankJR, Sim, perturb, det, halfEllipsoidArea, ellipsePerimeter, v: { sub, add, mul, dot, cross, norm } };
})(window);
