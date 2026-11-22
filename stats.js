/*
  EITA! DADOS — motor estatístico (sem dependências externas)
  © 2026 Lab.EITA/UFG. Autor: Pedro Henrique Gonçalves. Todos os direitos reservados. Implementações conferidas contra SciPy 1.18 e statsmodels.
*/
(function (root) {
  "use strict";
  const S = {};

  // ---------- funções especiais
  function lgamma(x) {
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = c[0]; const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  S.lgamma = lgamma;
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-16, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  // beta incompleta regularizada I_x(a,b)
  function ibeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
  S.ibeta = ibeta;
  // gama incompleta regularizada P(a,x)
  function gammp(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
      return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
    }
    return 1 - gammq_cf(a, x);
  }
  function gammq_cf(a, x) {
    const FPMIN = 1e-300; let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  function gammq(a, x) { if (x <= 0) return 1; return x < a + 1 ? 1 - gammp(a, x) : gammq_cf(a, x); }
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
      t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  // Normal padrão: usa gama incompleta para precisão nas caudas
  S.pnorm = z => z < 0 ? 0.5 * gammq(0.5, z * z / 2) : 1 - 0.5 * gammq(0.5, z * z / 2);
  S.qnorm = p => { // Acklam
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
      b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
      c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
      d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425; let q, r, x;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    // um passo de Newton
    const e = S.pnorm(x) - p; const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2); return x - u / (1 + x * u / 2);
  };
  S.pt2 = (t, df) => ibeta(df / (df + t * t), df / 2, 0.5);           // p bicaudal da t
  S.ptUpper = (t, df) => { const p = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5); return t > 0 ? p : 1 - p; };
  S.qt = (p, df) => { // quantil da t por bisseção (p unicaudal inferior)
    let lo = -1000, hi = 1000;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; (1 - S.ptUpper(m, df) < p) ? lo = m : hi = m; }
    return (lo + hi) / 2;
  };
  S.pf = (F, d1, d2) => F <= 0 ? 1 : ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2); // P(F > f)
  S.pchisq = (x, df) => gammq(df / 2, x / 2);                                   // P(X > x)

  // ---------- utilidades
  const num = v => typeof v === "number" && isFinite(v);
  S.clean = a => a.filter(num);
  S.sum = a => { let s = 0; for (const v of a) s += v; return s; };
  S.mean = a => a.length ? S.sum(a) / a.length : NaN;
  S.variance = a => { const n = a.length; if (n < 2) return NaN; const m = S.mean(a); let s = 0; for (const v of a) s += (v - m) ** 2; return s / (n - 1); };
  S.sd = a => Math.sqrt(S.variance(a));
  S.quantile = (a, p) => { // tipo 7 (padrão do R e do NumPy)
    const s = [...a].sort((x, y) => x - y), n = s.length; if (!n) return NaN;
    const h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h); return s[lo] + (h - lo) * (s[hi] - s[lo]);
  };
  S.median = a => S.quantile(a, 0.5);
  S.rank = a => { // postos médios para empates
    const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); const ties = [];
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const rr = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = rr; if (j > i) ties.push(j - i + 1); i = j + 1;
    }
    r.ties = ties; return r;
  };

  S.describe = arr => {
    const a = S.clean(arr), n = a.length, m = S.mean(a), sd = S.sd(a);
    const out = { n, missing: arr.length - n, mean: m, sd, median: S.median(a), q1: S.quantile(a, .25), q3: S.quantile(a, .75),
      min: n ? Math.min(...a) : NaN, max: n ? Math.max(...a) : NaN };
    out.se = sd / Math.sqrt(n);
    if (n > 1) { const tq = S.qt(0.975, n - 1); out.ci = [m - tq * out.se, m + tq * out.se]; }
    if (n >= 3) { const sw = S.shapiro(a); out.swW = sw.W; out.swP = sw.p; }
    if (n >= 3) { let m3 = 0, m2 = 0; for (const v of a) { m2 += (v - m) ** 2; m3 += (v - m) ** 3; } m2 /= n; m3 /= n; out.skew = m3 / Math.pow(m2, 1.5); }
    return out;
  };

  // ---------- Shapiro-Wilk (Royston 1995, algoritmo AS R94)
  S.shapiro = function (arr) {
    const x = S.clean(arr).sort((a, b) => a - b), n = x.length;
    if (n < 3) return { W: NaN, p: NaN };
    if (x[n - 1] - x[0] < 1e-12) return { W: 1, p: 1 };
    const nn2 = Math.floor(n / 2), a = new Array(nn2 + 1);
    const small = 1e-19;
    const g = [-2.273, .459], c1 = [0, .221157, -.147981, -2.07119, 4.434685, -2.706056], c2 = [0, .042981, -.293762, -1.752461, 5.682633, -3.582633];
    const c3 = [.544, -.39978, .025054, -6.714e-4], c4 = [1.3822, -.77857, .062767, -.0020322], c5 = [-1.5861, -.31082, -.083751, .0038915], c6 = [-.4803, -.082676, .0030302];
    const poly = (cc, xx) => { let r = cc[cc.length - 1]; for (let i = cc.length - 2; i >= 0; i--) r = r * xx + cc[i]; return r; };
    const an = n;
    if (n === 3) a[1] = Math.SQRT1_2;
    else {
      const an25 = an + .25; let summ2 = 0; const m = new Array(nn2 + 1);
      for (let i = 1; i <= nn2; i++) { m[i] = S.qnorm((i - .375) / an25); summ2 += m[i] * m[i]; }
      summ2 *= 2; const ssumm2 = Math.sqrt(summ2), rsn = 1 / Math.sqrt(an);
      const a1 = poly(c1, rsn) - m[1] / ssumm2;
      let i1, fac;
      if (n > 5) {
        i1 = 3; const a2 = -m[2] / ssumm2 + poly(c2, rsn);
        fac = Math.sqrt((summ2 - 2 * m[1] * m[1] - 2 * m[2] * m[2]) / (1 - 2 * a1 * a1 - 2 * a2 * a2)); a[2] = a2;
      } else { i1 = 2; fac = Math.sqrt((summ2 - 2 * m[1] * m[1]) / (1 - 2 * a1 * a1)); }
      a[1] = a1; for (let i = i1; i <= nn2; i++) a[i] = -m[i] / fac;
    }
    // W
    const mean = S.mean(x); let ss = 0; for (const v of x) ss += (v - mean) ** 2;
    let bb = 0; for (let i = 1; i <= nn2; i++) bb += a[i] * (x[n - i] - x[i - 1]);
    let W = Math.min(1, bb * bb / ss); const w1 = 1 - W;
    if (n === 3) { const pi6 = 1.90985931710274, stqr = 1.04719755119660; let p = pi6 * (Math.asin(Math.sqrt(W)) - stqr); return { W, p: Math.max(p, 0) }; }
    const y = Math.log(w1), xx2 = Math.log(an); let m, s;
    if (n <= 11) { const gamma = poly(g, an); if (y >= gamma) return { W, p: small }; const y2 = -Math.log(gamma - y); m = poly(c3, an); s = Math.exp(poly(c4, an)); return { W, p: 1 - S.pnorm((y2 - m) / s) }; }
    m = poly(c5, xx2); s = Math.exp(poly(c6, xx2));
    return { W, p: 1 - S.pnorm((y - m) / s) };
  };

  // ---------- comparação de 2 grupos
  S.ttest = (a0, b0, welch = true) => {
    const a = S.clean(a0), b = S.clean(b0), n1 = a.length, n2 = b.length;
    const m1 = S.mean(a), m2 = S.mean(b), v1 = S.variance(a), v2 = S.variance(b);
    let t, df, se;
    if (welch) { se = Math.sqrt(v1 / n1 + v2 / n2); t = (m1 - m2) / se; df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)); }
    else { const sp = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2); se = Math.sqrt(sp * (1 / n1 + 1 / n2)); t = (m1 - m2) / se; df = n1 + n2 - 2; }
    const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
    const d = (m1 - m2) / sp, J = 1 - 3 / (4 * (n1 + n2) - 9);
    const tq = S.qt(0.975, df);
    return { test: welch ? "t de Welch" : "t de Student", t, df, p: S.pt2(t, df), diff: m1 - m2, ci: [m1 - m2 - tq * se, m1 - m2 + tq * se], d, g: d * J, n1, n2 };
  };
  S.mannwhitney = (a0, b0) => {
    const a = S.clean(a0), b = S.clean(b0), n1 = a.length, n2 = b.length, N = n1 + n2;
    const r = S.rank(a.concat(b)); let R1 = 0; for (let i = 0; i < n1; i++) R1 += r[i];
    const U1 = R1 - n1 * (n1 + 1) / 2, U2 = n1 * n2 - U1, mu = n1 * n2 / 2;
    let tie = 0; for (const t of r.ties) tie += t ** 3 - t;
    const sigma = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tie / (N * (N - 1))));
    const U = Math.max(U1, U2); const z = (U - mu - 0.5) / sigma;   // correção de continuidade (como no SciPy)
    const p = Math.min(1, 2 * (1 - S.pnorm(z)));
    const zs = (U1 - mu) / sigma;
    return { test: "Mann-Whitney U", U: U1, z: zs, p, r: Math.abs(zs) / Math.sqrt(N), n1, n2, rbc: 1 - 2 * Math.min(U1, U2) / (n1 * n2) * 1 * (U1 >= U2 ? 1 : 1) };
  };
  // ---------- k grupos
  S.anova = groups0 => {
    const groups = groups0.map(S.clean).filter(g => g.length), k = groups.length, all = [].concat(...groups), N = all.length, gm = S.mean(all);
    let ssb = 0, ssw = 0; for (const g of groups) { const m = S.mean(g); ssb += g.length * (m - gm) ** 2; for (const v of g) ssw += (v - m) ** 2; }
    const df1 = k - 1, df2 = N - k, F = (ssb / df1) / (ssw / df2);
    return { test: "ANOVA de uma via", F, df1, df2, p: S.pf(F, df1, df2), eta2: ssb / (ssb + ssw), omega2: (ssb - df1 * ssw / df2) / (ssb + ssw + ssw / df2) };
  };
  S.welchAnova = groups0 => {
    const groups = groups0.map(S.clean).filter(g => g.length > 1), k = groups.length;
    const w = groups.map(g => g.length / S.variance(g)), m = groups.map(S.mean), sw = S.sum(w);
    const mw = S.sum(w.map((wi, i) => wi * m[i])) / sw;
    const A = S.sum(w.map((wi, i) => wi * (m[i] - mw) ** 2)) / (k - 1);
    const tmp = S.sum(groups.map((g, i) => (1 - w[i] / sw) ** 2 / (g.length - 1)));
    const B = 1 + 2 * (k - 2) / (k * k - 1) * tmp; const F = A / B, df1 = k - 1, df2 = (k * k - 1) / (3 * tmp);
    return { test: "ANOVA de Welch", F, df1, df2, p: S.pf(F, df1, df2) };
  };
  S.kruskal = groups0 => {
    const groups = groups0.map(S.clean).filter(g => g.length), all = [].concat(...groups), N = all.length, r = S.rank(all);
    let H = 0, o = 0; for (const g of groups) { let R = 0; for (let i = 0; i < g.length; i++) R += r[o + i]; o += g.length; H += R * R / g.length; }
    H = 12 / (N * (N + 1)) * H - 3 * (N + 1);
    let tie = 0; for (const t of r.ties) tie += t ** 3 - t; const C = 1 - tie / (N ** 3 - N); if (C > 0) H /= C;
    const df = groups.length - 1;
    return { test: "Kruskal-Wallis", H, df, p: S.pchisq(H, df), eps2: H / (N - 1), eta2H: (H - groups.length + 1) / (N - groups.length) };
  };
  S.levene = groups0 => { // Brown-Forsythe (centro = mediana), padrão do SciPy
    const groups = groups0.map(S.clean).filter(g => g.length);
    const z = groups.map(g => { const md = S.median(g); return g.map(v => Math.abs(v - md)); });
    const r = S.anova(z); return { test: "Levene (mediana)", W: r.F, df1: r.df1, df2: r.df2, p: r.p };
  };
  // Dunn (post-hoc do Kruskal-Wallis), z com correção de empates
  S.dunn = (groups0, labels) => {
    const groups = groups0.map(S.clean), all = [].concat(...groups), N = all.length, r = S.rank(all);
    let tie = 0; for (const t of r.ties) tie += t ** 3 - t;
    const mr = []; let o = 0; for (const g of groups) { let R = 0; for (let i = 0; i < g.length; i++) R += r[o + i]; o += g.length; mr.push(R / g.length); }
    const out = [];
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      if (!groups[i].length || !groups[j].length) continue;
      const se = Math.sqrt((N * (N + 1) / 12 - tie / (12 * (N - 1))) * (1 / groups[i].length + 1 / groups[j].length));
      const z = (mr[i] - mr[j]) / se; out.push({ a: labels[i], b: labels[j], stat: z, p: 2 * (1 - S.pnorm(Math.abs(z))) });
    }
    return S.holm(out);
  };
  S.pairwiseT = (groups0, labels) => {
    const out = []; for (let i = 0; i < groups0.length; i++) for (let j = i + 1; j < groups0.length; j++) {
      const a = S.clean(groups0[i]), b = S.clean(groups0[j]); if (a.length < 2 || b.length < 2) continue;
      const r = S.ttest(a, b, true); out.push({ a: labels[i], b: labels[j], stat: r.t, p: r.p, diff: r.diff });
    } return S.holm(out);
  };
  S.holm = rows => {
    const m = rows.length, ord = rows.map((r, i) => [r.p, i]).sort((a, b) => a[0] - b[0]); let prev = 0;
    ord.forEach(([p, i], k) => { const adj = Math.min(1, Math.max(prev, (m - k) * p)); prev = adj; rows[i].pAdj = adj; });
    return rows;
  };

  // ---------- tabelas de contingência
  S.crosstab = (x, y) => { // x e y: arrays de rótulos (null = ausente)
    const rows = [], cols = [], cell = new Map();
    for (let i = 0; i < x.length; i++) {
      const a = x[i], b = y[i]; if (a == null || b == null) continue;
      if (!rows.includes(a)) rows.push(a); if (!cols.includes(b)) cols.push(b);
      const k = a + "\u0001" + b; cell.set(k, (cell.get(k) || 0) + 1);
    }
    const m = rows.map(a => cols.map(b => cell.get(a + "\u0001" + b) || 0)); return { rows, cols, m };
  };
  S.chisq = (m, yates) => {
    const R = m.length, C = m[0].length, rs = m.map(S.sum), cs = m[0].map((_, j) => S.sum(m.map(r => r[j]))), N = S.sum(rs);
    if (yates === undefined) yates = R === 2 && C === 2;
    let X2 = 0, minE = Infinity, lowE = 0;
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      const E = rs[i] * cs[j] / N; minE = Math.min(minE, E); if (E < 5) lowE++;
      let d = Math.abs(m[i][j] - E); if (yates) d = Math.max(0, d - 0.5); X2 += d * d / E;
    }
    const df = (R - 1) * (C - 1);
    return { test: yates ? "Qui-quadrado (correção de Yates)" : "Qui-quadrado de Pearson", X2, df, p: S.pchisq(X2, df), minE, lowEPct: lowE / (R * C),
      V: Math.sqrt((yates ? S.chisq(m, false).X2 : X2) / (N * (Math.min(R, C) - 1))), N };
  };
  S.fisher2x2 = m => {
    const [[a, b], [c, d]] = m, r1 = a + b, r2 = c + d, c1 = a + c, N = r1 + r2;
    const lf = k => lgamma(k + 1); const base = lf(r1) + lf(r2) + lf(c1) + lf(N - c1) - lf(N);
    const pr = x => Math.exp(base - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(r2 - c1 + x));
    const p0 = pr(a); let p = 0; const lo = Math.max(0, c1 - r2), hi = Math.min(r1, c1);
    for (let x = lo; x <= hi; x++) { const px = pr(x); if (px <= p0 * (1 + 1e-7)) p += px; }
    const or = (a * d) / (b * c);
    return { test: "Exato de Fisher", p: Math.min(1, p), or };
  };
  // Qui-quadrado por Monte Carlo (Fisher-Freeman-Halton aproximado para tabelas R×C pequenas)
  S.chisqMC = (m, B = 10000, seed = 12345) => {
    const R = m.length, C = m[0].length, rs = m.map(S.sum), cs = m[0].map((_, j) => S.sum(m.map(r => r[j]))), N = S.sum(rs);
    const stat = t => { let s = 0; for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const E = rs[i] * cs[j] / N; s += (t[i][j] - E) ** 2 / E; } return s; };
    const obs = stat(m); let s = seed >>> 0; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const colLab = []; cs.forEach((c, j) => { for (let k = 0; k < c; k++) colLab.push(j); });
    let ge = 0;
    for (let b = 0; b < B; b++) {
      for (let i = colLab.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = colLab[i]; colLab[i] = colLab[j]; colLab[j] = t; }
      const t = Array.from({ length: R }, () => new Array(C).fill(0)); let o = 0;
      for (let i = 0; i < R; i++) for (let k = 0; k < rs[i]; k++) t[i][colLab[o++]]++;
      if (stat(t) >= obs - 1e-9) ge++;
    }
    return { test: "Qui-quadrado com p por Monte Carlo (" + B + " simulações)", X2: obs, p: (ge + 1) / (B + 1) };
  };

  // ---------- correlação
  S.pearson = (x0, y0) => {
    const x = [], y = []; for (let i = 0; i < x0.length; i++) if (num(x0[i]) && num(y0[i])) { x.push(x0[i]); y.push(y0[i]); }
    const n = x.length; if (n < 3) return { r: NaN, p: NaN, n };
    const mx = S.mean(x), my = S.mean(y); let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    const r = sxy / Math.sqrt(sxx * syy), df = n - 2, t = r * Math.sqrt(df / Math.max(1e-300, 1 - r * r));
    const z = Math.atanh(r), se = 1 / Math.sqrt(n - 3), zq = 1.959963984540054;
    return { test: "Pearson", r, p: Math.abs(r) >= 1 ? 0 : S.pt2(t, df), n, ci: n > 3 ? [Math.tanh(z - zq * se), Math.tanh(z + zq * se)] : null, slope: sxy / sxx, intercept: my - sxy / sxx * mx };
  };
  S.spearman = (x0, y0) => {
    const x = [], y = []; for (let i = 0; i < x0.length; i++) if (num(x0[i]) && num(y0[i])) { x.push(x0[i]); y.push(y0[i]); }
    const r = S.pearson(S.rank(x), S.rank(y)); r.test = "Spearman"; delete r.ci; return r;
  };

  // ---------- confiabilidade
  S.cronbach = items => { // items: array de colunas
    const n = items[0].length, k = items.length, rows = [];
    for (let i = 0; i < n; i++) { const r = items.map(c => c[i]); if (r.every(num)) rows.push(r); }
    const calc = cols => {
      const kk = cols.length; if (kk < 2 || rows.length < 3) return NaN;
      const vs = cols.map(j => S.variance(rows.map(r => r[j]))), tot = S.variance(rows.map(r => S.sum(cols.map(j => r[j]))));
      return kk / (kk - 1) * (1 - S.sum(vs) / tot);
    };
    const all = [...Array(k).keys()];
    return { alpha: calc(all), n: rows.length, k, ifDeleted: all.map(j => calc(all.filter(x => x !== j))),
      itemTotal: all.map(j => S.pearson(rows.map(r => r[j]), rows.map(r => S.sum(all.filter(x => x !== j).map(x => r[x])))).r) };
  };

  // ---------- regressão linear múltipla (MQO)
  function invert(A) {
    const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map(r => r.slice(n));
  }
  S.ols = (y0, X0, names) => { // X0: linhas de preditores (sem intercepto)
    const y = [], X = []; for (let i = 0; i < y0.length; i++) if (num(y0[i]) && X0[i].every(num)) { y.push(y0[i]); X.push([1, ...X0[i]]); }
    const n = y.length, p = X[0] ? X[0].length : 0; if (n <= p + 1) return { error: "Poucos casos completos (" + n + ") para " + (p - 1) + " preditores." };
    const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => S.sum(X.map(r => r[i] * r[j]))));
    const inv = invert(XtX); if (!inv) return { error: "Preditores colineares (a matriz não pôde ser invertida). Retire uma variável." };
    const Xty = Array.from({ length: p }, (_, i) => S.sum(X.map((r, k) => r[i] * y[k])));
    const b = inv.map(r => S.sum(r.map((v, j) => v * Xty[j])));
    const yhat = X.map(r => S.sum(r.map((v, j) => v * b[j]))), res = y.map((v, i) => v - yhat[i]);
    const sse = S.sum(res.map(e => e * e)), my = S.mean(y), sst = S.sum(y.map(v => (v - my) ** 2)), df = n - p, s2 = sse / df;
    const tq = S.qt(0.975, df);
    const coef = b.map((bi, i) => { const se = Math.sqrt(s2 * inv[i][i]), t = bi / se; return { name: i ? names[i - 1] : "(Intercepto)", b: bi, se, t, p: S.pt2(t, df), ci: [bi - tq * se, bi + tq * se] }; });
    const R2 = 1 - sse / sst, F = ((sst - sse) / (p - 1)) / s2;
    // betas padronizados
    const sy = S.sd(y); coef.forEach((c, i) => { if (i) c.beta = c.b * S.sd(X.map(r => r[i])) / sy; });
    return { coef, n, R2, adjR2: 1 - (1 - R2) * (n - 1) / df, F, df1: p - 1, df2: df, p: S.pf(F, p - 1, df), resid: res, fitted: yhat, swP: S.shapiro(res).p };
  };

  // ---------- amostras pareadas e uma amostra
  S.pairedT = (a0, b0) => { // b - a (depois - antes)
    const d = []; for (let i = 0; i < a0.length; i++) if (num(a0[i]) && num(b0[i])) d.push(b0[i] - a0[i]);
    const n = d.length, m = S.mean(d), sd = S.sd(d), se = sd / Math.sqrt(n), t = m / se, df = n - 1, tq = S.qt(0.975, df);
    return { test: "t pareado", t, df, p: S.pt2(t, df), n, diff: m, sdDiff: sd, ci: [m - tq * se, m + tq * se], dz: m / sd };
  };
  S.wilcoxon = (a0, b0) => { // postos sinalizados; zeros descartados (Wilcoxon); aproximação normal com correção de empates
    const d = []; for (let i = 0; i < a0.length; i++) if (num(a0[i]) && num(b0[i])) { const x = b0[i] - a0[i]; if (x !== 0) d.push(x); }
    const n = d.length; if (n < 1) return { test: "Wilcoxon (postos sinalizados)", p: NaN, n: 0 };
    const r = S.rank(d.map(Math.abs)); let Wp = 0; d.forEach((x, i) => { if (x > 0) Wp += r[i]; });
    const Wm = n * (n + 1) / 2 - Wp, mu = n * (n + 1) / 4; let tie = 0; for (const t of r.ties) tie += t ** 3 - t;
    const sigma = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - tie / 48), z = (Wp - mu) / sigma;
    return { test: "Wilcoxon (postos sinalizados)", W: Math.min(Wp, Wm), Wpos: Wp, z, p: Math.min(1, 2 * (1 - S.pnorm(Math.abs(z)))), n, r: Math.abs(z) / Math.sqrt(n) };
  };
  S.oneSampleT = (a0, mu) => { const a = S.clean(a0), n = a.length, m = S.mean(a), sd = S.sd(a), se = sd / Math.sqrt(n), t = (m - mu) / se, df = n - 1, tq = S.qt(0.975, df);
    return { test: "t para uma amostra", t, df, p: S.pt2(t, df), n, mean: m, diff: m - mu, ci: [m - tq * se, m + tq * se], d: (m - mu) / sd }; };
  S.oneSampleWilcoxon = (a0, mu) => { const a = S.clean(a0); const r = S.wilcoxon(a.map(() => mu), a); r.test = "Wilcoxon para uma amostra"; return r; };

  // ---------- regressão logística (IRLS)
  S.logistic = (y0, X0, names) => {
    const y = [], X = []; for (let i = 0; i < y0.length; i++) if ((y0[i] === 0 || y0[i] === 1) && X0[i].every(num)) { y.push(y0[i]); X.push([1, ...X0[i]]); }
    const n = y.length, p = X[0] ? X[0].length : 0, ev = S.sum(y);
    if (n <= p || ev === 0 || ev === n) return { error: "Poucos casos ou o desfecho não varia nos casos completos." };
    let b = new Array(p).fill(0); b[0] = Math.log(ev / (n - ev)); let ll = -Infinity, inv = null, conv = false, it = 0;
    const loglik = bb => { let s = 0; for (let i = 0; i < n; i++) { const e = S.sum(X[i].map((v, j) => v * bb[j])); s += y[i] * e - Math.log1p(Math.exp(e)); } return s; };
    for (it = 0; it < 60; it++) {
      const H = Array.from({ length: p }, () => new Array(p).fill(0)), g = new Array(p).fill(0);
      for (let i = 0; i < n; i++) { const e = S.sum(X[i].map((v, j) => v * b[j])), pi = 1 / (1 + Math.exp(-e)), w = pi * (1 - pi);
        for (let j = 0; j < p; j++) { g[j] += X[i][j] * (y[i] - pi); for (let k = 0; k < p; k++) H[j][k] += X[i][j] * X[i][k] * w; } }
      inv = invert(H); if (!inv) return { error: "Preditores colineares ou separação perfeita: retire ou junte categorias." };
      const step = inv.map(r => S.sum(r.map((v, k) => v * g[k]))); const nb = b.map((v, j) => v + step[j]); const nl = loglik(nb);
      b = nb; if (Math.abs(nl - ll) < 1e-10) { ll = nl; conv = true; break; } ll = nl;
    }
    const ll0 = ev * Math.log(ev / n) + (n - ev) * Math.log(1 - ev / n), LR = 2 * (ll - ll0);
    const coxsnell = 1 - Math.exp(-LR / n), nag = coxsnell / (1 - Math.exp(2 * ll0 / n)), z975 = 1.959963984540054;
    const coef = b.map((bi, i) => { const se = Math.sqrt(inv[i][i]), z = bi / se; return { name: i ? names[i - 1] : "(Intercepto)", b: bi, se, z, p: 2 * (1 - S.pnorm(Math.abs(z))), or: Math.exp(bi), ci: [Math.exp(bi - z975 * se), Math.exp(bi + z975 * se)] }; });
    const sep = coef.some(c => c.se > 50);
    let correct = 0; for (let i = 0; i < n; i++) { const e = S.sum(X[i].map((v, j) => v * b[j])); if ((e >= 0 ? 1 : 0) === y[i]) correct++; }
    return { coef, n, events: ev, LR, df: p - 1, p: S.pchisq(LR, p - 1), nagelkerke: nag, ll, converged: conv, separation: sep, accuracy: correct / n };
  };

  // ---------- formatação (padrão de artigo em português)
  S.fmtP = p => !isFinite(p) ? "—" : p < 0.001 ? "<0,001" : p.toFixed(3).replace(".", ",");
  S.fmt = (v, d = 2) => !isFinite(v) ? "—" : v.toFixed(d).replace(".", ",").replace("-", "−");

  root.EStats = S;
  if (typeof module !== "undefined") module.exports = S;
})(typeof window !== "undefined" ? window : globalThis);
