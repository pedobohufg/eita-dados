/*
  EITA! DADOS — gráficos em SVG (sem bibliotecas). Cores explícitas para que a exportação em PNG/SVG saia igual à tela.
  © 2026 Lab.EITA/UFG. Autor: Pedro Henrique Gonçalves. Todos os direitos reservados.
*/
(function (root) {
  "use strict";
  const C = {
    ink: "#1C1730", ink2: "#5E5878", muted: "#8E88A6", grid: "#ECE8F5", axis: "#CFC6E6", surface: "#FFFFFF",
    brand: "#6B3FD6", brandSoft: "#B79BFF", dim: "#D9D2EE",
    // paleta categórica validada (ordem fixa, nunca reciclada)
    cat: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
    other: "#A8A3B8",
    // rampa sequencial violeta (claro -> escuro) para escalas ordinais e mapas de calor
    seq: ["#E9E1FD", "#D3C2FB", "#B79BFF", "#9560FD", "#7A45E8", "#6B3FD6", "#4F2BA8", "#3A1F82", "#22164A"],
  };
  const font = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (v, d) => { if (v == null || !isFinite(v)) return "—"; if (d == null) d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2; return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: d }); };
  const tw = (s, size) => String(s).length * (size || 12) * 0.56; // largura aproximada do texto
  const trunc = (s, w, size) => { s = String(s); if (tw(s, size) <= w) return s; let n = Math.max(3, Math.floor(w / ((size || 12) * 0.56)) - 1); return s.slice(0, n) + "…"; };
  const nice = (max, n) => { if (!(max > 0)) return { max: 1, step: 0.25 }; const raw = max / (n || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; const st = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; return { max: Math.ceil(max / st - 1e-9) * st, step: st }; };
  const ticks = (lo, hi, n) => { const span = hi - lo; const { step } = nice(span, n || 5); const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10)); return out; };
  const svgOpen = (w, h, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label || "Gráfico")}" style="font-family:${font};display:block;overflow:visible">`;
  const txt = (x, y, s, o) => { o = o || {}; return `<text x="${x}" y="${y}" font-size="${o.size || 12}" fill="${o.fill || C.ink2}" text-anchor="${o.anchor || "start"}"${o.weight ? ` font-weight="${o.weight}"` : ""}${o.base ? ` dominant-baseline="${o.base}"` : ' dominant-baseline="middle"'}${o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : ""}>${esc(s)}</text>`; };
  // barra com ponta arredondada só no lado do valor
  const barPath = (x, y, w, h, r, horiz) => {
    if (w <= 0 || h <= 0) return ""; r = Math.min(r, horiz ? h / 2 : w / 2, horiz ? w : h);
    if (horiz) return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  };

  // ---------- dica ao passar o mouse
  let tip;
  function tipEl() { if (!tip) { tip = document.createElement("div"); tip.className = "ch-tip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); } return tip; }
  function bindTips(el, data) {
    const t = tipEl();
    el.querySelectorAll("[data-tip]").forEach(n => {
      n.addEventListener("mouseenter", () => { const d = data[+n.dataset.tip]; if (!d) return; t.innerHTML = d; t.style.display = "block"; n.classList.add("hov"); });
      n.addEventListener("mousemove", e => { const pad = 14, r = t.getBoundingClientRect(); let x = e.clientX + pad, y = e.clientY + pad; if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad; if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad; t.style.left = x + "px"; t.style.top = y + "px"; });
      n.addEventListener("mouseleave", () => { t.style.display = "none"; n.classList.remove("hov"); });
    });
  }
  function bindClicks(el, cb) { if (!cb) return; el.querySelectorAll("[data-key]").forEach(n => { n.style.cursor = "pointer"; n.addEventListener("click", e => cb(n.dataset.key, e)); }); }
  const tipHtml = (title, rows) => `<b>${esc(title)}</b>` + rows.map(([k, v, sw]) => `<div class="r">${sw ? `<i style="background:${sw}"></i>` : ""}<span>${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join("");

  const E = { C, fmt, esc };

  // ---------- barras simples (contagens). horizontal para rótulos longos, vertical para ordem/tempo
  E.bar = (el, o) => {
    const W = Math.max(260, el.clientWidth || 400), cats = o.cats, total = o.total || cats.reduce((s, c) => s + c.value, 0);
    const tips = []; let s;
    const horiz = o.horizontal !== false;
    const sel = o.selected; const anySel = sel && sel.size;
    const col = c => anySel && !sel.has(c.key ?? c.label) ? C.dim : (o.color || C.brand);
    if (horiz) {
      const bh = Math.max(14, Math.min(24, o.barH || 22)), gap = 8, L = Math.min(W * 0.45, Math.max(...cats.map(c => tw(c.label)), 40) + 20), R = 70;
      const H = cats.length * (bh + gap) + 6, max = o.max || Math.max(...cats.map(c => c.value), 1), sx = v => (W - L - R) * v / max;
      s = svgOpen(W, H, o.title);
      cats.forEach((c, i) => {
        const y = i * (bh + gap) + 3, w = Math.max(c.value > 0 ? 2 : 0, sx(c.value));
        tips.push(tipHtml(c.label, [["n", fmt(c.value, 0)], ["%", fmt(100 * c.value / (c.base || total), 1) + "%"], ...(c.extra || [])]));
        s += `<g data-tip="${i}" data-key="${esc(c.key ?? c.label)}"><rect x="0" y="${y - 3}" width="${W}" height="${bh + gap}" fill="transparent"/>`;
        s += txt(L - 8, y + bh / 2, trunc(c.label, L - 10), { anchor: "end", fill: C.ink });
        s += `<path d="${barPath(L, y, w, bh, 4, true)}" fill="${col(c)}"/>`;
        s += txt(L + w + 6, y + bh / 2, o.pct === false ? fmt(c.value) : `${fmt(c.value, 0)} · ${fmt(100 * c.value / (c.base || total), 0)}%`, { fill: C.ink2, size: 11.5 });
        s += `</g>`;
      });
    } else {
      const H = o.height || 220, B = 44, T = 18, Lm = 36, n = cats.length, max = nice(o.max || Math.max(...cats.map(c => c.value), 4)).max;
      const bw = (W - Lm - 6) / n, sy = v => (H - B - T) * v / max;
      s = svgOpen(W, H, o.title);
      ticks(0, max, 4).forEach(t => { const y = H - B - sy(t); s += `<line x1="${Lm}" x2="${W}" y1="${y}" y2="${y}" stroke="${C.grid}"/>` + txt(Lm - 6, y, fmt(t), { anchor: "end", size: 10.5, fill: C.muted }); });
      const rot = cats.some(c => tw(c.label, 11) > bw - 4);
      cats.forEach((c, i) => {
        const x = Lm + i * bw, h = sy(c.value), w = Math.max(2, Math.min(56, bw * 0.72));
        tips.push(tipHtml(c.label, [["n", fmt(c.value, 0)], ["%", fmt(100 * c.value / (c.base || total), 1) + "%"], ...(c.extra || [])]));
        s += `<g data-tip="${i}" data-key="${esc(c.key ?? c.label)}"><rect x="${x}" y="${T}" width="${bw}" height="${H - T}" fill="transparent"/>`;
        s += `<path d="${barPath(x + (bw - w) / 2, H - B - h, w, h, 4, false)}" fill="${col(c)}"/>`;
        if (n <= 14 && c.value) s += txt(x + bw / 2, H - B - h - 8, fmt(c.value, 0), { anchor: "middle", size: 11, fill: C.ink2 });
        s += rot ? txt(x + bw / 2, H - B + 10, trunc(c.label, B + 20, 10.5), { anchor: "end", size: 10.5, rot: -35, fill: C.ink2 })
          : txt(x + bw / 2, H - B + 14, trunc(c.label, bw, 11), { anchor: "middle", size: 11, fill: C.ink2 });
        s += `</g>`;
      });
      s += `<line x1="${Lm}" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="${C.axis}"/>`;
    }
    el.innerHTML = s + "</svg>"; bindTips(el, tips); bindClicks(el, o.onClick);
  };

  // ---------- barras agrupadas por uma segunda variável (empilhadas, opcionalmente em 100%)
  E.stacked = (el, o) => {
    const W = Math.max(280, el.clientWidth || 400), cats = o.cats, series = o.series, pct = !!o.percent;
    const colors = o.colors || series.map((_, i) => i < C.cat.length ? C.cat[i] : C.other);
    const bh = 20, gap = 10, L = Math.min(W * 0.42, Math.max(...cats.map(c => tw(c)), 40) + 12), R = 46;
    const totals = cats.map((_, i) => series.reduce((s, se) => s + se.values[i], 0));
    const max = pct ? 100 : Math.max(...totals, 1), sx = v => (W - L - R) * v / max;
    const legendH = 10 + 18 * legendRows(series.map(se => se.name), 0, W), H = legendH + cats.length * (bh + gap) + 20; const tips = [];
    let s = svgOpen(W, H, o.title);
    s += legend(series.map(se => se.name), colors, 0, 4, W);
    ticks(0, max, 4).forEach(t => { const x = L + sx(t); s += `<line x1="${x}" x2="${x}" y1="${legendH}" y2="${H - 18}" stroke="${C.grid}"/>` + txt(x, H - 8, fmt(t) + (pct ? "%" : ""), { anchor: "middle", size: 10.5, fill: C.muted }); });
    cats.forEach((c, i) => {
      const y = legendH + i * (bh + gap) + 4; let x = L;
      s += txt(L - 10, y + bh / 2, trunc(c, L - 14), { anchor: "end", fill: C.ink });
      series.forEach((se, j) => {
        const v = se.values[i], vv = pct ? (totals[i] ? 100 * v / totals[i] : 0) : v, w = sx(vv); if (w <= 0) return;
        tips.push(tipHtml(c, [[se.name, `${fmt(v, 0)} (${fmt(totals[i] ? 100 * v / totals[i] : 0, 1)}%)`, colors[j]], ["Total da barra", fmt(totals[i], 0)]]));
        s += `<rect data-tip="${tips.length - 1}" data-key="${esc(c)}" x="${x + (j ? 1 : 0)}" y="${y}" width="${Math.max(0.5, w - (j ? 1 : 0) - 1)}" height="${bh}" rx="${w > 6 ? 3 : 0}" fill="${colors[j]}"/>`;
        if (w > 30 && (pct || series.length <= 6)) s += txt(x + w / 2, y + bh / 2, pct ? fmt(vv, 0) + "%" : fmt(v, 0), { anchor: "middle", size: 10.5, fill: "#fff", weight: 600 });
        x += w;
      });
      if (!pct) s += txt(x + 6, y + bh / 2, fmt(totals[i], 0), { size: 11, fill: C.ink2 });
    });
    el.innerHTML = s + "</svg>"; bindTips(el, tips); bindClicks(el, o.onClick);
  };
  function legendRows(names, x0, W) { let x = x0, rows = 1; names.forEach(n => { const w = 18 + tw(trunc(n, 160, 11.5), 11.5) + 14; if (x + w > W && x > x0) { x = x0; rows++; } x += w; }); return rows; }
  function legend(names, colors, x0, y0, W) {
    let s = "", x = x0, y = y0;
    names.forEach((n, i) => { const w = 18 + tw(trunc(n, 160, 11.5), 11.5) + 14; if (x + w > W && x > x0) { x = x0; y += 18; } s += `<rect x="${x}" y="${y + 3}" width="10" height="10" rx="2" fill="${colors[i]}"/>` + txt(x + 15, y + 8, trunc(n, 160, 11.5), { size: 11.5, fill: C.ink2 }); x += w; });
    return s;
  }
  E.legend = legend;

  // ---------- escalas ordinais (Likert / tarefas motoras): barras 100% com rampa sequencial
  E.likert = (el, o) => {
    const k = o.levels.length; const ramp = o.colors || (k <= 1 ? [C.brand] : o.levels.map((_, i) => C.seq[Math.round(1 + i * (C.seq.length - 2) / (k - 1))]));
    E.stacked(el, { title: o.title, cats: o.items.map(it => it.label), series: o.levels.map((l, j) => ({ name: l, values: o.items.map(it => it.counts[j]) })), percent: true, colors: ramp });
  };

  // ---------- histograma
  E.hist = (el, o) => {
    const vals = o.values.filter(v => v != null && isFinite(v)); const W = Math.max(260, el.clientWidth || 400), H = o.height || 220, B = 34, T = 14, Lm = 36;
    if (!vals.length) { el.innerHTML = `<p class="vazio">Sem valores.</p>`; return; }
    let lo = Math.min(...vals), hi = Math.max(...vals); if (lo === hi) { lo -= 0.5; hi += 0.5; }
    const isInt = vals.every(Number.isInteger) && hi - lo <= 20;
    let edges;
    if (isInt) { edges = []; for (let v = Math.floor(lo); v <= Math.ceil(hi) + 1; v++) edges.push(v - 0.5); }
    else { const nb = o.bins || Math.min(24, Math.max(6, Math.ceil(Math.log2(vals.length) + 1) * 2)); const tk = ticks(lo, hi, nb); const st = tk[1] - tk[0]; edges = []; for (let v = Math.floor(lo / st) * st; v <= hi + st; v += st) edges.push(+v.toFixed(10)); }
    const counts = new Array(edges.length - 1).fill(0); vals.forEach(v => { let i = edges.findIndex((e, j) => j < edges.length - 1 && v >= e && v < edges[j + 1]); if (i < 0) i = counts.length - 1; counts[i]++; });
    const max = nice(Math.max(...counts)).max, x0 = edges[0], x1 = edges[edges.length - 1], sx = v => Lm + (W - Lm - 8) * (v - x0) / (x1 - x0), sy = v => (H - B - T) * v / max;
    let s = svgOpen(W, H, o.title); const tips = [];
    ticks(0, max, 4).forEach(t => { const y = H - B - sy(t); s += `<line x1="${Lm}" x2="${W}" y1="${y}" y2="${y}" stroke="${C.grid}"/>` + txt(Lm - 6, y, fmt(t), { anchor: "end", size: 10.5, fill: C.muted }); });
    counts.forEach((c, i) => {
      const xa = sx(edges[i]), xb = sx(edges[i + 1]), h = sy(c);
      tips.push(tipHtml(isInt ? fmt(edges[i] + 0.5) : `${fmt(edges[i])} a ${fmt(edges[i + 1])}`, [["n", fmt(c, 0)], ["%", fmt(100 * c / vals.length, 1) + "%"]]));
      s += `<g data-tip="${i}"><rect x="${xa}" y="${T}" width="${xb - xa}" height="${H - B - T}" fill="transparent"/><path d="${barPath(xa + 1, H - B - h, Math.max(1, xb - xa - 2), h, 3, false)}" fill="${o.color || C.brand}"/></g>`;
    });
    const xt = isInt ? edges.slice(0, -1).map(e => e + 0.5).filter((_, i, a) => a.length <= 12 || i % Math.ceil(a.length / 12) === 0) : ticks(x0, x1, 6);
    xt.forEach(t => s += txt(sx(t), H - B + 14, fmt(t), { anchor: "middle", size: 10.5, fill: C.ink2 }));
    s += `<line x1="${Lm}" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="${C.axis}"/>`;
    if (o.xLabel) s += txt((Lm + W) / 2, H - 6, o.xLabel, { anchor: "middle", size: 11, fill: C.muted });
    // média e mediana
    const m = vals.reduce((a, b) => a + b, 0) / vals.length; s += `<line x1="${sx(m)}" x2="${sx(m)}" y1="${T}" y2="${H - B}" stroke="${C.ink}" stroke-dasharray="3 3"/>` + txt(sx(m) + 4, T + 4, "média " + fmt(m), { size: 10.5, fill: C.ink });
    el.innerHTML = s + "</svg>"; bindTips(el, tips);
  };

  // ---------- boxplot com pontos
  E.box = (el, o) => {
    const groups = o.groups.filter(g => g.values.length), W = Math.max(280, el.clientWidth || 400);
    if (!groups.length) { el.innerHTML = `<p class="vazio">Sem valores.</p>`; return; }
    const all = groups.flatMap(g => g.values); let lo = o.domain ? o.domain[0] : Math.min(...all), hi = o.domain ? o.domain[1] : Math.max(...all); if (lo === hi) { lo -= 1; hi += 1; }
    const tk = ticks(lo, hi, 5); lo = Math.min(lo, tk[0]); hi = Math.max(hi, tk[tk.length - 1]);
    const rowH = Math.max(30, Math.min(46, o.rowH || 40)), L = Math.min(W * 0.4, Math.max(...groups.map(g => tw(g.label)), 30) + 14), R = 16, T = 6, H = groups.length * rowH + T + 28 + (o.xLabel ? 16 : 0);
    const sx = v => L + (W - L - R) * (v - lo) / (hi - lo); const S = root.EStats;
    let s = svgOpen(W, H, o.title); const tips = [];
    tk.forEach(t => { const x = sx(t); s += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - 24 - (o.xLabel ? 16 : 0)}" stroke="${C.grid}"/>` + txt(x, H - 12 - (o.xLabel ? 16 : 0), fmt(t), { anchor: "middle", size: 10.5, fill: C.muted }); });
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    groups.forEach((g, i) => {
      const cy = T + i * rowH + rowH / 2, v = g.values, q1 = S.quantile(v, .25), md = S.median(v), q3 = S.quantile(v, .75), iqr = q3 - q1;
      const wl = Math.min(...v.filter(x => x >= q1 - 1.5 * iqr)), wh = Math.max(...v.filter(x => x <= q3 + 1.5 * iqr)), mean = S.mean(v), col = g.color || C.brand;
      tips.push(tipHtml(g.label, [["n", fmt(v.length, 0)], ["Média ± DP", `${fmt(mean)} ± ${fmt(S.sd(v))}`], ["Mediana [IIQ]", `${fmt(md)} [${fmt(q1)}; ${fmt(q3)}]`], ["Mín – máx", `${fmt(Math.min(...v))} – ${fmt(Math.max(...v))}`]]));
      s += `<g data-tip="${i}" data-key="${esc(g.key ?? g.label)}"><rect x="0" y="${cy - rowH / 2}" width="${W}" height="${rowH}" fill="transparent"/>`;
      s += txt(L - 10, cy, trunc(g.label, L - 14), { anchor: "end", fill: C.ink });
      s += `<line x1="${sx(wl)}" x2="${sx(wh)}" y1="${cy}" y2="${cy}" stroke="${C.ink2}"/>`;
      s += `<rect x="${sx(q1)}" y="${cy - 9}" width="${Math.max(1, sx(q3) - sx(q1))}" height="18" rx="3" fill="${col}" fill-opacity=".22" stroke="${col}" stroke-width="1.5"/>`;
      s += `<line x1="${sx(md)}" x2="${sx(md)}" y1="${cy - 9}" y2="${cy + 9}" stroke="${col}" stroke-width="2.5"/>`;
      if (o.points !== false && v.length <= 400) v.forEach(x => { s += `<circle cx="${sx(x)}" cy="${cy + (rnd() - 0.5) * (rowH - 16)}" r="2.6" fill="${col}" fill-opacity=".45"/>`; });
      s += `<path d="M${sx(mean)},${cy - 5}l5,5l-5,5l-5,-5z" fill="#fff" stroke="${C.ink}" stroke-width="1.5"/>`;
      s += `</g>`;
    });
    if (o.xLabel) s += txt((L + W) / 2, H - 1, o.xLabel, { anchor: "middle", size: 11, fill: C.muted, base: "auto" });
    el.innerHTML = s + "</svg>"; bindTips(el, tips); bindClicks(el, o.onClick);
  };

  // ---------- médias com IC 95% (itens de escala)
  E.means = (el, o) => {
    const items = o.items, W = Math.max(280, el.clientWidth || 400), rowH = 26, L = Math.min(W * 0.5, Math.max(...items.map(i => tw(i.label)), 30) + 14), R = 52, T = 4, H = items.length * rowH + T + 26;
    const [lo, hi] = o.domain; const sx = v => L + (W - L - R) * (v - lo) / (hi - lo);
    let s = svgOpen(W, H, o.title); const tips = [];
    ticks(lo, hi, 5).forEach(t => { const x = sx(t); s += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - 22}" stroke="${C.grid}"/>` + txt(x, H - 10, fmt(t), { anchor: "middle", size: 10.5, fill: C.muted }); });
    items.forEach((it, i) => {
      const cy = T + i * rowH + rowH / 2;
      tips.push(tipHtml(it.label, [["n", fmt(it.n, 0)], ["Média", fmt(it.mean)], ["IC 95%", `${fmt(it.lo)} a ${fmt(it.hi)}`], ...(it.extra || [])]));
      s += `<g data-tip="${i}"><rect x="0" y="${cy - rowH / 2}" width="${W}" height="${rowH}" fill="transparent"/>` + txt(L - 10, cy, trunc(it.label, L - 14), { anchor: "end", fill: C.ink });
      if (isFinite(it.mean)) {
        s += `<line x1="${sx(lo)}" x2="${sx(it.mean)}" y1="${cy}" y2="${cy}" stroke="${C.brandSoft}" stroke-width="2"/>`;
        if (isFinite(it.lo)) s += `<line x1="${sx(Math.max(lo, it.lo))}" x2="${sx(Math.min(hi, it.hi))}" y1="${cy}" y2="${cy}" stroke="${C.ink}" stroke-width="1.5"/><line x1="${sx(Math.max(lo, it.lo))}" x2="${sx(Math.max(lo, it.lo))}" y1="${cy - 4}" y2="${cy + 4}" stroke="${C.ink}"/><line x1="${sx(Math.min(hi, it.hi))}" x2="${sx(Math.min(hi, it.hi))}" y1="${cy - 4}" y2="${cy + 4}" stroke="${C.ink}"/>`;
        if (isFinite(it.ref)) s += `<line x1="${sx(it.ref)}" x2="${sx(it.ref)}" y1="${cy - 9}" y2="${cy + 9}" stroke="${C.cat[1]}" stroke-width="3"/>`;
        s += `<circle cx="${sx(it.mean)}" cy="${cy}" r="5.5" fill="${it.color || C.brand}" stroke="#fff" stroke-width="2"/>` + txt(W - R + 8, cy, fmt(it.mean, 1), { size: 11.5, fill: C.ink, weight: 600 });
      }
      s += `</g>`;
    });
    el.innerHTML = s + "</svg>"; bindTips(el, tips);
  };

  // ---------- dispersão
  E.scatter = (el, o) => {
    const pts = o.points.filter(p => isFinite(p.x) && isFinite(p.y)), W = Math.max(280, el.clientWidth || 400), H = o.height || 300, L = 46, B = 40, T = o.groups ? 30 : 10, R = 12;
    if (!pts.length) { el.innerHTML = `<p class="vazio">Sem pares completos.</p>`; return; }
    let xl = Math.min(...pts.map(p => p.x)), xh = Math.max(...pts.map(p => p.x)), yl = Math.min(...pts.map(p => p.y)), yh = Math.max(...pts.map(p => p.y));
    if (xl === xh) { xl--; xh++; } if (yl === yh) { yl--; yh++; }
    const xt = ticks(xl, xh, 6), yt = ticks(yl, yh, 5); xl = Math.min(xl, xt[0]); xh = Math.max(xh, xt[xt.length - 1]); yl = Math.min(yl, yt[0]); yh = Math.max(yh, yt[yt.length - 1]);
    const sx = v => L + (W - L - R) * (v - xl) / (xh - xl), sy = v => H - B - (H - B - T) * (v - yl) / (yh - yl);
    let s = svgOpen(W, H, o.title); const tips = [];
    if (o.groups) s += legend(o.groups, o.groups.map((_, i) => C.cat[i] || C.other), L, 2, W);
    xt.forEach(t => s += `<line x1="${sx(t)}" x2="${sx(t)}" y1="${T}" y2="${H - B}" stroke="${C.grid}"/>` + txt(sx(t), H - B + 14, fmt(t), { anchor: "middle", size: 10.5, fill: C.muted }));
    yt.forEach(t => s += `<line x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}" stroke="${C.grid}"/>` + txt(L - 6, sy(t), fmt(t), { anchor: "end", size: 10.5, fill: C.muted }));
    pts.forEach((p, i) => {
      const col = o.groups ? (C.cat[o.groups.indexOf(p.g)] || C.other) : C.brand;
      tips.push(tipHtml(p.id || "", [[o.xLabel || "x", fmt(p.x)], [o.yLabel || "y", fmt(p.y)], ...(p.g != null ? [["Grupo", p.g, col]] : [])]));
      s += `<circle data-tip="${i}" cx="${sx(p.x)}" cy="${sy(p.y)}" r="4.5" fill="${col}" fill-opacity=".72" stroke="#fff" stroke-width="1.2"/>`;
    });
    if (o.fit && isFinite(o.fit.slope)) { const a = o.fit.intercept, b = o.fit.slope; s += `<line x1="${sx(xl)}" y1="${sy(a + b * xl)}" x2="${sx(xh)}" y2="${sy(a + b * xh)}" stroke="${C.ink}" stroke-width="2" stroke-dasharray="6 4" clip-path="none"/>`; }
    s += txt((L + W) / 2, H - 8, o.xLabel || "", { anchor: "middle", size: 11, fill: C.muted }) + txt(12, (T + H - B) / 2, o.yLabel || "", { anchor: "middle", size: 11, fill: C.muted, rot: -90 });
    el.innerHTML = s + "</svg>"; bindTips(el, tips);
  };

  // ---------- mapa de calor (tabela cruzada ou matriz de correlação)
  E.heat = (el, o) => {
    const rows = o.rows, cols = o.cols, m = o.m, W = Math.max(280, el.clientWidth || 400);
    const L = Math.min(W * 0.35, Math.max(...rows.map(r => tw(r)), 30) + 12), topH = Math.min(140, Math.max(...cols.map(c => tw(c, 11))) * 0.75 + 16);
    const cw = Math.max(28, (W - L - 4) / cols.length), ch = Math.max(24, Math.min(34, cw * 0.7)), H = topH + rows.length * ch + 4;
    const vals = m.flat().filter(v => isFinite(v)); const div = !!o.diverging; const mx = div ? 1 : Math.max(...vals, 1e-9);
    const color = v => {
      if (!isFinite(v)) return "#F4F2F8";
      if (div) { const t = Math.max(-1, Math.min(1, v)); const a = Math.abs(t); const base = t >= 0 ? [42, 120, 214] : [227, 73, 72]; const mid = [240, 239, 236]; const c = mid.map((x, i) => Math.round(x + (base[i] - x) * a)); return `rgb(${c.join(",")})`; }
      const i = Math.min(C.seq.length - 1, Math.floor(v / mx * (C.seq.length - 1) + 1e-9)); return C.seq[i];
    };
    let s = svgOpen(W, H, o.title); const tips = [];
    cols.forEach((c, j) => { const x = L + j * cw + cw / 2; s += txt(x, topH - 6, trunc(c, topH * 1.3, 11), { anchor: "start", size: 11, rot: -40, fill: C.ink2, base: "auto" }); });
    rows.forEach((r, i) => {
      const y = topH + i * ch; s += txt(L - 8, y + ch / 2, trunc(r, L - 12), { anchor: "end", fill: C.ink });
      cols.forEach((c, j) => {
        const v = m[i][j], x = L + j * cw, f = color(v), dark = div ? Math.abs(v) > 0.55 : v / mx > 0.45;
        tips.push(tipHtml(`${r} × ${c}`, (o.tipRows ? o.tipRows(i, j) : [["valor", o.fmt ? o.fmt(v) : fmt(v)]])));
        s += `<g data-tip="${tips.length - 1}"><rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="${f}"/>`;
        if (cw > 30) s += txt(x + cw / 2, y + ch / 2, o.fmt ? o.fmt(v) : fmt(v), { anchor: "middle", size: 11, fill: dark ? "#fff" : C.ink, weight: 600 });
        s += `</g>`;
      });
    });
    el.innerHTML = s + "</svg>"; bindTips(el, tips);
  };

  // ---------- antes e depois (linhas pareadas)
  E.paired = (el, o) => {
    const W = Math.max(300, el.clientWidth || 400), H = o.height || 300, L = 46, R = 46, T = 14, B = 34, pts = o.pairs;
    const all = pts.flatMap(p => [p.a, p.b]); let lo = Math.min(...all), hi = Math.max(...all); if (lo === hi) { lo--; hi++; }
    const tk = ticks(lo, hi, 5); lo = Math.min(lo, tk[0]); hi = Math.max(hi, tk[tk.length - 1]);
    const xa = L + (W - L - R) * 0.22, xb = L + (W - L - R) * 0.78, sy = v => H - B - (H - B - T) * (v - lo) / (hi - lo);
    let s = svgOpen(W, H, o.title); const tips = [];
    tk.forEach(t => s += `<line x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}" stroke="${C.grid}"/>` + txt(L - 6, sy(t), fmt(t), { anchor: "end", size: 10.5, fill: C.muted }));
    pts.forEach((p, i) => { const up = p.b > p.a, col = p.b === p.a ? C.other : up ? C.cat[0] : C.cat[7];
      tips.push(tipHtml(p.id || "", [[o.la || "Antes", fmt(p.a)], [o.lb || "Depois", fmt(p.b)], ["Diferença", fmt(p.b - p.a)]]));
      s += `<g data-tip="${i}"><line x1="${xa}" y1="${sy(p.a)}" x2="${xb}" y2="${sy(p.b)}" stroke="${col}" stroke-width="2" stroke-opacity=".6"/><circle cx="${xa}" cy="${sy(p.a)}" r="4" fill="${col}"/><circle cx="${xb}" cy="${sy(p.b)}" r="4" fill="${col}"/></g>`; });
    const S2 = root.EStats, ma = S2.mean(pts.map(p => p.a)), mb = S2.mean(pts.map(p => p.b));
    s += `<line x1="${xa}" y1="${sy(ma)}" x2="${xb}" y2="${sy(mb)}" stroke="${C.ink}" stroke-width="3.5"/><circle cx="${xa}" cy="${sy(ma)}" r="6" fill="${C.ink}"/><circle cx="${xb}" cy="${sy(mb)}" r="6" fill="${C.ink}"/>`;
    s += txt(xa, H - 12, o.la || "Antes", { anchor: "middle", fill: C.ink, weight: 600 }) + txt(xb, H - 12, o.lb || "Depois", { anchor: "middle", fill: C.ink, weight: 600 });
    s += txt(xb + 10, sy(mb), "média " + fmt(mb), { size: 11, fill: C.ink }) + txt(xa - 10, sy(ma), fmt(ma), { size: 11, fill: C.ink, anchor: "end" });
    if (o.yLabel) s += txt(12, (T + H - B) / 2, o.yLabel, { anchor: "middle", size: 11, fill: C.muted, rot: -90 });
    el.innerHTML = s + "</svg>"; bindTips(el, tips);
  };
  // ---------- gráfico de floresta (razões de chances, escala log)
  E.forest = (el, o) => {
    const it = o.items.filter(i => isFinite(i.or) && isFinite(i.lo) && isFinite(i.hi)), W = Math.max(320, el.clientWidth || 400);
    if (!it.length) { el.innerHTML = "<p class='vazio'>Sem estimativas.</p>"; return; }
    const rowH = 28, L = Math.min(W * 0.45, Math.max(...it.map(i => tw(i.label)), 30) + 14), R = 110, T = 8, H = it.length * rowH + T + 48;
    let lo = Math.min(...it.map(i => i.lo), 0.5), hi = Math.max(...it.map(i => i.hi), 2); lo = Math.max(lo, 1e-3); hi = Math.min(hi, 1e3);
    const l0 = Math.log10(lo), l1 = Math.log10(hi), sx = v => L + (W - L - R) * (Math.log10(Math.max(lo, Math.min(hi, v))) - l0) / (l1 - l0);
    let s = svgOpen(W, H, o.title); const tips = [];
    [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200].filter(v => v >= lo && v <= hi).forEach(v => s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H - 40}" stroke="${v === 1 ? C.ink2 : C.grid}"${v === 1 ? ' stroke-dasharray="4 3"' : ""}/>` + txt(sx(v), H - 28, fmt(v), { anchor: "middle", size: 10.5, fill: C.muted }));
    it.forEach((i, k) => { const cy = T + k * rowH + rowH / 2;
      tips.push(tipHtml(i.label, [["RC", fmt(i.or)], ["IC 95%", `${fmt(i.lo)} a ${fmt(i.hi)}`], ["p", i.pTxt || ""]]));
      s += `<g data-tip="${k}"><rect x="0" y="${cy - rowH / 2}" width="${W}" height="${rowH}" fill="transparent"/>` + txt(L - 10, cy, trunc(i.label, L - 14), { anchor: "end", fill: C.ink }) +
        `<line x1="${sx(i.lo)}" x2="${sx(i.hi)}" y1="${cy}" y2="${cy}" stroke="${C.ink}" stroke-width="1.8"/><rect x="${sx(i.or) - 5}" y="${cy - 5}" width="10" height="10" fill="${i.p < 0.05 ? C.brand : "#fff"}" stroke="${C.brand}" stroke-width="2"/>` +
        txt(W - R + 10, cy, `${fmt(i.or)} (${fmt(i.lo)}–${fmt(i.hi)})`, { size: 11, fill: C.ink }) + `</g>`; });
    s += txt((L + W - R) / 2, H - 1, "Razão de chances (escala log) · ■ cheio = p < 0,05", { anchor: "middle", size: 11, fill: C.muted, base: "auto" });
    el.innerHTML = s + "</svg>"; bindTips(el, tips);
  };
  // ---------- fluxograma de participantes
  E.flow = (el, o) => {
    const W0 = 760, font2 = o.font || font; const box = (x, y, w, h, lines, opt) => { opt = opt || {}; let r = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${opt.fill || "#fff"}" stroke="${opt.stroke || C.ink}" stroke-width="1.3"${opt.dash ? ' stroke-dasharray="5 3"' : ""}/>`;
      const lh = 15; const y0 = y + h / 2 - (lines.length - 1) * lh / 2; lines.forEach((l, i) => r += `<text x="${x + w / 2}" y="${y0 + i * lh}" font-size="${i === 0 ? 12.5 : 11.5}" ${i === 0 ? 'font-weight="700"' : ""} fill="${C.ink}" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`); return r; };
    const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.ink}" stroke-width="1.3" marker-end="url(#ah)"/>`;
    const st = o.steps; let y = 10, s = "", cx = 220, bw = 300; const H_ = 54;
    st.main.forEach((m, i) => {
      s += box(cx - bw / 2, y, bw, H_, m.lines); const ye = y + H_;
      if (i < st.main.length - 1) {
        const sh = m.side ? Math.max(40, 16 + m.side.length * 15) : 0, gapH = m.side ? sh + 28 : 30;
        s += arrow(cx, ye, cx, ye + gapH);
        if (m.side) { const my = ye + gapH / 2, sx = cx + bw / 2 + 30; s += arrow(cx, my, sx, my) + box(sx, my - sh / 2, 340, sh, m.side, { dash: true }); }
        y = ye + gapH;
      } else y = ye;
    });
    // ramos (instrumentos)
    const n = st.branches.length; if (n) { const bwB = Math.min(230, (W0 - 20) / n - 12), gap = (W0 - n * bwB) / (n + 1), yb = y + 40, hb = 18 + Math.max(...st.branches.map(b => b.length)) * 15;
      s += `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + 20}" stroke="${C.ink}" stroke-width="1.3"/><line x1="${gap + bwB / 2}" y1="${y + 20}" x2="${gap + (n - 1) * (bwB + gap) + bwB / 2}" y2="${y + 20}" stroke="${C.ink}" stroke-width="1.3"/>`;
      st.branches.forEach((b, i) => { const x = n === 1 ? cx - bwB / 2 : gap + i * (bwB + gap); s += arrow(x + bwB / 2, y + 20, x + bwB / 2, yb); s += box(x, yb, bwB, hb, b, { fill: "#F7F4FF" }); }); y = yb + hb; }
    const H0 = y + 10, Wd = Math.max(300, el.clientWidth || 600), sc = Math.min(1.25, Wd / W0);
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W0 * sc)}" height="${Math.round(H0 * sc)}" viewBox="0 0 ${W0} ${H0}" style="font-family:${font2};display:block;margin:0 auto" role="img" aria-label="Fluxograma de participantes"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="${C.ink}"/></marker></defs>${s}</svg>`;
  };

  // ---------- mapa coroplético (municípios de Goiás / estados do Brasil)
  E.mapBreaks = max => { const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]; const b = steps.filter(s => s <= max); while (b.length > 5) b.splice(1, 1); return b; };
  E.map = (el, o) => {
    const M = o.map, W0 = M.w, H0 = M.h, Wd = Math.max(260, el.clientWidth || 500), sc = Math.min(Wd / W0, (o.maxH || 620) / H0), W = Math.round(W0 * sc), H = Math.round(H0 * sc);
    const vals = o.values, sv = o.shapeVal || (sh => vals[sh.c] || 0), max = Math.max(0, ...(o.shapeVal ? M.shapes.map(sv) : Object.values(vals))), br = E.mapBreaks(Math.max(1, max));
    const cls = v => { if (!v) return -1; let i = 0; while (i + 1 < br.length && v >= br[i + 1]) i++; return i; };
    const ramp = br.map((_, i) => C.seq[Math.round(2 + i * (C.seq.length - 3) / Math.max(1, br.length - 1))]);
    const empty = "#EEEBF5", sel = o.selected; const tips = [];
    const legH = 54;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + legH}" viewBox="0 0 ${W0} ${H0 + legH / sc}" role="img" aria-label="${esc(o.title || "Mapa")}" style="font-family:${font};display:block;margin:0 auto">`;
    if (o.under) s += `<path d="${o.under.d}" fill="#F7F6FA" stroke="${C.axis}" stroke-width="${0.8 / sc}" stroke-dasharray="${3 / sc} ${2 / sc}"/>` + (o.under.label ? `<text x="${o.under.x}" y="${o.under.y}" font-size="${10 / sc}" fill="${C.muted}" text-anchor="middle" dominant-baseline="middle">${esc(o.under.label)}</text>` : "");
    const total = o.total || Object.values(vals).reduce((a, b) => a + b, 0);
    M.shapes.forEach((sh, i) => {
      const v = sv(sh), k = cls(v), on = sel && sel.has(o.keyOf ? o.keyOf(sh) : sh.n);
      tips.push(o.shapeTip ? o.shapeTip(sh, v) : tipHtml(sh.n, v ? [["Participantes", fmt(v, 0)], ["% do total no mapa", fmt(100 * v / Math.max(1, total), 1) + "%"]] : [["Sem participantes", ""]]));
      const fill = o.fillOf ? o.fillOf(sh, v) : (k < 0 ? empty : ramp[k]);
      s += `<path data-tip="${i}"${v ? ` data-key="${esc(o.keyOf ? o.keyOf(sh) : sh.n)}"` : ""} d="${sh.d}" fill="${fill}" stroke="${on ? C.ink : o.fillOf ? fill : "#fff"}" stroke-width="${(on ? 2.2 : o.fillOf ? 0.4 : 0.6) / sc}" stroke-linejoin="round"${sel && sel.size && !on ? ' fill-opacity=".35"' : ""}/>`;
    });
    if (o.outline) s += `<path d="${o.outline}" fill="none" stroke="${C.ink2}" stroke-width="${1.2 / sc}" pointer-events="none"/>`;
    // rótulos: os maiores valores (ou todos os marcados, para estados)
    if (o.groupLabels) o.groupLabels.forEach(l => { s += `<text x="${l.x}" y="${l.y}" font-size="${11.5 / sc}" font-weight="700" fill="${C.ink}" text-anchor="${l.anchor || "middle"}" dominant-baseline="middle" stroke="#fff" stroke-width="${3.5 / sc}" paint-order="stroke" pointer-events="none">${esc(l.t)}</text>`; });
    const lab = o.groupLabels ? [] : M.shapes.filter(sh => vals[sh.c]).sort((a, b) => vals[b.c] - vals[a.c]).slice(0, o.labels == null ? 6 : o.labels);
    const placed = [];
    lab.forEach(sh => { const t = o.labelText ? o.labelText(sh) : sh.n, fs = (o.labelSize || 11) / sc, hw = tw(t, o.labelSize || 11) / sc / 2 + 2 / sc, hh = fs * 0.7;
      if (placed.some(p => Math.abs(p.x - sh.cx) < p.hw + hw && Math.abs(p.y - sh.cy) < p.hh + hh)) return; placed.push({ x: sh.cx, y: sh.cy, hw, hh });
      s += `<text x="${sh.cx}" y="${sh.cy}" font-size="${fs}" font-weight="600" fill="${C.ink}" text-anchor="middle" dominant-baseline="middle" stroke="#fff" stroke-width="${3 / sc}" paint-order="stroke" pointer-events="none">${esc(t)}</text>`; });
    // legenda
    let lx = 0, ly2 = H0 + 8 / sc; const sw = 12 / sc, fs = 11 / sc;
    const item = (col, t) => { const need = sw + 10 / sc + tw(t, 11) / sc; if (lx > 0 && lx + need > W0) { lx = 0; ly2 += 18 / sc; } const ly = ly2; const r = `<rect x="${lx}" y="${ly}" width="${sw}" height="${sw}" rx="${2 / sc}" fill="${col}" stroke="${C.axis}" stroke-width="${0.5 / sc}"/><text x="${lx + sw + 4 / sc}" y="${ly + sw / 2}" font-size="${fs}" fill="${C.ink2}" dominant-baseline="middle">${esc(t)}</text>`; lx += sw + 10 / sc + tw(t, 11) / sc; return r; };
    if (o.legendItems) o.legendItems.forEach(([c, t]) => s += item(c, t));
    else { s += item(empty, o.emptyLabel || "não atendido");
    br.forEach((b, i) => { const nx = br[i + 1]; s += item(ramp[i], nx ? (nx - 1 === b ? String(b) : `${b}–${nx - 1}`) : `${b}+`); }); }
    el.innerHTML = s + "</svg>"; bindTips(el, tips); bindClicks(el, o.onClick);
  };

  // ---------- exportar SVG/PNG
  // exportação: fonte, tons de cinza, largura em cm e dpi, legenda
  E.svgString = (el, o) => {
    o = o || {}; const svg = el.querySelector("svg"); if (!svg) return null; const c = svg.cloneNode(true);
    c.querySelectorAll("[data-tip],[data-key]").forEach(n => { n.removeAttribute("data-tip"); n.removeAttribute("data-key"); n.removeAttribute("style"); });
    const f = o.font || font; c.setAttribute("style", `font-family:${f};background:#fff`);
    let s = c.outerHTML.replace(/font-family:[^;"]+/g, "font-family:" + f.replace(/"/g, "'"));
    if (o.gray) s = s.replace(/^<svg([^>]*)>/, '<svg$1><defs><filter id="cinza"><feColorMatrix type="saturate" values="0"/></filter></defs><g filter="url(#cinza)">').replace(/<\/svg>$/, "</g></svg>");
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + s;
  };
  E.png = (el, o) => new Promise((res, rej) => {
    if (typeof o === "number" || !o) o = { scale: o || 3 };
    const s = E.svgString(el, o); if (!s) return rej(new Error("sem gráfico")); const svg = el.querySelector("svg"); const w = +svg.getAttribute("width"), h = +svg.getAttribute("height"), pad = 16;
    const k = o.widthPx ? o.widthPx / (w + pad * 2) : (o.scale || 3);
    const img = new Image(); img.onload = () => {
      const cv = document.createElement("canvas"), ctx0 = cv.getContext("2d"), capSize = 13, fam = (o.font || "Arial").replace(/"/g, "");
      let lines = []; if (o.caption) { ctx0.font = `${capSize}px ${fam}`; const words = o.caption.split(/\s+/); let cur = ""; words.forEach(wd => { const t = cur ? cur + " " + wd : wd; if (ctx0.measureText(t).width > w) { lines.push(cur); cur = wd; } else cur = t; }); if (cur) lines.push(cur); }
      const capH = lines.length ? lines.length * capSize * 1.35 + 10 : 0;
      cv.width = Math.round((w + pad * 2) * k); cv.height = Math.round((h + pad * 2 + capH) * k); const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.scale(k, k); ctx.drawImage(img, pad, pad, w, h);
      if (lines.length) { ctx.fillStyle = "#000"; ctx.font = `${capSize}px ${fam}`; ctx.textBaseline = "top"; lines.forEach((l, i) => { if (i === 0 && o.capBold) { const m = l.match(/^(Figura \d+\.|Figure \d+\.)\s*/); if (m) { ctx.font = `bold ${capSize}px ${fam}`; ctx.fillText(m[1], pad, h + pad + 10); const bw = ctx.measureText(m[1] + " ").width; ctx.font = `${capSize}px ${fam}`; ctx.fillText(l.slice(m[0].length), pad + bw, h + pad + 10); return; } } ctx.fillText(l, pad, h + pad + 10 + i * capSize * 1.35); }); }
      if (o.gray) { const d = ctx.getImageData(0, 0, cv.width, cv.height), a = d.data; for (let i = 0; i < a.length; i += 4) { const y = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]; a[i] = a[i + 1] = a[i + 2] = y; } ctx.putImageData(d, 0, 0); }
      cv.toBlob(b => b ? res(b) : rej(new Error("png")), "image/png");
    };
    img.onerror = rej; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  });

  root.EChart = E;
})(window);
