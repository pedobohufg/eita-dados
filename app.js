/*
  EITA! DADOS — interface
  © 2026 Lab.EITA/UFG. Autor: Pedro Henrique Gonçalves. Todos os direitos reservados.
*/
(function () {
  "use strict";
  const S = window.EStats, D = window.EData, CH = window.EChart, I = window.EInstr;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = CH.esc, fmt = CH.fmt, f2 = v => S.fmt(v, 2), fp = S.fmtP;
  const LS = "eita-dados:cfg", DB = "eita-dados", VERSAO = "1.0";

  const st = { raw: [], defs: [], model: null, table: "part", filters: {}, page: "painel", statTab: "descritiva", explore: {}, sel: {}, varCur: null,
    cfg: { recodes: {}, types: {}, labels: {}, showPII: false, persist: true, pins: [], sep: ";", hidden: [], municipios: {} } };
  try { Object.assign(st.cfg, JSON.parse(localStorage.getItem(LS) || "{}")); } catch (e) { }
  const saveCfg = () => { try { localStorage.setItem(LS, JSON.stringify(st.cfg)); } catch (e) { } };

  // ---------------- utilidades de interface
  const toast = (msg, ms) => { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms || 3200); };
  const dialog = (html, onMount) => { $("#dlgIn").innerHTML = html; $("#dlg").hidden = false; onMount && onMount($("#dlgIn")); };
  const closeDlg = () => { $("#dlg").hidden = true; $("#dlgIn").innerHTML = ""; };
  $("#dlg").addEventListener("click", e => { if (e.target.id === "dlg" || e.target.closest("[data-close]")) closeDlg(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#dlg").hidden) closeDlg(); });

  let downloads = null;
  (async () => { try { if (window.claude && window.claude.use) downloads = await window.claude.use("downloads"); } catch (e) { downloads = null; } })();
  async function save(filename, data) {
    if (downloads) { try { await downloads.save({ filename, data }); toast("Arquivo salvo: " + filename); return; } catch (e) { if (e && e.code === "declined") return; } }
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data])); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); }
    catch (e) { toast("Não foi possível baixar aqui. Abra a página no navegador para salvar arquivos."); }
  }
  async function copyTable(tbl) {
    const html = tbl.outerHTML.replace(/ class="[^"]*"/g, "").replace(/<table/, '<table border="1" style="border-collapse:collapse;font-family:Arial;font-size:10pt"');
    const tsv = [...tbl.rows].map(r => [...r.cells].map(c => c.innerText.replace(/\s+/g, " ").trim()).join("\t")).join("\n");
    try { await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([tsv], { type: "text/plain" }) })]); toast("Tabela copiada. Cole no Word ou no Excel."); }
    catch (e) { try { await navigator.clipboard.writeText(tsv); toast("Tabela copiada como texto."); } catch (e2) { toast("O navegador bloqueou a cópia. Selecione a tabela e use Ctrl+C."); } }
  }
  const loadScript = src => new Promise((res, rej) => { if ([...document.scripts].some(s => s.src === src)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Não carregou " + src)); document.head.appendChild(s); });
  const JSZIP = new URL("lib/jszip.min.js", location.href).href, XLSX_URL = new URL("lib/xlsx.mini.min.js", location.href).href;

  // ---------------- guardar a base no navegador (IndexedDB)
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("base"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function idbPut(v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction("base", "readwrite"); tx.objectStore("base").put(v, "atual"); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
  async function idbGet() { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction("base"); const q = tx.objectStore("base").get("atual"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
  async function idbDel() { const db = await idb(); return new Promise(res => { const tx = db.transaction("base", "readwrite"); tx.objectStore("base").delete("atual"); tx.oncomplete = res; tx.onerror = res; }); }

  // ---------------- modelo
  function rebuild() {
    const { forms } = D.readEpicollect(st.raw);
    if (!forms.length) { st.model = null; return; }
    const MP = window.EMapas; const m = D.build(forms, { recodes: JSON.parse(JSON.stringify(st.cfg.recodes)), types: st.cfg.types, defs: st.defs, munNames: MP ? MP.go.shapes.map(s => s.n) : [], ufs: MP ? MP.br.shapes.map(s => ({ c: s.c, n: s.n })) : [], municipios: st.cfg.municipios || {} });
    // rótulos editados
    Object.entries(st.cfg.labels).forEach(([k, l]) => { if (m.vars[k] && l) m.vars[k].label = l; });
    // cada opção de múltipla escolha vira uma variável Sim/Não analisável
    Object.values(m.tables).forEach(t => {
      t.vars.slice().forEach(k => {
        const v = m.vars[k]; if (!v || v.type !== "multi" || v.pii) return;
        (v.levels || []).forEach(o => {
          const id = k + "::" + o; m.vars[id] = { id, label: v.label + ": " + o, section: v.section, type: "cat", levels: ["Sim", "Não"], virtual: true, parent: k, option: o, form: v.form, source: v.source, n: v.n };
          t.vars.push(id); t.rows.forEach(r => { const a = r[k]; r[id] = a && a.length ? (a.includes(o) ? "Sim" : "Não") : null; });
          m.vars[id].missing = t.rows.filter(r => r[id] == null).length;
        });
      });
    });
    // filhos (1:n) por participante, para filtrar participantes por dados dos dispositivos
    m.children = {}; Object.values(m.tables).forEach(t => { if (t.id === "part") return; const by = {}; t.rows.forEach(r => (by[r._pid] = by[r._pid] || []).push(r)); m.children[t.id] = by; });
    m.tableOf = {}; Object.values(m.tables).forEach(t => t.vars.forEach(k => { if (!m.tableOf[k]) m.tableOf[k] = t.id; }));
    st.model = m;
    Object.keys(st.filters).forEach(k => { if (!m.vars[k]) delete st.filters[k]; });
    if (!m.tables[st.table]) st.table = "part";
  }
  const V = id => st.model && st.model.vars[id];
  const lbl = id => (V(id) || {}).label || id;
  const tableOf = id => st.model.tableOf[id] || "part";

  // ---------------- filtros
  function matchOne(f, x) {
    if (f.kind === "in") { if (Array.isArray(x)) return x.some(v => f.values.includes(v)); return f.values.includes(x == null ? "(sem resposta)" : x); }
    if (f.kind === "range") return x != null && isFinite(x) && (f.min == null || x >= f.min) && (f.max == null || x <= f.max);
    return true;
  }
  function passes(row, tid) {
    for (const [vid, f] of Object.entries(st.filters)) {
      const home = tableOf(vid);
      if (home === tid || home === "part") { if (!matchOne(f, row[vid])) return false; }
      else if (tid === "part") { const ch = (st.model.children[home] || {})[row._id] || []; if (!ch.some(c => matchOne(f, c[vid]))) return false; }
    }
    return true;
  }
  const baseIncl = (r, tid, o) => { const p = tid === "part" ? r : r._prow; if (!p) return true; if (st.cfg.excludeDup !== false && p._dup) return false; if (!(o && o.allMoments) && st.cfg.firstOnly !== false && p._mom > 1) return false; return true; };
  const baseRows = (tid, o) => st.model.tables[tid].rows.filter(r => baseIncl(r, tid, o));
  const rowsOf = (tid, o) => st.model.tables[tid].rows.filter(r => baseIncl(r, tid, o) && passes(r, tid));
  function toggleFilter(vid, value) {
    const f = st.filters[vid];
    if (!f || f.kind !== "in") st.filters[vid] = { kind: "in", values: [value] };
    else { const i = f.values.indexOf(value); i >= 0 ? f.values.splice(i, 1) : f.values.push(value); if (!f.values.length) delete st.filters[vid]; }
    render();
  }
  function renderTopo() {
    const m = st.model; $("#topo").hidden = !m || ["dados", "metodos", "guia"].includes(st.page); if (!m) return;
    const sel = $("#selTab"); sel.innerHTML = Object.values(m.tables).map(t => `<option value="${t.id}"${t.id === st.table ? " selected" : ""}>${esc(t.unidade === "participantes" ? "Participantes" : t.label.replace(/\s*\(.*\)/, "") + " — " + t.unidade)}</option>`).join("");
    $("#chips").innerHTML = Object.entries(st.filters).map(([k, f]) => `<span class="chip" title="${esc(lbl(k))}"><span>${esc(lbl(k))}: ${esc(f.kind === "in" ? f.values.join(", ") : `${f.min ?? "…"} a ${f.max ?? "…"}`)}</span><button type="button" data-rm="${esc(k)}" aria-label="Remover filtro">×</button></span>`).join("") +
      (Object.keys(st.filters).length > 1 ? `<button class="ghost small" type="button" id="limpaF">Limpar filtros</button>` : "");
    const all = baseRows(st.table).length, n = rowsOf(st.table).length;
    $("#contagem").innerHTML = `<b>${n}</b> de ${all} ${esc(m.tables[st.table].unidade)}`;
  }
  $("#selTab").addEventListener("change", e => { st.table = e.target.value; render(); });
  $("#chips").addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) { delete st.filters[b.dataset.rm]; render(); } if (e.target.id === "limpaF") { st.filters = {}; render(); } });
  $("#addFiltro").addEventListener("click", () => filterDialog());
  function filterDialog(pre) {
    dialog(`<h3>Filtrar ${esc(st.model.tables[st.table].unidade)}</h3><p class="note">O filtro vale para todas as telas. Também dá para filtrar clicando nas barras dos gráficos do painel.</p>
      <label class="note" style="display:block;margin:10px 0 4px;font-weight:600">Variável</label>${varSelect("fv", { types: ["cat", "num", "multi"], value: pre, table: st.table, all: true })}
      <div id="fBody" style="margin-top:12px"></div><div class="row" style="justify-content:flex-end;margin-top:16px"><button data-close type="button">Cancelar</button><button class="primary" id="fOk" type="button">Aplicar</button></div>`, el => {
      const draw = () => {
        const v = V(el.querySelector("#fv").value), b = el.querySelector("#fBody"); if (!v) { b.innerHTML = ""; return; }
        const rows = st.model.tables[tableOf(v.id)].rows;
        if (v.type === "num") { const vals = rows.map(r => r[v.id]).filter(x => x != null); const f = st.filters[v.id] || {};
          b.innerHTML = `<div class="row"><label class="note">De <input type="number" id="fMin" step="any" value="${f.min ?? ""}" placeholder="${fmt(Math.min(...vals))}" style="width:110px"></label><label class="note">até <input type="number" id="fMax" step="any" value="${f.max ?? ""}" placeholder="${fmt(Math.max(...vals))}" style="width:110px"></label>${v.unit ? `<span class="note">${esc(v.unit)}</span>` : ""}</div>`; }
        else { const f = st.filters[v.id]; const lv = D.levelsOf(v, rows); const cnt = l => rows.filter(r => Array.isArray(r[v.id]) ? r[v.id].includes(l) : r[v.id] === l).length;
          b.innerHTML = `<div class="multisel">${lv.map(l => `<label><input type="checkbox" value="${esc(l)}"${f && f.values.includes(l) ? " checked" : ""}> ${esc(l)} <span class="note">(${cnt(l)})</span></label>`).join("")}</div>`; }
      };
      el.querySelector("#fv").addEventListener("change", draw); draw();
      el.querySelector("#fOk").addEventListener("click", () => {
        const v = V(el.querySelector("#fv").value); if (!v) return closeDlg();
        if (v.type === "num") { const a = el.querySelector("#fMin").value, b = el.querySelector("#fMax").value; if (a === "" && b === "") delete st.filters[v.id]; else st.filters[v.id] = { kind: "range", min: a === "" ? null : +a, max: b === "" ? null : +b }; }
        else { const vals = [...el.querySelectorAll("input:checked")].map(i => i.value); if (vals.length) st.filters[v.id] = { kind: "in", values: vals }; else delete st.filters[v.id]; }
        closeDlg(); render();
      });
    });
  }

  // ---------------- seletor de variáveis
  function varList(opts) {
    const m = st.model, t = m.tables[opts.table || st.table]; let ids = t.vars.slice();
    if (opts.all && t.id === "part") Object.values(m.tables).forEach(o => { if (o.id !== "part") ids = ids.concat(o.vars.filter(k => !ids.includes(k))); });
    return ids.map(k => m.vars[k]).filter(v => v && !v.pii && !v.hide && (!opts.types || opts.types.includes(v.type)) && !(v.type === "multi" && opts.noMulti) && !(v.virtual && opts.noVirtual) && !(st.cfg.hidden || []).includes(v.id));
  }
  function varSelect(id, opts) {
    const list = varList(opts); const groups = {};
    list.forEach(v => (groups[v.section] = groups[v.section] || []).push(v));
    return `<select id="${id}"${opts.attrs || ""}>${opts.none ? `<option value="">${esc(opts.none)}</option>` : ""}${Object.entries(groups).map(([g, vs]) => `<optgroup label="${esc(g)}">${vs.map(v => `<option value="${esc(v.id)}"${v.id === opts.value ? " selected" : ""}>${esc(v.label)}${v.type === "num" ? " #" : ""}</option>`).join("")}</optgroup>`).join("")}</select>`;
  }
  function varChecks(name, opts, checked) {
    const list = varList(opts); const groups = {};
    list.forEach(v => (groups[v.section] = groups[v.section] || []).push(v));
    return `<div class="multisel" data-name="${name}">${Object.entries(groups).map(([g, vs]) => `<div class="g">${esc(g)}</div>${vs.map(v => `<label><input type="checkbox" value="${esc(v.id)}"${(checked || []).includes(v.id) ? " checked" : ""}> ${esc(v.label)}</label>`).join("")}`).join("")}</div>`;
  }
  const checked = (root, name) => [...root.querySelectorAll(`[data-name="${name}"] input:checked`)].map(i => i.value);

  // ---------------- contagens
  function counts(rows, vid) {
    const v = V(vid), c = new Map(); let miss = 0;
    rows.forEach(r => { const x = r[vid]; if (x == null || (Array.isArray(x) && !x.length)) { miss++; return; } (Array.isArray(x) ? x : [x]).forEach(y => c.set(y, (c.get(y) || 0) + 1)); });
    let lv = v.levels ? v.levels.filter(l => c.has(l)) : [...c.keys()];
    if (!v.levels) lv.sort((a, b) => v.type === "cat" && /^\d{4}-\d{2}$/.test(a) ? a.localeCompare(b) : c.get(b) - c.get(a));
    const answered = rows.length - miss;
    return { cats: lv.map(l => ({ label: l, value: c.get(l), base: answered })), miss, answered };
  }
  const mesLbl = s => { const [y, m] = s.split("-"); return ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+m - 1] + "/" + y.slice(2); };

  // ---------------- cartões de gráfico
  const ro = new ResizeObserver(es => es.forEach(e => { const fn = e.target._draw; if (fn && e.contentRect.width !== e.target._w) { e.target._w = e.contentRect.width; fn(); } }));
  function mount(el, draw) { el._draw = draw; el._w = el.clientWidth; draw(); ro.observe(el); }
  function card(spec) {
    const c = document.createElement("div"); c.className = "card w" + (spec.w || 6);
    c.innerHTML = `<h4>${esc(spec.title)}</h4><div class="sub">${spec.sub || ""}</div><div class="menu"><button type="button" data-a="tab" title="Ver os números">Tabela</button><button type="button" data-a="png" title="Exportar figura (PNG/SVG em alta resolução)">Figura</button><button type="button" data-a="rep" title="Adicionar ao relatório">+ Relatório</button>${spec.pin != null ? `<button type="button" data-a="rm" title="Tirar do painel">×</button>` : ""}</div><div class="ch"></div><div class="tw tab" hidden></div>`;
    c.querySelector(".menu").addEventListener("click", async e => {
      const a = e.target.dataset.a; const ch = c.querySelector(".ch"); const name = (spec.title || "grafico").normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
      if (a === "tab") { const t = c.querySelector(".tab"); t.hidden = !t.hidden; if (!t.hidden) t.innerHTML = c._tab ? c._tab() : spec.table ? spec.table() : "<p class='vazio'>Sem tabela.</p>"; }
      if (a === "png") figDialog(ch, spec.title);
      if (a === "rep") addToReport(spec.title, c);
      if (a === "rm") { st.cfg.pins.splice(spec.pin, 1); saveCfg(); render(); }
    });
    return c;
  }
  function freqTable(cnt, title) {
    return `<table class="t"><thead><tr><th>${esc(title || "Categoria")}</th><th class="n">n</th><th class="n">%</th></tr></thead><tbody>${cnt.cats.map(c => `<tr><td>${esc(c.label)}</td><td class="n">${c.value}</td><td class="n">${fmt(100 * c.value / c.base, 1)}</td></tr>`).join("")}${cnt.miss ? `<tr><td class="note">Sem resposta</td><td class="n">${cnt.miss}</td><td class="n">—</td></tr>` : ""}</tbody></table>`;
  }
  function descTable(groups, unit) {
    return `<table class="t"><thead><tr><th>Grupo</th><th class="n">n</th><th class="n">Média ± DP</th><th class="n">Mediana [IIQ]</th><th class="n">Mín – máx</th></tr></thead><tbody>${groups.map(g => { const d = S.describe(g.values); return `<tr><td>${esc(g.label)}</td><td class="n">${d.n}</td><td class="n">${f2(d.mean)} ± ${f2(d.sd)}</td><td class="n">${f2(d.median)} [${f2(d.q1)}; ${f2(d.q3)}]</td><td class="n">${f2(d.min)} – ${f2(d.max)}</td></tr>`; }).join("")}</tbody></table>`;
  }

  // gráfico de uma variável categórica (com filtro cruzado)
  function catCard(grid, vid, o) {
    const v = V(vid); if (!v) return; o = o || {}; const tid = tableOf(vid); const rows = rowsOf(tid);
    const cnt = counts(rows, vid); if (!cnt.cats.length) return;
    let cats = cnt.cats; if (o.top && cats.length > o.top) { const rest = cats.slice(o.top); cats = cats.slice(0, o.top).concat([{ label: `Outras (${rest.length})`, key: "__outras", value: rest.reduce((s, c) => s + c.value, 0), base: cnt.answered }]); }
    if (/^\d{4}-\d{2}$/.test(cats[0].label)) cats = cats.map(c => Object.assign({}, c, { key: c.label, label: mesLbl(c.label) }));
    const c = card({ title: o.title || v.label, sub: `${cnt.answered} com resposta${cnt.miss ? ` · ${cnt.miss} sem resposta` : ""}${v.type === "multi" ? " · mais de uma opção possível" : ""}${tid !== "part" ? " · " + st.model.tables[tid].unidade : ""}`, w: o.w, pin: o.pin, table: () => freqTable(cnt, v.label) });
    grid.appendChild(c);
    const sel = st.filters[vid] && st.filters[vid].kind === "in" ? new Set(st.filters[vid].values) : null;
    mount(c.querySelector(".ch"), el => CH.bar(c.querySelector(".ch"), { cats, horizontal: !o.vertical, selected: sel, title: v.label, onClick: k => k !== "__outras" && toggleFilter(vid, k) }));
  }
  function numCard(grid, vid, o) {
    const v = V(vid); if (!v) return; o = o || {}; const rows = rowsOf(tableOf(vid)); const vals = rows.map(r => r[vid]).filter(x => x != null);
    if (!vals.length) return; const d = S.describe(vals);
    const c = card({ title: o.title || v.label, sub: `n = ${d.n} · média ${f2(d.mean)} ± ${f2(d.sd)} · mediana ${f2(d.median)} [${f2(d.q1)}; ${f2(d.q3)}]`, w: o.w, pin: o.pin, table: () => descTable([{ label: "Todos", values: vals }]) });
    grid.appendChild(c); mount(c.querySelector(".ch"), () => CH.hist(c.querySelector(".ch"), { values: vals, xLabel: v.unit ? v.label + " (" + v.unit + ")" : v.label, title: v.label }));
  }
  function boxCard(grid, vids, o) {
    const ok = vids.filter(V); if (!ok.length) return; o = o || {}; const rows = rowsOf(tableOf(ok[0]));
    let groups;
    if (o.by) { const lv = counts(rows, o.by).cats.map(c => c.label); groups = lv.map((l, i) => ({ label: l, key: l, values: rows.filter(r => (Array.isArray(r[o.by]) ? r[o.by].includes(l) : r[o.by] === l)).map(r => r[ok[0]]).filter(x => x != null), color: o.color })).filter(g => g.values.length); }
    else groups = ok.map(k => ({ label: (o.short ? o.short(lbl(k)) : lbl(k)), values: rows.map(r => r[k]).filter(x => x != null) }));
    if (!groups.some(g => g.values.length)) return;
    const c = card({ title: o.title, sub: o.sub || `◆ = média · caixa = mediana e quartis · pontos = pessoas`, w: o.w, pin: o.pin, table: () => descTable(groups) }); grid.appendChild(c);
    mount(c.querySelector(".ch"), () => CH.box(c.querySelector(".ch"), { groups, domain: o.domain, title: o.title, onClick: o.by ? k => toggleFilter(o.by, k) : null }));
  }
  function meansCard(grid, vids, o) {
    const ok = vids.filter(V); if (!ok.length) return; const rows = rowsOf(tableOf(ok[0]));
    const items = ok.map(k => { const d = S.describe(rows.map(r => r[k])); return { label: o.short ? o.short(lbl(k)) : lbl(k), mean: d.mean, lo: d.ci ? d.ci[0] : NaN, hi: d.ci ? d.ci[1] : NaN, n: d.n, extra: [["Mediana", f2(d.median)]] }; });
    if (!items.some(i => i.n)) return;
    const c = card({ title: o.title, sub: o.sub || "Média e intervalo de confiança de 95%", w: o.w, table: () => `<table class="t"><thead><tr><th>Item</th><th class="n">n</th><th class="n">Média</th><th class="n">IC 95%</th></tr></thead><tbody>${items.map(i => `<tr><td>${esc(i.label)}</td><td class="n">${i.n}</td><td class="n">${f2(i.mean)}</td><td class="n">${f2(i.lo)} a ${f2(i.hi)}</td></tr>`).join("")}</tbody></table>` });
    grid.appendChild(c); mount(c.querySelector(".ch"), () => CH.means(c.querySelector(".ch"), { items, domain: o.domain, title: o.title }));
  }
  function likertCard(grid, vids, o) {
    const ok = vids.filter(V); if (!ok.length) return; const rows = rowsOf(tableOf(ok[0])); const levels = o.levels || V(ok[0]).levels;
    const items = ok.map(k => ({ label: o.short ? o.short(lbl(k)) : lbl(k), counts: levels.map(l => rows.filter(r => r[k] === l).length) }));
    const c = card({ title: o.title, sub: o.sub || "% das respostas em cada item", w: o.w, table: () => `<table class="t"><thead><tr><th>Item</th>${levels.map(l => `<th class="n">${esc(l)}</th>`).join("")}</tr></thead><tbody>${items.map(i => `<tr><td>${esc(i.label)}</td>${i.counts.map(n => `<td class="n">${n}</td>`).join("")}</tr>`).join("")}</tbody></table>` });
    grid.appendChild(c);
    mount(c.querySelector(".ch"), () => o.nominal ? CH.stacked(c.querySelector(".ch"), { cats: items.map(i => i.label), series: levels.map((l, j) => ({ name: l, values: items.map(i => i.counts[j]) })), percent: true, title: o.title })
      : CH.likert(c.querySelector(".ch"), { items, levels, title: o.title }));
  }

  // ---------------- PAINEL
  function pagePainel(pg) {
    const m = st.model, rows = rowsOf("part"), all = baseRows("part");
    pg.innerHTML = `<div class="cab"><div><h2>Painel</h2><p>Visão geral das fichas coletadas. Clique numa barra para filtrar todas as telas por aquele grupo; clique de novo para tirar.</p></div><div class="acoes row"><button type="button" id="pPrint">Imprimir / PDF</button></div></div><div class="kpis" id="kpis"></div><div class="grade" id="grid"></div>`;
    pg.querySelector("#pPrint").onclick = () => { try { window.print(); } catch (e) { toast("Impressão indisponível nesta janela; abra a página no navegador."); } };
    const idades = rows.map(r => r.d_idade).filter(x => x != null);
    const q = Object.values(m.tables).find(t => t.id !== "part");
    const k = [
      ["Participantes", rows.length, rows.length !== all.length ? `de ${all.length} no total` : "fichas de anamnese"],
      V("d_idade") && ["Idade", idades.length ? fmt(S.median(idades), 1) + " anos" : "—", idades.length ? `mediana · IIQ ${fmt(S.quantile(idades, .25), 1)}–${fmt(S.quantile(idades, .75), 1)}` : ""],
      V("7_Sexo") && ["Sexo feminino", rows.length ? fmt(100 * rows.filter(r => r["7_Sexo"] === "Feminino").length / rows.filter(r => r["7_Sexo"]).length, 0) + "%" : "—", `${rows.filter(r => r["7_Sexo"] === "Feminino").length} participantes`],
      ...m.forms.filter(f => f.rel === "1:1").map(f => [f.nome.replace(/\s*\(.*\)/, ""), rows.filter(r => r["_has_" + f.slug]).length, `responderam (${fmt(100 * rows.filter(r => r["_has_" + f.slug]).length / Math.max(1, rows.length), 0)}%)`]),
      q && [q.label.replace(/\s*\(.*\)/, ""), rowsOf(q.id).length, `${q.unidade} · ${new Set(rowsOf(q.id).map(r => r._pid)).size} participantes`],
    ].filter(Boolean);
    pg.querySelector("#kpis").innerHTML = k.map(([a, b, c]) => `<div class="kpi"><div class="k">${esc(a)}</div><div class="v">${esc(String(b))}</div><div class="d">${esc(c)}</div></div>`).join("");
    const g = pg.querySelector("#grid");
    if (!rows.length) { g.innerHTML = `<div class="card w12"><p class="vazio">Nenhum participante com os filtros atuais.</p></div>`; return; }
    const cut = s => s.replace(/^(Supino|Prono|Sentado|Em pé):\s*/, "$1 · ").replace(/^SF-36\s+/, "").replace(/^B-IPQ\s+\d\s·\s/, "").replace(/^B-QUEST\s+\d+\s·\s/, "").replace(/\*$/, "");
    catCard(g, "d_diag", { title: "Diagnóstico" });
    catCard(g, "d_faixa", { w: 3, vertical: true, title: "Faixa etária" });
    catCard(g, "7_Sexo", { w: 3, title: "Sexo" });
    mapCards(g, { compact: true });
    catCard(g, "d_mes", { vertical: true, title: "Avaliações por mês" });
    catCard(g, "12_Faz_tratamento_em", { title: "Onde faz tratamento", top: 9 });
    catCard(g, "76_Comunicao_e_cogni", { title: "Comunicação e cognição" });
    catCard(g, "d_prematuro", { w: 6, title: "Prematuridade (idade gestacional)" });
    catCard(g, "43_Escolaridade", { w: 4, title: "Escolaridade do responsável" });
    catCard(g, "42_Situao_Profission", { w: 4, title: "Situação profissional do responsável" });
    catCard(g, "56_Meio_de_transport", { w: 4, title: "Meio de transporte" });
    catCard(g, "d_bpn", { w: 6, title: "Peso ao nascer" });
    boxCard(g, ["d_motor"], { by: "d_diag", title: "Escore motor do laboratório por diagnóstico", sub: "0–100, exploratório · ◆ média · clique para filtrar", domain: [0, 100] });
    likertCard(g, ["60_Supino__Cabea_na_", "61_Supino__mo_na_lin", "62_Supino__levanta_c", "65_Supino__Alcana_ob", "66_Supino__Rola_de_s", "67_Prono__Levanta_a_"], { title: "Tarefas motoras em supino e prono", short: cut });
    likertCard(g, ["69_Sentado__Controle", "70_Sentado__Controle", "71_Sentado__Pegar_br", "72_Sentado__Passa_pa", "73_Sentado__Atinge_q", "74_Sentado_sobre_o_b", "75_Em_p__Atinge_a_po"].slice(0, 2), { title: "Controle sentado", short: cut });
    likertCard(g, ["71_Sentado__Pegar_br", "72_Sentado__Passa_pa", "73_Sentado__Atinge_q", "74_Sentado_sobre_o_b", "75_Em_p__Atinge_a_po"], { title: "Tarefas sentado e em pé", short: cut });
    likertCard(g, ["57_Tnus_muscular__MM", "58_Tnus_muscular__Tr", "59_Tnus_muscular__MM"], { title: "Tônus muscular", short: s => s.replace("Tônus muscular — ", "").replace("*", ""), nominal: true, levels: V("57_Tnus_muscular__MM") && V("57_Tnus_muscular__MM").levels });
    if (V("s_bipq")) { meansCard(g, D.bipqItems, { title: "B-IPQ: itens (0–10)", domain: [0, 10], short: cut, sub: "Percepção do responsável sobre a doença · média e IC 95%" }); numCard(g, "s_bipq", { title: "B-IPQ: escore total (0–80)" }); }
    if (D.sfDomains && V("s_sf_cf")) boxCard(g, D.sfDomains, { title: "SF-36 do responsável: domínios (0–100)", w: 12, domain: [0, 100], short: cut, sub: "0 = pior, 100 = melhor · ◆ média · caixa = mediana e quartis" });
    if (D.questItems && V(D.questItems[0])) { meansCard(g, D.questItems, { title: "B-QUEST: satisfação por item (1–5)", domain: [1, 5], short: cut }); catCard(g, "146_Qual_o_dispositi", { title: "Dispositivos avaliados no B-QUEST" }); }
    // gráficos fixados no explorador
    st.cfg.pins.forEach((p, i) => { try { exploreCard(g, Object.assign({}, p, { pin: i })); } catch (e) { } });
  }

  // ---------------- MAPAS
  function mapCards(grid, o) {
    const MP = window.EMapas; if (!MP || !V("d_uf")) return;
    const rows = rowsOf("part"), total = rows.length;
    const byUF = {}, byMun = {}; let semUF = 0, semMun = 0, foraGO = 0;
    const ufCode = Object.fromEntries(MP.br.shapes.map(s => [s.n, s.c])), munCode = Object.fromEntries(MP.go.shapes.map(s => [s.n, s.c]));
    rows.forEach(r => { const u = ufCode[r.d_uf]; if (u) byUF[u] = (byUF[u] || 0) + 1; else semUF++; const m = munCode[r.d_municipio]; if (m) byMun[m] = (byMun[m] || 0) + 1; else if (r.d_municipio) foraGO++; else semMun++; });
    const nUF = Object.keys(byUF).length, nMun = Object.keys(byMun).length, comMun = total - semMun;
    const selUF = st.filters.d_uf && st.filters.d_uf.kind === "in" ? new Set(st.filters.d_uf.values) : null, selMun = st.filters.d_municipio && st.filters.d_municipio.kind === "in" ? new Set(st.filters.d_municipio.values) : null;
    const tUF = () => `<table class="t"><thead><tr><th>Estado</th><th class="n">Participantes</th><th class="n">%</th></tr></thead><tbody>${MP.br.shapes.filter(s => byUF[s.c]).sort((a, b) => byUF[b.c] - byUF[a.c]).map(s => `<tr><td>${esc(s.n)}</td><td class="n">${byUF[s.c]}</td><td class="n">${fmt(100 * byUF[s.c] / Math.max(1, total - semUF), 1)}</td></tr>`).join("")}${semUF ? `<tr><td class="note">Sem estado informado</td><td class="n">${semUF}</td><td></td></tr>` : ""}</tbody></table>`;
    const tMun = () => `<table class="t"><thead><tr><th>Município</th><th class="n">Participantes</th><th class="n">%</th></tr></thead><tbody>${MP.go.shapes.filter(s => byMun[s.c]).sort((a, b) => byMun[b.c] - byMun[a.c]).map(s => `<tr><td>${esc(s.n)}</td><td class="n">${byMun[s.c]}</td><td class="n">${fmt(100 * byMun[s.c] / Math.max(1, comMun - foraGO), 1)}</td></tr>`).join("")}${foraGO ? `<tr><td class="note">Fora de Goiás</td><td class="n">${foraGO}</td><td></td></tr>` : ""}${semMun ? `<tr><td class="note">Sem município informado</td><td class="n">${semMun}</td><td></td></tr>` : ""}</tbody></table>`;
    const c1 = card({ title: "Estados atendidos", sub: `${nUF} ${nUF === 1 ? "estado" : "estados"} · ${total - semUF} participantes com estado informado`, w: 6, table: tUF });
    const c2 = card({ title: "Municípios de Goiás atendidos", sub: comMun ? `${nMun} ${nMun === 1 ? "município" : "municípios"} · ${comMun} de ${total} participantes com município informado` : `A ficha atual não pergunta o município. Complete na tela Mapa.`, w: 6, table: tMun });
    grid.appendChild(c1); grid.appendChild(c2);
    mount(c1.querySelector(".ch"), () => CH.map(c1.querySelector(".ch"), { map: MP.br, values: byUF, selected: selUF, title: "Estados atendidos", labels: 27, labelText: s => s.c, labelSize: 10, maxH: o.compact ? 380 : 560, onClick: k => toggleFilter("d_uf", k) }));
    const dfPts = [...MP.go.df.matchAll(/([\d.]+),([\d.]+)/g)].map(q => [+q[1], +q[2]]);
    const dfShape = { d: MP.go.df, label: "DF", x: dfPts.reduce((s, p) => s + p[0], 0) / dfPts.length, y: dfPts.reduce((s, p) => s + p[1], 0) / dfPts.length };
    // sem municípios informados: Goiás por região (pergunta "Cidade que mora": capital / Região Metropolitana / demais)
    const REG = ["Goiânia (capital)", "Região Metropolitana de Goiânia, exceto a capital", "Demais municípios de Goiás"];
    const byReg = {}; rows.forEach(r => { if (REG.includes(r.d_regiao)) byReg[r.d_regiao] = (byReg[r.d_regiao] || 0) + 1; });
    const nReg = Object.values(byReg).reduce((a, b) => a + b, 0);
    const mode = st.goMode || (comMun ? "mun" : nReg ? "reg" : "mun");
    const regOf = sh => { const k = D.key(sh.n); return k === D.RMG[0] ? REG[0] : D.RMG.includes(k) ? REG[1] : REG[2]; };
    if (mode === "reg") {
      c2.querySelector("h4").textContent = "Goiás por região de moradia";
      c2.querySelector(".sub").textContent = `${nReg} de ${total} participantes responderam “Cidade que mora” (capital, Região Metropolitana ou demais municípios)`;
      c2._tab = () => `<table class="t"><thead><tr><th>Região</th><th class="n">Participantes</th></tr></thead><tbody>${REG.map(g => `<tr><td>${esc(g)}</td><td class="n">${byReg[g] || 0}</td></tr>`).join("")}<tr><td class="note">Sem resposta</td><td class="n">${total - nReg}</td></tr></tbody></table>`;
      const gs = MP.go.shapes.find(s => D.key(s.n) === D.RMG[0]) || { cx: 0, cy: 0 };
      const selReg = st.filters.d_regiao && st.filters.d_regiao.kind === "in" ? new Set(st.filters.d_regiao.values) : null;
      mount(c2.querySelector(".ch"), () => CH.map(c2.querySelector(".ch"), { map: MP.go, values: byReg, shapeVal: sh => byReg[regOf(sh)] || 0, keyOf: regOf, selected: selReg, under: dfShape, maxH: o.compact ? 380 : 620, title: "Goiás por região de moradia",
        shapeTip: (sh, v) => `<b>${esc(regOf(sh))}</b><div class="r"><span>Município</span><span class="v">${esc(sh.n)}</span></div><div class="r"><span>Participantes na região</span><span class="v">${fmt(v, 0)}</span></div>`,
        fillOf: (sh, v) => { if (!v) return "#EEEBF5"; const r = regOf(sh); return r === REG[0] ? "#4F2BA8" : r === REG[1] ? "#9560FD" : "#D9CCFB"; },
        legendItems: [["#4F2BA8", `Goiânia (${byReg[REG[0]] || 0})`], ["#9560FD", `Região Metropolitana (${byReg[REG[1]] || 0})`], ["#D9CCFB", `Demais municípios (${byReg[REG[2]] || 0})`]],
        groupLabels: [{ x: gs.cx, y: gs.cy + 16, t: `Goiânia: ${byReg[REG[0]] || 0}` }, { x: gs.cx - 40, y: gs.cy - 26, t: `RM: ${byReg[REG[1]] || 0}`, anchor: "end" }, { x: MP.go.w * 0.42, y: MP.go.h * 0.25, t: `Demais municípios: ${byReg[REG[2]] || 0}` }],
        onClick: k => toggleFilter("d_regiao", k) }));
    } else
    mount(c2.querySelector(".ch"), () => CH.map(c2.querySelector(".ch"), { map: MP.go, values: byMun, selected: selMun, title: "Municípios de Goiás atendidos", under: dfShape, labels: o.compact ? 5 : 8, maxH: o.compact ? 380 : 620, onClick: k => toggleFilter("d_municipio", k) }));
    return { byUF, byMun, semMun, comMun, nUF, nMun };
  }
  function pageMapa(pg) {
    const MP = window.EMapas, m = st.model;
    pg.innerHTML = `<div class="cab"><div><h2>Mapa de atendimento</h2><p>De onde vêm os participantes: estados do Brasil e municípios de Goiás. Clique num estado ou município colorido para filtrar todas as telas.</p></div></div><div class="row" style="margin-bottom:12px"><span class="note" style="font-weight:600">Goiás por</span><select id="mMode"><option value="">automático</option><option value="mun">município</option><option value="reg">região (capital / Região Metropolitana / demais)</option></select></div><div class="grade" id="mGrid"></div><div id="mFill"></div>`;
    $("#mMode").value = st.goMode || ""; $("#mMode").onchange = e => { st.goMode = e.target.value || null; render(); };
    const res = mapCards($("#mGrid"), { compact: false }) || {};
    // completar municípios
    const rows = m.tables.part.rows, man = st.cfg.municipios || (st.cfg.municipios = {});
    const auto = D.munField ? lbl(D.munField) : null;
    const munNames = MP.go.shapes.map(s => s.n).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const textKeys = ["49_Bairro", "20_Local_do_parto", "47_Cidade_que_mora", "88_Observaes", "55_Se_sim_quais_e_qu"].filter(k => V(k));
    const pend = rows.filter(r => !r.d_municipio || man[r._uuid]);
    const name = r => r["4_Nome_do_participan"] || r._title || "";
    const sug = r => man[r._uuid] ? null : D.suggestMun(textKeys.map(k => r[k]), munNames);
    const nSug = rows.filter(r => !r.d_municipio && sug(r)).length;
    $("#mFill").innerHTML = `<div class="painelf" style="margin-top:14px"><h3 class="sec" style="margin-top:0">Completar municípios</h3>
      <p class="note" style="max-width:90ch">${auto ? `O município vem da pergunta “${esc(auto)}”. ` : `<b>A ficha de anamnese atual não tem a pergunta “município de residência”</b> — só “Estado” e a região (capital, Região Metropolitana ou demais municípios). Para os próximos atendimentos, vale incluir no Epicollect uma pergunta de município com a lista dos 246 municípios de Goiás e a opção “Outro estado”: o mapa passa a se preencher sozinho. `}
      Para as fichas já coletadas, digite o município abaixo. ${nSug ? `A ferramenta achou nomes de municípios no bairro ou no local do parto de ${nSug} participantes e deixou como <b>sugestão</b> (em cinza): confira antes de aceitar.` : ""} O que for preenchido fica salvo neste navegador e vai junto no arquivo de regras (tela Exportar), para a equipe compartilhar.</p>
      <div class="row" style="margin:10px 0"><label class="chk"><input type="checkbox" id="mPII"${st.cfg.showPII ? " checked" : ""}> Mostrar nomes para identificar as fichas</label><select id="mShow"><option value="pend">Só quem está sem município</option><option value="all">Todos</option></select>${nSug ? `<button type="button" id="mAcc">Aceitar todas as sugestões (${nSug})</button>` : ""}<button class="primary" type="button" id="mSave">Salvar municípios</button></div>
      <datalist id="mDl">${munNames.map(n => `<option value="${esc(n)}">`).join("")}<option value="Brasília (DF)"><option value="Outro estado"></datalist>
      <div class="tw" style="max-height:520px;overflow:auto"><table class="t"><thead><tr><th>ID</th>${st.cfg.showPII ? "<th>Participante</th>" : ""}<th>Estado</th><th>Região (ficha)</th><th>Bairro / local do parto</th><th style="min-width:240px">Município</th></tr></thead><tbody id="mBody"></tbody></table></div></div>`;
    const drawBody = () => {
      const all = $("#mShow").value === "all"; const list = all ? rows : rows.filter(r => !r.d_municipio || man[r._uuid]);
      $("#mBody").innerHTML = list.map(r => { const s = sug(r); return `<tr><td>${esc(r._id)}</td>${st.cfg.showPII ? `<td>${esc(name(r))}</td>` : ""}<td>${esc(r.d_uf || "")}</td><td class="note">${esc(r["47_Cidade_que_mora"] || "")}</td><td class="note">${st.cfg.showPII ? esc([r["49_Bairro"], r["20_Local_do_parto"]].filter(Boolean).join(" · ")) : (s ? "contém nome de município" : "")}</td>
        <td><input type="text" list="mDl" data-u="${esc(r._uuid)}" value="${esc(man[r._uuid] || (D.munField && r.d_municipio) || "")}" placeholder="${esc(s ? s + " (sugestão)" : "município")}"${s ? ` data-sug="${esc(s)}"` : ""} style="width:100%"${D.munField && r.d_municipio && !man[r._uuid] ? " disabled" : ""}></td></tr>`; }).join("") || `<tr><td colspan="6" class="vazio">Todos os participantes têm município.</td></tr>`;
    };
    drawBody();
    $("#mShow").onchange = drawBody;
    $("#mPII").onchange = e => { st.cfg.showPII = e.target.checked; saveCfg(); render(); };
    if ($("#mAcc")) $("#mAcc").onclick = () => { $$("#mBody input[data-sug]").forEach(i => { if (!i.value) i.value = i.dataset.sug; }); toast("Sugestões preenchidas. Confira e clique em Salvar municípios."); };
    $("#mSave").onclick = () => {
      let n = 0; $$("#mBody input[data-u]").forEach(i => { if (i.disabled) return; const v = i.value.trim(), u = i.dataset.u; if (v) { const ok = munNames.find(x => D.key(x) === D.key(v)); man[u] = ok || v; n++; } else delete man[u]; });
      saveCfg(); rebuild(); render(); toast(`${n} municípios salvos.`);
    };
  }

  // ---------------- EXPLORAR
  function exploreCard(grid, p) {
    const x = V(p.x), y = V(p.y), gv = V(p.g); if (!x) return;
    const tid = tableOf(p.y && tableOf(p.y) !== "part" ? p.y : p.x !== undefined && tableOf(p.x) !== "part" ? p.x : (p.g && tableOf(p.g) !== "part" ? p.g : "part"));
    const rows = rowsOf(tid); const title = p.title || [x.label, y && y.label, gv && "por " + gv.label].filter(Boolean).join(" × ");
    const w = p.w || 6;
    const isNum = v => v && v.type === "num";
    if (!y && !gv) return isNum(x) ? numCard(grid, x.id, { w, pin: p.pin, title }) : catCard(grid, x.id, { w, pin: p.pin, title, vertical: x.ordinal, top: 15 });
    // num × grupo
    if ((isNum(x) && !y && gv && !isNum(gv)) || (!isNum(x) && isNum(y))) {
      const num = isNum(x) ? x : y, grp = isNum(x) ? gv : x;
      return boxCard(grid, [num.id], { by: grp.id, title, w, sub: num.label + (num.unit ? ` (${num.unit})` : "") + " · ◆ média" });
    }
    if (isNum(x) && isNum(y)) {
      const pts = rows.map(r => ({ x: r[x.id], y: r[y.id], g: gv ? r[gv.id] : null, id: r._id })).filter(q => q.x != null && q.y != null && (!gv || q.g != null));
      const grp = gv ? D.levelsOf(gv, rows).slice(0, 8) : null; const pts2 = grp ? pts.filter(q => grp.includes(q.g)) : pts;
      const pr = S.pearson(pts2.map(q => q.x), pts2.map(q => q.y)), sp = S.spearman(pts2.map(q => q.x), pts2.map(q => q.y));
      const c = card({ title, sub: `n = ${pts2.length} pares · Pearson r = ${f2(pr.r)} (p ${fp(pr.p).startsWith("<") ? fp(pr.p) : "= " + fp(pr.p)}) · Spearman ρ = ${f2(sp.r)}`, w, pin: p.pin }); grid.appendChild(c);
      return mount(c.querySelector(".ch"), () => CH.scatter(c.querySelector(".ch"), { points: pts2, groups: grp, xLabel: x.label, yLabel: y.label, fit: pr, title }));
    }
    // categórica × categórica
    const other = y || gv; const xt = S.crosstab(rows.map(r => r[x.id]), rows.map(r => r[other.id]));
    const xr = x.levels ? x.levels.filter(l => xt.rows.includes(l)) : xt.rows, oc = other.levels ? other.levels.filter(l => xt.cols.includes(l)) : xt.cols;
    const mm = xr.map(a => oc.map(b => xt.m[xt.rows.indexOf(a)][xt.cols.indexOf(b)]));
    const c = card({ title, sub: `Barras = ${esc(x.label)} · cores = ${esc(other.label)}${p.percent ? " · em % de cada barra" : ""}`, w, pin: p.pin, table: () => crossHtml(xr, oc, mm, x.label) }); grid.appendChild(c);
    const many = oc.length > 8; const ocs = many ? oc.slice(0, 7).concat(["Outras"]) : oc; const mm2 = many ? mm.map(r => r.slice(0, 7).concat([r.slice(7).reduce((a, b) => a + b, 0)])) : mm;
    mount(c.querySelector(".ch"), () => CH.stacked(c.querySelector(".ch"), { cats: xr, series: ocs.map((o, j) => ({ name: o, values: mm2.map(r => r[j]) })), percent: !!p.percent, colors: other.ordinal ? ocs.map((_, i) => CH.C.seq[Math.round(1 + i * 7 / Math.max(1, ocs.length - 1))]) : null, title, onClick: k => toggleFilter(x.id, k) }));
  }
  function crossHtml(rows, cols, m, rl) {
    const rt = m.map(r => r.reduce((a, b) => a + b, 0)), ct = cols.map((_, j) => m.reduce((s, r) => s + r[j], 0)), N = rt.reduce((a, b) => a + b, 0);
    return `<table class="t"><thead><tr><th>${esc(rl)}</th>${cols.map(c => `<th class="n">${esc(c)}</th>`).join("")}<th class="n">Total</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${esc(r)}</td>${m[i].map(v => `<td class="n">${v} <span class="note">(${fmt(rt[i] ? 100 * v / rt[i] : 0, 1)}%)</span></td>`).join("")}<td class="n">${rt[i]}</td></tr>`).join("")}<tr><td><b>Total</b></td>${ct.map(v => `<td class="n"><b>${v}</b></td>`).join("")}<td class="n"><b>${N}</b></td></tr></tbody></table><p class="note">% na linha.</p>`;
  }
  function pageExplorar(pg) {
    const e = st.explore; if (!e.x || !V(e.x)) e.x = "d_diag";
    pg.innerHTML = `<div class="cab"><div><h2>Explorar</h2><p>Monte um gráfico cruzando até três variáveis. O tipo de gráfico é escolhido pelo tipo de dado: barras para categorias, histograma ou caixas para números, dispersão para dois números.</p></div></div>
      <div class="painelf"><div class="campos">
        <label>Variável principal${varSelect("ex", { value: e.x, all: true })}</label>
        <label>Cruzar com (opcional)${varSelect("ey", { value: e.y, none: "— nenhuma —", all: true, noMulti: true })}</label>
        <label>Separar por cor / grupo (opcional)${varSelect("eg", { value: e.g, none: "— nenhum —", types: ["cat"], all: true })}</label>
        <label class="chk" style="flex-direction:row;font-weight:500"><input type="checkbox" id="ep"${e.percent ? " checked" : ""}> Barras empilhadas em %</label>
      </div><div class="row" style="margin-top:12px"><button class="primary" type="button" id="ePin">Fixar no painel</button><button type="button" id="eStat">Testar estatisticamente</button><span class="note" id="eHint"></span></div></div>
      <div class="grade" id="eGrid"></div><div id="eTab" class="painelf tw" style="margin-top:14px"></div>`;
    const read = () => { e.x = $("#ex").value; e.y = $("#ey").value || null; e.g = $("#eg").value || null; e.percent = $("#ep").checked; };
    const draw = () => {
      read(); const g = $("#eGrid"); g.innerHTML = ""; exploreCard(g, Object.assign({ w: 12 }, e));
      const x = V(e.x), y = V(e.y), gv = V(e.g), rows = rowsOf(tableOf(e.y && tableOf(e.y) !== "part" ? e.y : e.x));
      let h = "";
      if (x.type === "num" && !y) { const grp = gv ? D.levelsOf(gv, rows) : null; h = descTable(grp ? grp.map(l => ({ label: l, values: rows.filter(r => r[gv.id] === l).map(r => r[x.id]).filter(v => v != null) })) : [{ label: "Todos", values: rows.map(r => r[x.id]).filter(v => v != null) }]); }
      else if (x.type !== "num" && y && y.type === "num") h = descTable(D.levelsOf(x, rows).map(l => ({ label: l, values: rows.filter(r => Array.isArray(r[x.id]) ? r[x.id].includes(l) : r[x.id] === l).map(r => r[y.id]).filter(v => v != null) })));
      else if (x.type !== "num" && !y && !gv) h = freqTable(counts(rows, x.id), x.label);
      $("#eTab").innerHTML = h || "<p class='note'>Use “Testar estatisticamente” para ver o teste adequado a este cruzamento.</p>";
    };
    ["ex", "ey", "eg", "ep"].forEach(id => $("#" + id).addEventListener("change", draw)); draw();
    $("#ePin").onclick = () => { read(); st.cfg.pins.push({ x: e.x, y: e.y, g: e.g, percent: e.percent }); saveCfg(); toast("Gráfico fixado no fim do painel."); };
    $("#eStat").onclick = () => {
      read(); const x = V(e.x), y = V(e.y) || V(e.g);
      if (!y) { st.statTab = "descritiva"; st.preset = { vars: [e.x] }; }
      else if (x.type === "num" && y.type === "num") { st.statTab = "correlacao"; st.preset = { vars: [e.x, y.id] }; }
      else if (x.type === "num" || y.type === "num") { st.statTab = "comparar"; st.preset = { y: x.type === "num" ? e.x : y.id, g: x.type === "num" ? y.id : e.x }; }
      else { st.statTab = "associacao"; st.preset = { a: e.x, b: y.id }; }
      location.hash = "estatistica";
    };
  }

  // ---------------- ESTATÍSTICA
  const efLabel = (v, cuts) => { const a = Math.abs(v); return !isFinite(a) ? "" : a < cuts[0] ? "desprezível" : a < cuts[1] ? "pequeno" : a < cuts[2] ? "médio" : "grande"; };
  const pTxt = p => p < 0.001 ? "p < 0,001" : "p = " + fp(p);
  const resultBox = (html, title) => `<div class="painelf res">${html}<div class="row noprint" style="margin-top:14px;justify-content:flex-end;border-top:1px solid var(--linha);padding-top:10px"><button class="small" type="button" data-fig>Exportar figura</button><button class="small primary" type="button" data-rep${title ? ` data-title="${esc(title)}"` : ""}>+ Adicionar ao relatório</button></div></div>`;
  const frase = (t, lab) => `<div class="frase"><span class="lbl">${lab || "Para o texto de resultados"}</span>${t}</div>`;
  const actions = id => `<div class="row noprint" style="margin-top:10px"><button class="small" type="button" data-copy="${id}">Copiar tabela</button><button class="small" type="button" data-csv="${id}">Baixar CSV</button></div>`;
  function wireActions(root) {
    glossify(root);
    root.querySelectorAll("[data-rep]").forEach(b => b.onclick = () => { const box = b.closest(".res"); const h = box.querySelector("h3"); addToReport(b.dataset.title || (h ? h.textContent : "Resultado"), box); });
    root.querySelectorAll("[data-fig]").forEach(b => { const box = b.closest(".res"); b.onclick = () => { const ch = [...box.querySelectorAll(".ch")].find(c => c.querySelector("svg")); if (!ch) return toast("Este resultado não tem gráfico."); const h = box.querySelector("h3, h4"); figDialog(ch, h ? h.textContent : "Figura"); }; });
    root.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => copyTable(root.querySelector("#" + b.dataset.copy)));
    root.querySelectorAll("[data-csv]").forEach(b => b.onclick = () => { const t = root.querySelector("#" + b.dataset.csv); const rows = [...t.rows].map(r => [...r.cells].map(c => c.innerText.trim())); save(b.dataset.csv + ".csv", D.toCSV(rows[0], rows.slice(1), st.cfg.sep, ",")); });
  }
  function groupsOf(rows, yv, gv, only) {
    const lv = D.levelsOf(V(gv), rows).filter(l => !only || only.includes(l));
    return lv.map(l => ({ label: l, values: rows.filter(r => Array.isArray(r[gv]) ? r[gv].includes(l) : r[gv] === l).map(r => r[yv]).filter(x => x != null) })).filter(g => g.values.length);
  }
  // escolha e execução do teste de comparação
  function compare(groups, method) {
    const k = groups.length, out = { k };
    out.normal = groups.map(g => g.values.length >= 3 ? S.shapiro(g.values) : { p: NaN });
    const allNormal = out.normal.every(n => isFinite(n.p) && n.p >= 0.05) && groups.every(g => g.values.length >= 3);
    out.lev = k >= 2 ? S.levene(groups.map(g => g.values)) : null;
    out.param = method === "param" ? true : method === "nonparam" ? false : allNormal;
    out.auto = method === "auto"; out.allNormal = allNormal;
    const vals = groups.map(g => g.values);
    if (k === 2) {
      if (out.param) { const r = S.ttest(vals[0], vals[1], true); out.main = r; out.stat = `t(${f2(r.df)}) = ${f2(r.t)}`; out.eff = { name: "g de Hedges", v: r.g, txt: efLabel(r.g, [0.2, 0.5, 0.8]) }; out.extra = `Diferença de médias = ${f2(r.diff)} (IC 95%: ${f2(r.ci[0])} a ${f2(r.ci[1])})`; }
      else { const r = S.mannwhitney(vals[0], vals[1]); out.main = r; out.stat = `U = ${fmt(r.U, 1)}; z = ${f2(r.z)}`; out.eff = { name: "r", v: r.r, txt: efLabel(r.r, [0.1, 0.3, 0.5]) }; }
    } else {
      if (out.param) { const welch = out.lev && out.lev.p < 0.05; const r = welch ? S.welchAnova(vals) : S.anova(vals); const a = S.anova(vals); out.main = r; out.stat = `F(${r.df1}; ${f2(r.df2)}) = ${f2(r.F)}`; out.eff = { name: "η²", v: a.eta2, txt: efLabel(a.eta2, [0.01, 0.06, 0.14]) }; if (r.p < 0.05) out.post = { name: "t de Welch par a par com correção de Holm", rows: S.pairwiseT(vals, groups.map(g => g.label)) }; }
      else { const r = S.kruskal(vals); out.main = r; out.stat = `H(${r.df}) = ${f2(r.H)}`; out.eff = { name: "ε²", v: r.eps2, txt: efLabel(r.eps2, [0.01, 0.06, 0.14]) }; if (r.p < 0.05) out.post = { name: "Dunn com correção de Holm", rows: S.dunn(vals, groups.map(g => g.label)) }; }
    }
    return out;
  }

  function pageEstat(pg) {
    const tabs = [["descritiva", "Descritiva"], ["comparar", "Comparar grupos"], ["associacao", "Associação entre categorias"], ["correlacao", "Correlação"], ["regressao", "Regressão linear"], ["logistica", "Regressão logística"], ["pareado", "Antes e depois"], ["normas", "SF-36 × normas"], ["ausentes", "Dados ausentes"], ["confiabilidade", "Confiabilidade"]];
    pg.innerHTML = `<div class="cab"><div><h2>Estatística</h2><p>Os testes usam os ${esc(st.model.tables[st.table].unidade)} que passam pelos filtros do topo. Quando a escolha está em “automático”, a ferramenta confere a normalidade (Shapiro-Wilk) e escolhe entre o teste paramétrico e o não paramétrico.</p></div></div>
      <div class="abas" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-t="${k}" class="${st.statTab === k ? "cur" : ""}">${l}</button>`).join("")}</div><div id="sBody"></div>`;
    pg.querySelectorAll(".abas button").forEach(b => b.onclick = () => { st.statTab = b.dataset.t; st.preset = null; render(); });
    const body = pg.querySelector("#sBody"); const tabNow = st.statTab; setTimeout(() => { if (st.statTab === tabNow && body.isConnected) body.insertAdjacentHTML("afterbegin", helpBox(tabNow)); }, 0); ({ descritiva: statDesc, comparar: statComp, associacao: statAssoc, correlacao: statCorr, regressao: statReg, logistica: statLog, pareado: statPair, normas: statNorm, ausentes: statMiss, confiabilidade: statRel })[st.statTab](body, st.preset || {});
    st.preset = null;
  }
  function statDesc(b, pre) {
    const defs = (pre.vars || ["d_idade", "7_Sexo", "d_diag", "s_bipq"]).filter(V);
    b.innerHTML = `<div class="painelf"><div class="campos" style="grid-template-columns:2fr 1fr"><div><div class="note" style="font-weight:600;margin-bottom:5px">Variáveis</div>${varChecks("dv", { types: ["num", "cat", "multi"], noVirtual: true }, defs)}</div>
      <div><label class="note" style="font-weight:600;display:block;margin-bottom:5px">Separar por grupo (opcional)</label>${varSelect("dg", { none: "— sem grupos —", types: ["cat"] })}<p class="note">Números: n, média, desvio padrão, mediana, intervalo interquartil e teste de Shapiro-Wilk. Categorias: frequências e porcentagens sobre quem respondeu.</p><button class="primary" type="button" id="dGo">Calcular</button></div></div></div><div id="dOut"></div>`;
    const go = () => {
      const ids = checked(b, "dv"), g = $("#dg").value, rows = rowsOf(st.table); const grp = g ? D.levelsOf(V(g), rows) : null;
      const sets = grp ? grp.map(l => ({ l, rows: rows.filter(r => r[g] === l) })) : [{ l: "Total", rows }];
      let h = `<table class="t" id="tDesc"><thead><tr><th>Variável</th><th>Medida</th>${sets.map(s => `<th class="n">${esc(s.l)}<br><span class="note">n = ${s.rows.length}</span></th>`).join("")}</tr></thead><tbody>`;
      ids.forEach(id => {
        const v = V(id);
        if (v.type === "num") {
          const ds = sets.map(s => S.describe(s.rows.map(r => r[id])));
          h += `<tr class="grp"><td colspan="${2 + sets.length}">${esc(v.label)}${v.unit && !/\(/.test(v.label) ? ` (${esc(v.unit)})` : ""}</td></tr>`;
          [["n válido", d => d.n], ["Média ± DP", d => `${f2(d.mean)} ± ${f2(d.sd)}`], ["IC 95% da média", d => d.ci ? `${f2(d.ci[0])} a ${f2(d.ci[1])}` : "—"], ["Mediana [IIQ]", d => `${f2(d.median)} [${f2(d.q1)}; ${f2(d.q3)}]`], ["Mín – máx", d => `${f2(d.min)} – ${f2(d.max)}`], ["Shapiro-Wilk (p)", d => isFinite(d.swP) ? `${fp(d.swP)}${d.swP < 0.05 ? " · não normal" : ""}` : "—"]]
            .forEach(([k, fn]) => h += `<tr><td></td><td>${k}</td>${ds.map(d => `<td class="n">${d.n ? fn(d) : "—"}</td>`).join("")}</tr>`);
        } else {
          h += `<tr class="grp"><td colspan="${2 + sets.length}">${esc(v.label)}${v.type === "multi" ? " <span class='note'>(mais de uma opção)</span>" : ""}</td></tr>`;
          const cs = sets.map(s => counts(s.rows, id)); const lv = counts(rows, id).cats.map(c => c.label);
          lv.forEach(l => h += `<tr><td></td><td>${esc(l)}</td>${cs.map(c => { const x = c.cats.find(q => q.label === l); return `<td class="n">${x ? `${x.value} (${fmt(100 * x.value / x.base, 1)}%)` : "0"}</td>`; }).join("")}</tr>`);
          h += `<tr><td></td><td class="note">Sem resposta</td>${cs.map(c => `<td class="n note">${c.miss}</td>`).join("")}</tr>`;
        }
      });
      $("#dOut").innerHTML = resultBox(`<div class="tw">${h}</tbody></table></div>${actions("tDesc")}`); wireActions($("#dOut"));
      const nums = ids.filter(k => V(k).type === "num"), asym = nums.filter(k => { const d = S.describe(rows.map(r => r[k])); return d.swP < 0.05; });
      addLer($("#dOut"), [nums.length ? `Variáveis numéricas: a linha “Shapiro-Wilk” indica se os dados são compatíveis com a distribuição normal. ${asym.length ? `${asym.map(k => esc(lbl(k))).join(", ")} ${asym.length === 1 ? "foge" : "fogem"} da normal (p < 0,05): descreva por <b>mediana [IIQ]</b> e use testes não paramétricos.` : "Todas são compatíveis com a normal: média ± DP é adequada."}` : null,
        `Categorias: a porcentagem é calculada sobre quem respondeu; a linha “Sem resposta” mostra quantos ficaram de fora. Informe esse número no artigo.`,
        g ? `Com grupos, esta tabela só descreve. Para saber se os grupos diferem, use “Comparar grupos” ou a Tabela para artigo, que já traz o valor de p.` : null],
        rBlock(`vars <- c(${ids.filter(k => V(k).type !== "multi").map(k => rs(rn(k))).join(", ")})\nsummary(d[, vars])\n${nums.map(k => `shapiro.test(d$${rn(k)})`).join("\n")}${ids.filter(k => V(k).type === "cat").map(k => `\nprop.table(table(d$${rn(k)})) * 100`).join("")}`, ids, GU.T.descritiva.jamovi));
    };
    $("#dGo").onclick = go; go();
  }
  function statComp(b, pre) {
    const y0 = pre.y || "s_bipq", g0 = pre.g || "d_diag";
    b.innerHTML = `<div class="painelf"><div class="campos"><label>Desfecho numérico${varSelect("cy", { types: ["num"], value: y0 })}</label><label>Grupos${varSelect("cg", { types: ["cat"], value: g0 })}</label>
      <label>Teste<select id="cm"><option value="auto">Automático (conforme a normalidade)</option><option value="param">Paramétrico (t / ANOVA)</option><option value="nonparam">Não paramétrico (Mann-Whitney / Kruskal-Wallis)</option></select></label>
      <label>Tamanho mínimo do grupo<input type="number" id="cmin" value="3" min="2" style="width:90px"></label></div>
      <div style="margin-top:10px"><div class="note" style="font-weight:600;margin-bottom:4px">Grupos incluídos</div><div id="cLv" class="row"></div></div><div class="row" style="margin-top:10px"><button class="primary" id="cGo" type="button">Comparar</button></div></div><div id="cOut"></div>`;
    const lvDraw = () => { const rows = rowsOf(st.table), g = $("#cg").value, y = $("#cy").value, min = +$("#cmin").value || 2; const gs = groupsOf(rows, y, g); $("#cLv").innerHTML = gs.map(x => `<label class="chk"><input type="checkbox" value="${esc(x.label)}"${x.values.length >= min ? " checked" : ""}> ${esc(x.label)} <span class="note">(${x.values.length})</span></label>`).join("") || "<span class='note'>Nenhum grupo com dados.</span>"; };
    ["cg", "cy", "cmin"].forEach(id => $("#" + id).addEventListener("change", lvDraw)); lvDraw();
    const go = () => {
      const rows = rowsOf(st.table), y = $("#cy").value, g = $("#cg").value, only = [...b.querySelectorAll("#cLv input:checked")].map(i => i.value);
      const groups = groupsOf(rows, y, g, only); const out = $("#cOut");
      if (groups.length < 2) { out.innerHTML = resultBox(`<p class="box aviso">Escolha ao menos dois grupos com dados.</p>`); return; }
      const r = compare(groups, $("#cm").value), yv = V(y), gv = V(g), sig = r.main.p < 0.05;
      const ds = groups.map(x => S.describe(x.values));
      let h = `<h3 class="sec" style="margin-top:0">${esc(yv.label)} por ${esc(gv.label)}</h3><div class="grade"><div class="card w12" style="border:0;padding:0"><div class="ch" id="cCh"></div></div></div>
        <div class="tw" style="margin-top:12px"><table class="t" id="tComp"><thead><tr><th>${esc(gv.label)}</th><th class="n">n</th><th class="n">Média ± DP</th><th class="n">Mediana [IIQ]</th><th class="n">Shapiro-Wilk p</th></tr></thead><tbody>${groups.map((x, i) => `<tr><td>${esc(x.label)}</td><td class="n">${ds[i].n}</td><td class="n">${f2(ds[i].mean)} ± ${f2(ds[i].sd)}</td><td class="n">${f2(ds[i].median)} [${f2(ds[i].q1)}; ${f2(ds[i].q3)}]</td><td class="n">${fp(r.normal[i].p)}</td></tr>`).join("")}</tbody></table></div>${actions("tComp")}
        <h3 class="sec">Resultado</h3><table class="t" style="max-width:720px"><tbody>
        <tr><td>Teste</td><td><b>${esc(r.main.test)}</b>${r.auto ? ` <span class="note">(escolhido automaticamente: ${r.allNormal ? "todos os grupos com distribuição compatível com a normal" : "ao menos um grupo sem normalidade ou com menos de 3 casos"})</span>` : ""}</td></tr>
        <tr><td>Estatística</td><td>${r.stat}</td></tr><tr><td>Valor de p</td><td class="${sig ? "sig" : ""}">${pTxt(r.main.p)}</td></tr>
        <tr><td>Tamanho de efeito</td><td>${r.eff.name} = ${f2(r.eff.v)} (${r.eff.txt})</td></tr>${r.extra ? `<tr><td>Estimativa</td><td>${r.extra}</td></tr>` : ""}
        <tr><td>Homogeneidade das variâncias</td><td>${r.lev ? `Levene (mediana): W = ${f2(r.lev.W)}, ${pTxt(r.lev.p)}${r.lev.p < 0.05 ? " · variâncias diferentes" + (r.param ? (r.k === 2 ? " (o t de Welch já corrige)" : " (usada a ANOVA de Welch)") : "") : ""}` : "—"}</td></tr></tbody></table>`;
      if (r.post) h += `<h3 class="sec">Comparações par a par</h3><p class="note">${r.post.name}. O p ajustado controla o erro por fazer várias comparações.</p><div class="tw"><table class="t" id="tPost" style="max-width:720px"><thead><tr><th>Grupo A</th><th>Grupo B</th><th class="n">Estatística</th><th class="n">p</th><th class="n">p ajustado</th></tr></thead><tbody>${r.post.rows.map(q => `<tr><td>${esc(q.a)}</td><td>${esc(q.b)}</td><td class="n">${f2(q.stat)}</td><td class="n">${fp(q.p)}</td><td class="n ${q.pAdj < 0.05 ? "sig" : ""}">${fp(q.pAdj)}</td></tr>`).join("")}</tbody></table></div>${actions("tPost")}`;
      const desc = groups.map((x, i) => r.param ? `${x.label}: ${f2(ds[i].mean)} ± ${f2(ds[i].sd)}` : `${x.label}: ${f2(ds[i].median)} [${f2(ds[i].q1)}; ${f2(ds[i].q3)}]`).join("; ");
      h += `<div style="margin-top:14px">${frase(`${sig ? "Houve" : "Não houve"} diferença estatisticamente significativa em ${esc(yv.label)} entre os grupos de ${esc(gv.label)} (${esc(r.main.test)}: ${r.stat}; ${pTxt(r.main.p)}; ${r.eff.name} = ${f2(r.eff.v)}, efeito ${r.eff.txt}). ${r.param ? "Média ± DP" : "Mediana [IIQ]"} — ${esc(desc)}.${r.post ? " " + (r.post.rows.filter(q => q.pAdj < 0.05).length ? "Diferenças par a par (p ajustado < 0,05): " + r.post.rows.filter(q => q.pAdj < 0.05).map(q => `${esc(q.a)} × ${esc(q.b)} (p ${fp(q.pAdj).startsWith("<") ? fp(q.pAdj) : "= " + fp(q.pAdj)})`).join("; ") + "." : "Nenhuma comparação par a par se manteve significativa após a correção.") : ""}`)}</div>`;
      if (groups.some(x => x.values.length < 5)) h += `<p class="box aviso" style="margin-top:10px">Há grupos com menos de 5 casos: o resultado é frágil. Considere juntar categorias (tela Variáveis) ou deixar esses grupos de fora.</p>`;
      out.innerHTML = resultBox(h); wireActions(out);
      { const Y = rn(y), G = rn(g), lv = groups.map(x => rs(x.label)).join(", ");
        const sub = `dd <- subset(d, ${G} %in% c(${lv}))\ndd$${G} <- factor(dd$${G}, levels = c(${lv}))\ntapply(dd$${Y}, dd$${G}, shapiro.test)   # normalidade por grupo\n`;
        const code = sub + (r.k === 2 ? (r.param ? `t.test(${Y} ~ ${G}, data = dd)   # t de Welch` : `wilcox.test(${Y} ~ ${G}, data = dd, exact = FALSE)   # Mann-Whitney`)
          : r.param ? `car::leveneTest(${Y} ~ ${G}, data = dd)   # install.packages("car")\noneway.test(${Y} ~ ${G}, data = dd, var.equal = ${r.lev && r.lev.p < 0.05 ? "FALSE" : "TRUE"})${r.post ? `\npairwise.t.test(dd$${Y}, dd$${G}, p.adjust.method = "holm", pool.sd = FALSE)` : ""}`
          : `kruskal.test(${Y} ~ ${G}, data = dd)${r.post ? `\nFSA::dunnTest(${Y} ~ ${G}, data = dd, method = "holm")   # install.packages("FSA")` : ""}`);
        const sigPairs = r.post ? r.post.rows.filter(q => q.pAdj < 0.05) : [];
        addLer(out, [
          `Teste usado: <b>${esc(r.main.test)}</b>. ${r.param ? "Os grupos têm distribuição compatível com a normal, então o teste compara as <b>médias</b>." : "Ao menos um grupo foge da normal ou tem poucos casos, então o teste compara a <b>ordem</b> dos valores (as distribuições); por isso o resumo correto é a mediana [IIQ]."}`,
          lerP(r.main.p, "diferença"),
          `<b>${r.eff.name} = ${f2(r.eff.v)}</b> — efeito ${r.eff.txt}. ${r.eff.txt === "desprezível" || r.eff.txt === "pequeno" ? (r.main.p < 0.05 ? "Mesmo sendo significativa, a diferença entre os grupos é pequena: avalie se ela importa na prática." : "A diferença observada entre os grupos é pequena, coerente com o p não significativo.") : (r.main.p < 0.05 ? "A diferença entre os grupos é de tamanho relevante." : "O efeito observado não é pequeno, mas o p não foi significativo: pode faltar amostra para confirmá-lo.")}`,
          r.extra && r.k === 2 && r.param ? `${r.extra}. Como o intervalo ${r.main.ci[0] > 0 || r.main.ci[1] < 0 ? "não inclui o zero, a diferença é significativa" : "inclui o zero, a diferença pode ser nula"}.` : null,
          r.k > 2 ? (r.post ? (sigPairs.length ? `O teste geral só diz que algum grupo difere. As comparações par a par mostram onde: ${sigPairs.map(q => `${esc(q.a)} × ${esc(q.b)}`).join("; ")}.` : "O teste geral foi significativo, mas nenhuma comparação par a par se manteve após a correção para comparações múltiplas: a diferença está espalhada ou a amostra é pequena para localizá-la.") : "Como o teste geral não foi significativo, as comparações par a par não são feitas.") : null,
          groups.some(x => x.values.length < 5) ? "Há grupos com menos de 5 casos: resultado frágil." : null,
          "Os dados são observacionais: a diferença indica associação entre grupo e desfecho, não que o grupo cause o desfecho."], rBlock(code, [y, g], GU.T.comparar.jamovi)); }
      mount($("#cCh"), () => CH.box($("#cCh"), { groups: groups.map(x => Object.assign({ key: x.label }, x)), xLabel: yv.label }));
    };
    $("#cGo").onclick = go; go();
  }
  function statAssoc(b, pre) {
    b.innerHTML = `<div class="painelf"><div class="campos"><label>Variável das linhas${varSelect("aa", { types: ["cat"], value: pre.a || "d_diag" })}</label><label>Variável das colunas${varSelect("ab", { types: ["cat"], value: pre.b || "7_Sexo" })}</label>
      <label>Porcentagem<select id="ap"><option value="row">na linha</option><option value="col">na coluna</option><option value="tot">do total</option></select></label></div><div class="row" style="margin-top:10px"><button class="primary" id="aGo" type="button">Testar associação</button></div></div><div id="aOut"></div>`;
    const go = () => {
      const a = $("#aa").value, bb = $("#ab").value, rows = rowsOf(st.table), va = V(a), vb = V(bb);
      const xt = S.crosstab(rows.map(r => r[a]), rows.map(r => r[bb])); const out = $("#aOut");
      if (xt.rows.length < 2 || xt.cols.length < 2) { out.innerHTML = resultBox("<p class='box aviso'>As duas variáveis precisam ter ao menos duas categorias com respostas.</p>"); return; }
      const R = va.levels ? va.levels.filter(l => xt.rows.includes(l)) : xt.rows, C = vb.levels ? vb.levels.filter(l => xt.cols.includes(l)) : xt.cols;
      const m = R.map(x => C.map(y => xt.m[xt.rows.indexOf(x)][xt.cols.indexOf(y)]));
      const chi = S.chisq(m); let test = chi, note = "";
      if (R.length === 2 && C.length === 2 && chi.minE < 5) { test = S.fisher2x2(m); note = "Uma ou mais frequências esperadas abaixo de 5: usado o teste exato de Fisher."; }
      else if (chi.lowEPct > 0.2) { test = S.chisqMC(m, 20000); note = `${fmt(chi.lowEPct * 100, 0)}% das caselas com frequência esperada abaixo de 5: o p foi calculado por simulação de Monte Carlo (equivalente ao exato de Fisher-Freeman-Halton).`; }
      const N = chi.N, rt = m.map(r => r.reduce((x, y) => x + y, 0)), ct = C.map((_, j) => m.reduce((s, r) => s + r[j], 0)), mode = $("#ap").value;
      const pc = (v, i, j) => fmt(100 * v / (mode === "row" ? rt[i] : mode === "col" ? ct[j] : N), 1);
      const dfStar = Math.min(R.length, C.length) - 1, cuts = [0.1, 0.3, 0.5].map(c => c / Math.sqrt(dfStar));
      let h = `<h3 class="sec" style="margin-top:0">${esc(va.label)} × ${esc(vb.label)}</h3><div class="tw"><table class="t" id="tAssoc"><thead><tr><th>${esc(va.label)}</th>${C.map(c => `<th class="n">${esc(c)}</th>`).join("")}<th class="n">Total</th></tr></thead><tbody>${R.map((r, i) => `<tr><td>${esc(r)}</td>${m[i].map((v, j) => `<td class="n">${v} (${pc(v, i, j)}%)</td>`).join("")}<td class="n">${rt[i]}</td></tr>`).join("")}<tr><td><b>Total</b></td>${ct.map(v => `<td class="n"><b>${v}</b></td>`).join("")}<td class="n"><b>${N}</b></td></tr></tbody></table></div>${actions("tAssoc")}
        <div class="card w12" style="border:0;padding:0;margin-top:12px"><div class="ch" id="aCh"></div></div>
        <h3 class="sec">Resultado</h3><table class="t" style="max-width:720px"><tbody><tr><td>Teste</td><td><b>${esc(test.test)}</b></td></tr>${test.X2 != null ? `<tr><td>Estatística</td><td>χ²(${chi.df}) = ${f2(chi.X2)}</td></tr>` : ""}<tr><td>Valor de p</td><td class="${test.p < 0.05 ? "sig" : ""}">${pTxt(test.p)}</td></tr><tr><td>V de Cramér</td><td>${f2(chi.V)} (${efLabel(chi.V, cuts)})</td></tr>${test.or != null && isFinite(test.or) ? `<tr><td>Razão de chances</td><td>${f2(test.or)}</td></tr>` : ""}</tbody></table>${note ? `<p class="box info" style="margin-top:10px">${note}</p>` : ""}
        <div style="margin-top:14px">${frase(`${test.p < 0.05 ? "Houve" : "Não houve"} associação estatisticamente significativa entre ${esc(va.label)} e ${esc(vb.label)} (${esc(test.test)}${test.X2 != null ? `: χ²(${chi.df}) = ${f2(chi.X2)}` : ""}; ${pTxt(test.p)}; V de Cramér = ${f2(chi.V)}).`)}</div>`;
      out.innerHTML = resultBox(h); wireActions(out);
      { const A = rn(a), B = rn(bb); const j0 = 0; const rp = R.map((x, i) => ({ x, p: rt[i] ? 100 * m[i][j0] / rt[i] : 0 })).sort((u, v) => v.p - u.p);
        const code = `tab <- table(d$${A}, d$${B})\ntab\nround(prop.table(tab, 1) * 100, 1)   # % na linha\n` + (test.test === "Exato de Fisher" ? "fisher.test(tab)" : /Monte Carlo/.test(test.test) ? "chisq.test(tab, simulate.p.value = TRUE, B = 20000)" : "chisq.test(tab)") + `\nchisq.test(tab)$expected   # frequências esperadas\nsqrt(chisq.test(tab, correct = FALSE)$statistic / (sum(tab) * (min(dim(tab)) - 1)))   # V de Cramér`;
        addLer(out, [`Comece pelas porcentagens: em “${esc(C[0])}”, a proporção vai de ${fmt(rp[rp.length - 1].p, 1)}% (${esc(rp[rp.length - 1].x)}) a ${fmt(rp[0].p, 1)}% (${esc(rp[0].x)}). É essa diferença entre as linhas que o teste avalia.`,
          lerP(test.p, "associação"), `<b>V de Cramér = ${f2(chi.V)}</b> — associação ${efLabel(chi.V, cuts).replace("desprezível", "desprezível").replace("pequeno", "fraca").replace("médio", "moderada").replace("grande", "forte")}.`,
          note ? `Por que este teste: ${note}` : `Por que este teste: as frequências esperadas são suficientes para o qui-quadrado.`,
          test.or != null && isFinite(test.or) ? `Razão de chances = ${f2(test.or)}: a chance de “${esc(C[0])}” no grupo “${esc(R[0])}” é ${f2(test.or)} vez(es) a do grupo “${esc(R[1])}”.` : null],
          rBlock(code, [a, bb], GU.T.associacao.jamovi)); }
      mount($("#aCh"), () => CH.stacked($("#aCh"), { cats: R, series: C.map((c, j) => ({ name: c, values: m.map(r => r[j]) })), percent: true, colors: vb.ordinal ? C.map((_, i) => CH.C.seq[Math.round(1 + i * 7 / Math.max(1, C.length - 1))]) : null }));
    };
    $("#aGo").onclick = go; go();
  }
  function statCorr(b, pre) {
    const defs = (pre.vars || ["s_bipq", "d_idade", "d_motor", ...(D.sfDomains || []).slice(0, 3)]).filter(V);
    b.innerHTML = `<div class="painelf"><div class="campos" style="grid-template-columns:2fr 1fr"><div><div class="note" style="font-weight:600;margin-bottom:5px">Variáveis numéricas (2 ou mais)</div>${varChecks("cv", { types: ["num"] }, defs)}</div>
      <div><label class="note" style="font-weight:600;display:block;margin-bottom:5px">Método</label><select id="cmth"><option value="spearman">Spearman (ρ) — não exige normalidade</option><option value="pearson">Pearson (r) — relação linear, dados normais</option></select><p class="note">Com duas variáveis aparece o gráfico de dispersão. Os p não são corrigidos para comparações múltiplas.</p><button class="primary" id="rGo" type="button">Calcular</button></div></div></div><div id="rOut"></div>`;
    const go = () => {
      const ids = checked(b, "cv"), mth = $("#cmth").value, rows = rowsOf(st.table), out = $("#rOut");
      if (ids.length < 2) { out.innerHTML = resultBox("<p class='box aviso'>Marque ao menos duas variáveis.</p>"); return; }
      const fn = mth === "pearson" ? S.pearson : S.spearman; const res = ids.map(a => ids.map(c => a === c ? { r: 1, p: 0, n: rows.filter(r => r[a] != null).length } : fn(rows.map(r => r[a]), rows.map(r => r[c]))));
      const short = ids.map(k => lbl(k).replace(/^SF-36\s+/, "").replace(/\s*\(.*?\)\s*/g, " ").trim());
      let pairs = []; ids.forEach((a, i) => ids.forEach((c, j) => { if (j > i) pairs.push({ a: lbl(a), b: lbl(c), ...res[i][j] }); }));
      let h = `<div class="card w12" style="border:0;padding:0"><div class="ch" id="rCh"></div></div><p class="note">${mth === "pearson" ? "r de Pearson" : "ρ de Spearman"} · azul = positiva, vermelho = negativa · * p < 0,05 · ** p < 0,01 · *** p < 0,001</p>
        <div class="tw"><table class="t" id="tCorr"><thead><tr><th>Variável A</th><th>Variável B</th><th class="n">n</th><th class="n">${mth === "pearson" ? "r" : "ρ"}</th>${mth === "pearson" ? '<th class="n">IC 95%</th>' : ""}<th class="n">p</th><th>Força</th></tr></thead><tbody>${pairs.map(q => `<tr><td>${esc(q.a)}</td><td>${esc(q.b)}</td><td class="n">${q.n}</td><td class="n ${q.p < 0.05 ? "sig" : ""}">${f2(q.r)}</td>${mth === "pearson" ? `<td class="n">${q.ci ? f2(q.ci[0]) + " a " + f2(q.ci[1]) : "—"}</td>` : ""}<td class="n">${fp(q.p)}</td><td>${efLabel(q.r, [0.1, 0.3, 0.5]).replace("desprezível", "desprezível").replace("pequeno", "fraca").replace("médio", "moderada").replace("grande", "forte")}</td></tr>`).join("")}</tbody></table></div>${actions("tCorr")}`;
      if (ids.length === 2) { const q = pairs[0]; h += `<div style="margin-top:14px">${frase(`${q.p < 0.05 ? "Houve" : "Não houve"} correlação estatisticamente significativa entre ${esc(q.a)} e ${esc(q.b)} (${mth === "pearson" ? "r" : "ρ"} = ${f2(q.r)}; ${pTxt(q.p)}; n = ${q.n})${q.p < 0.05 ? `, de força ${efLabel(q.r, [0.1, 0.3, 0.5]).replace("pequeno", "fraca").replace("médio", "moderada").replace("grande", "forte")} e sentido ${q.r > 0 ? "positivo" : "negativo"}` : ""}.`)}</div>`; }
      out.innerHTML = resultBox(h); wireActions(out);
      { const sig = pairs.filter(q => q.p < 0.05).sort((x, y) => Math.abs(y.r) - Math.abs(x.r)), forca = v => efLabel(v, [0.1, 0.3, 0.5]).replace("pequeno", "fraca").replace("médio", "moderada").replace("grande", "forte");
        const code = ids.length === 2 ? `cor.test(d$${rn(ids[0])}, d$${rn(ids[1])}, method = ${rs(mth)}${mth === "spearman" ? ", exact = FALSE" : ""})\nplot(d$${rn(ids[0])}, d$${rn(ids[1])})` : `vars <- c(${ids.map(k => rs(rn(k))).join(", ")})\npsych::corr.test(d[, vars], method = ${rs(mth)}, adjust = "none")   # install.packages("psych")`;
        addLer(out, [ids.length === 2 ? `<b>${mth === "pearson" ? "r" : "ρ"} = ${f2(pairs[0].r)}</b>: correlação ${forca(pairs[0].r)} e ${pairs[0].r > 0 ? "positiva (quando uma aumenta, a outra tende a aumentar)" : "negativa (quando uma aumenta, a outra tende a diminuir)"}.${mth === "pearson" ? ` r² = ${fmt(pairs[0].r * pairs[0].r * 100, 0)}%: proporção da variação de uma explicada pela relação linear com a outra.` : ""}` : `${sig.length} de ${pairs.length} pares com p < 0,05. ${sig.length ? `A correlação mais forte foi entre ${esc(sig[0].a)} e ${esc(sig[0].b)} (${f2(sig[0].r)}).` : ""} Com ${pairs.length} pares testados, cerca de ${fmt(pairs.length * 0.05, 1)} dariam p < 0,05 só por acaso: confirme os achados com hipóteses definidas antes.`,
          ids.length === 2 ? lerP(pairs[0].p, "associação") : null, "Veja o gráfico de dispersão (selecione duas variáveis): um único ponto extremo pode criar ou esconder uma correlação.", "Correlação não indica causa, e não serve para avaliar concordância entre dois instrumentos ou avaliadores."],
          rBlock(code, ids, GU.T.correlacao.jamovi)); }
      const star = p => p < 0.001 ? "***" : p < 0.01 ? "**" : p < 0.05 ? "*" : "";
      if (ids.length === 2) mount($("#rCh"), () => CH.scatter($("#rCh"), { points: rows.map(r => ({ x: r[ids[0]], y: r[ids[1]], id: r._id })).filter(q => q.x != null && q.y != null), xLabel: lbl(ids[0]), yLabel: lbl(ids[1]), fit: S.pearson(rows.map(r => r[ids[0]]), rows.map(r => r[ids[1]])) }));
      else mount($("#rCh"), () => CH.heat($("#rCh"), { rows: short, cols: short, m: res.map(r => r.map(q => q.r)), diverging: true, fmt: v => isFinite(v) ? f2(v) : "—", tipRows: (i, j) => [["coeficiente", f2(res[i][j].r) + star(res[i][j].p)], ["p", fp(res[i][j].p)], ["n", String(res[i][j].n)]] }));
    };
    $("#rGo").onclick = go; go();
  }
  function statReg(b) {
    b.innerHTML = `<div class="painelf"><div class="campos" style="grid-template-columns:1fr 2fr"><div><label class="note" style="font-weight:600;display:block;margin-bottom:5px">Desfecho (numérico)</label>${varSelect("gy", { types: ["num"], value: "s_bipq" })}<p class="note">Regressão linear múltipla por mínimos quadrados. Preditores categóricos entram como variáveis indicadoras; a primeira categoria é a referência. Só entram casos com todos os dados.</p><button class="primary" id="gGo" type="button">Ajustar modelo</button></div>
      <div><div class="note" style="font-weight:600;margin-bottom:5px">Preditores</div>${varChecks("gx", { types: ["num", "cat"] }, ["d_idade", "7_Sexo"])}</div></div></div><div id="gOut"></div>`;
    const go = () => {
      const y = $("#gy").value, xs = checked(b, "gx").filter(k => k !== y), rows = rowsOf(st.table), out = $("#gOut");
      if (!xs.length) { out.innerHTML = resultBox("<p class='box aviso'>Marque ao menos um preditor.</p>"); return; }
      const cols = [], names = [];
      xs.forEach(k => { const v = V(k); if (v.type === "num") { cols.push(r => r[k]); names.push(v.label); } else { const lv = D.levelsOf(v, rows).filter(l => rows.filter(r => r[k] === l).length >= 2); lv.slice(1).forEach(l => { cols.push(r => r[k] == null || !lv.includes(r[k]) ? null : r[k] === l ? 1 : 0); names.push(`${v.label}: ${l} (ref.: ${lv[0]})`); }); } });
      const res = S.ols(rows.map(r => r[y]), rows.map(r => cols.map(c => c(r))), names);
      if (res.error) { out.innerHTML = resultBox(`<p class="box aviso">${esc(res.error)}</p>`); return; }
      let h = `<h3 class="sec" style="margin-top:0">${esc(lbl(y))}</h3><p>n = ${res.n} casos completos · R² = ${f2(res.R2)} · R² ajustado = ${f2(res.adjR2)} · F(${res.df1}; ${res.df2}) = ${f2(res.F)}, ${pTxt(res.p)}</p>
        <div class="tw"><table class="t" id="tReg"><thead><tr><th>Preditor</th><th class="n">B</th><th class="n">EP</th><th class="n">IC 95%</th><th class="n">β padronizado</th><th class="n">t</th><th class="n">p</th></tr></thead><tbody>${res.coef.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${f2(c.b)}</td><td class="n">${f2(c.se)}</td><td class="n">${f2(c.ci[0])} a ${f2(c.ci[1])}</td><td class="n">${c.beta != null ? f2(c.beta) : ""}</td><td class="n">${f2(c.t)}</td><td class="n ${c.p < 0.05 && c.name !== "(Intercepto)" ? "sig" : ""}">${fp(c.p)}</td></tr>`).join("")}</tbody></table></div>${actions("tReg")}
        <p class="note" style="margin-top:10px">Normalidade dos resíduos (Shapiro-Wilk): ${pTxt(res.swP)}${res.swP < 0.05 ? " — os resíduos fogem da normal; com amostras pequenas, interprete os p com cautela." : "."} ${res.n < 10 * names.length ? `<b>Atenção:</b> menos de 10 casos por preditor (${res.n} casos, ${names.length} preditores); o modelo pode estar superajustado.` : ""}</p>
        <div class="card w12" style="border:0;padding:0;margin-top:6px"><h4>Resíduos × valores ajustados</h4><div class="ch" id="gCh"></div></div>
        <div style="margin-top:14px">${frase(`O modelo de regressão linear múltipla explicou ${fmt(res.R2 * 100, 1)}% da variância de ${esc(lbl(y))} (R² ajustado = ${f2(res.adjR2)}; F(${res.df1}; ${res.df2}) = ${f2(res.F)}; ${pTxt(res.p)}).${res.coef.slice(1).filter(c => c.p < 0.05).length ? " Associaram-se de forma independente: " + res.coef.slice(1).filter(c => c.p < 0.05).map(c => `${esc(c.name)} (B = ${f2(c.b)}; IC 95%: ${f2(c.ci[0])} a ${f2(c.ci[1])}; ${pTxt(c.p)})`).join("; ") + "." : " Nenhum preditor teve associação independente significativa."}`)}</div>`;
      out.innerHTML = resultBox(h); wireActions(out);
      { const cats = xs.filter(k => V(k).type !== "num"); const prep = cats.map(k => { const lv = D.levelsOf(V(k), rows); return `d$${rn(k)} <- relevel(factor(d$${rn(k)}), ref = ${rs(lv[0])})`; }).join("\n");
        const code = `${prep}${prep ? "\n" : ""}m <- lm(${rn(y)} ~ ${xs.map(rn).join(" + ")}, data = d)\nsummary(m)\nconfint(m)\nshapiro.test(residuals(m))\nplot(m, which = 1)   # resíduos × ajustados`;
        addLer(out, [`<b>R² = ${f2(res.R2)}</b>: o modelo explica ${fmt(res.R2 * 100, 1)}% da variação de ${esc(lbl(y))}; o restante depende de fatores que não estão no modelo.`,
          lerP(res.p, "associação").replace("a associação é", "o modelo como um todo é"),
          ...res.coef.slice(1).filter(c => c.p < 0.05).map(c => `<b>${esc(c.name)}</b>: ${/\(ref\.:/.test(c.name) ? `em relação à categoria de referência, ${esc(lbl(y))} é em média ${f2(Math.abs(c.b))} ${c.b > 0 ? "maior" : "menor"}` : `a cada 1 unidade a mais, ${esc(lbl(y))} ${c.b > 0 ? "aumenta" : "diminui"} em média ${f2(Math.abs(c.b))}`}, considerando os outros preditores iguais (IC 95%: ${f2(c.ci[0])} a ${f2(c.ci[1])}).`),
          res.coef.slice(1).every(c => c.p >= 0.05) ? "Nenhum preditor teve associação significativa depois de ajustado pelos demais." : null,
          `Resíduos: ${res.swP < 0.05 ? "fogem da normal; com amostras pequenas, os p ficam menos confiáveis." : "compatíveis com a normal, como o modelo pressupõe."} No gráfico de resíduos, os pontos devem formar uma nuvem sem padrão em torno do zero.`],
          rBlock(code, [y, ...xs], GU.T.regressao.jamovi)); }
      mount($("#gCh"), () => CH.scatter($("#gCh"), { points: res.fitted.map((f, i) => ({ x: f, y: res.resid[i] })), xLabel: "Valor ajustado", yLabel: "Resíduo", height: 240 }));
    };
    $("#gGo").onclick = go; go();
  }
  function statRel(b) {
    const presets = [];
    if (D.sfItems) { const s = D.sfItems; presets.push(["SF-36 · Capacidade funcional", s.q3], ["SF-36 · Limitação por aspectos físicos", s.q4], ["SF-36 · Limitação por aspectos emocionais", s.q5], ["SF-36 · Vitalidade (9a, 9e, 9g, 9i)", [s.q9[0], s.q9[4], s.q9[6], s.q9[8]]], ["SF-36 · Saúde mental (9b, 9c, 9d, 9f, 9h)", [s.q9[1], s.q9[2], s.q9[3], s.q9[5], s.q9[7]]]); }
    if (D.questItems) presets.push(["B-QUEST · Dispositivo (itens 1–8)", D.questItems.slice(0, 8)], ["B-QUEST · Serviços (itens 9–12)", D.questItems.slice(8)], ["B-QUEST · Total", D.questItems]);
    b.innerHTML = `<div class="painelf"><div class="campos" style="grid-template-columns:1fr 2fr"><div><label class="note" style="font-weight:600;display:block;margin-bottom:5px">Conjunto pronto</label><select id="lp"><option value="">— escolher itens à mão —</option>${presets.map((p, i) => `<option value="${i}">${esc(p[0])}</option>`).join("")}</select>
      <p class="note">Alfa de Cronbach para a consistência interna de um conjunto de itens que medem a mesma coisa. Itens invertidos precisam ser recodificados antes. Usa só quem respondeu todos os itens. A tabela de dispositivos (B-QUEST) é escolhida no topo, em “Analisando”.</p><button class="primary" id="lGo" type="button">Calcular</button></div>
      <div><div class="note" style="font-weight:600;margin-bottom:5px">Itens</div>${varChecks("li", { types: ["num"] }, [])}</div></div></div><div id="lOut"></div>`;
    $("#lp").onchange = () => { const p = presets[+$("#lp").value]; if (!p) return; const t = st.model.tables[tableOf(p[1][0])]; if (t.id !== st.table) { st.table = t.id; render(); return; } b.querySelectorAll('[data-name="li"] input').forEach(i => i.checked = p[1].includes(i.value)); };
    $("#lGo").onclick = () => {
      const ids = checked(b, "li"), rows = rowsOf(st.table), out = $("#lOut");
      if (ids.length < 2) { out.innerHTML = resultBox("<p class='box aviso'>Marque ao menos dois itens.</p>"); return; }
      const r = S.cronbach(ids.map(k => rows.map(x => x[k])));
      const q = a => !isFinite(a) ? "" : a >= 0.9 ? "excelente" : a >= 0.8 ? "boa" : a >= 0.7 ? "aceitável" : a >= 0.6 ? "questionável" : "baixa";
      out.innerHTML = resultBox(`<p style="font-size:15px">α de Cronbach = <b>${f2(r.alpha)}</b> (${q(r.alpha)}) · ${r.k} itens · ${r.n} respondentes completos</p>
        <div class="tw"><table class="t" id="tRel" style="max-width:760px"><thead><tr><th>Item</th><th class="n">Correlação item-total corrigida</th><th class="n">α se o item for retirado</th></tr></thead><tbody>${ids.map((k, i) => `<tr><td>${esc(lbl(k))}</td><td class="n">${f2(r.itemTotal[i])}</td><td class="n ${r.ifDeleted[i] > r.alpha + 0.01 ? "sig" : ""}">${f2(r.ifDeleted[i])}</td></tr>`).join("")}</tbody></table></div>${actions("tRel")}
        ${r.n < 30 ? `<p class="box aviso" style="margin-top:10px">Menos de 30 respondentes completos: o alfa é instável.</p>` : ""}<div style="margin-top:14px">${frase(`A consistência interna do conjunto (${r.k} itens) foi ${q(r.alpha)} (α de Cronbach = ${f2(r.alpha)}; n = ${r.n}).`)}</div>`);
      wireActions(out);
      { const bad = ids.filter((k, i) => r.itemTotal[i] < 0.3 || r.ifDeleted[i] > r.alpha + 0.01);
        addLer(out, [`<b>α = ${f2(r.alpha)}</b> (${q(r.alpha)}): ${r.alpha >= 0.7 ? "os itens medem, de forma consistente, a mesma coisa nesta amostra." : "os itens não formam um conjunto consistente nesta amostra; o escore somado deve ser usado com cautela."}`,
          bad.length ? `Itens que destoam (correlação item-total < 0,3 ou α que sobe sem eles): ${bad.map(k => esc(lbl(k))).join("; ")}.` : "Nenhum item destoa do conjunto.",
          `Calculado com os ${r.n} participantes que responderam todos os itens.`],
          rBlock(`vars <- c(${ids.map(k => rs(rn(k))).join(", ")})\npsych::alpha(d[, vars])   # install.packages("psych")`, ids, GU.T.confiabilidade.jamovi)); }
    };
  }

  // ---------------- regressão logística
  function statLog(b) {
    b.innerHTML = `<div class="painelf"><div class="campos" style="grid-template-columns:1fr 2fr"><div><label class="note" style="font-weight:600;display:block;margin-bottom:5px">Desfecho (categoria)</label>${varSelect("ly", { types: ["cat"], value: "78_Faz_uso_de_rtese" })}
      <label class="note" style="font-weight:600;display:block;margin:10px 0 5px">Evento (o que conta como “1”)</label><select id="lev"></select>
      <p class="note">Estima a chance do evento conforme os preditores, em razões de chances (RC) com IC 95%. Preditores categóricos entram com a primeira categoria como referência. Só entram casos com todos os dados.</p><button class="primary" id="lgGo" type="button">Ajustar modelo</button></div>
      <div><div class="note" style="font-weight:600;margin-bottom:5px">Preditores</div>${varChecks("lx", { types: ["num", "cat"] }, ["d_idade", "d_diag"])}</div></div></div><div id="lgOut"></div>`;
    const fillEv = () => { const v = V($("#ly").value), rows = rowsOf(st.table); const lv = D.levelsOf(v, rows); $("#lev").innerHTML = lv.map(l => `<option>${esc(l)}</option>`).join(""); };
    $("#ly").onchange = fillEv; fillEv();
    const go = () => {
      const y = $("#ly").value, ev = $("#lev").value, xs = checked(b, "lx").filter(k => k !== y), rows = rowsOf(st.table), out = $("#lgOut");
      if (!xs.length) { out.innerHTML = resultBox("<p class='box aviso'>Marque ao menos um preditor.</p>"); wireActions(out); return; }
      const cols = [], names = [];
      xs.forEach(k => { const v = V(k); if (v.type === "num") { cols.push(r => r[k]); names.push(v.label); } else { const lv = D.levelsOf(v, rows).filter(l => rows.filter(r => r[k] === l).length >= 2); lv.slice(1).forEach(l => { cols.push(r => r[k] == null || !lv.includes(r[k]) ? null : r[k] === l ? 1 : 0); names.push(`${v.label}: ${l} (ref.: ${lv[0]})`); }); } });
      const res = S.logistic(rows.map(r => r[y] == null ? null : r[y] === ev ? 1 : 0), rows.map(r => cols.map(c => c(r))), names);
      if (res.error) { out.innerHTML = resultBox(`<p class="box aviso">${esc(res.error)}</p>`); wireActions(out); return; }
      const epv = Math.min(res.events, res.n - res.events) / names.length;
      let h = `<h3 class="sec" style="margin-top:0">Chance de ${esc(lbl(y))} = ${esc(ev)}</h3><p>n = ${res.n} casos completos · ${res.events} eventos · razão de verossimilhança χ²(${res.df}) = ${f2(res.LR)}, ${pTxt(res.p)} · R² de Nagelkerke = ${f2(res.nagelkerke)} · ${fmt(res.accuracy * 100, 1)}% classificados corretamente</p>
        <div class="tw"><table class="t" id="tLog"><thead><tr><th>Preditor</th><th class="n">B</th><th class="n">EP</th><th class="n">RC</th><th class="n">IC 95% da RC</th><th class="n">p</th></tr></thead><tbody>${res.coef.map(c => `<tr><td>${esc(c.name)}</td><td class="n">${f2(c.b)}</td><td class="n">${f2(c.se)}</td><td class="n">${c.name === "(Intercepto)" ? "" : f2(c.or)}</td><td class="n">${c.name === "(Intercepto)" ? "" : f2(c.ci[0]) + " a " + f2(c.ci[1])}</td><td class="n ${c.p < 0.05 && c.name !== "(Intercepto)" ? "sig" : ""}">${fp(c.p)}</td></tr>`).join("")}</tbody></table></div>${actions("tLog")}
        <div class="card w12" style="border:0;padding:0;margin-top:10px"><h4>Razões de chances</h4><div class="ch" id="lgCh"></div></div>
        ${epv < 10 ? `<p class="box aviso" style="margin-top:10px">Só ${fmt(epv, 1)} eventos por preditor (o recomendado é ao menos 10): o modelo pode estar superajustado. Use menos preditores ou junte categorias.</p>` : ""}${res.separation || !res.converged ? `<p class="box aviso" style="margin-top:10px">Algum preditor separa quase perfeitamente os grupos (erros-padrão enormes). Junte categorias raras ou retire esse preditor.</p>` : ""}
        <div style="margin-top:14px">${frase(`No modelo de regressão logística (n = ${res.n}; ${res.events} eventos; χ²(${res.df}) = ${f2(res.LR)}; ${pTxt(res.p)}; R² de Nagelkerke = ${f2(res.nagelkerke)}), ${res.coef.slice(1).filter(c => c.p < 0.05).length ? "associaram-se à chance de " + esc(lbl(y).toLowerCase()) + " (" + esc(ev) + "): " + res.coef.slice(1).filter(c => c.p < 0.05).map(c => `${esc(c.name)} (RC = ${f2(c.or)}; IC 95%: ${f2(c.ci[0])} a ${f2(c.ci[1])}; ${pTxt(c.p)})`).join("; ") : "nenhum preditor se associou de forma significativa à chance de " + esc(lbl(y).toLowerCase()) + " (" + esc(ev) + ")"}.`)}</div>`;
      out.innerHTML = resultBox(h, "Regressão logística: " + lbl(y)); wireActions(out);
      { const cats = xs.filter(k => V(k).type !== "num"); const prep = cats.map(k => { const lv = D.levelsOf(V(k), rows); return `d$${rn(k)} <- relevel(factor(d$${rn(k)}), ref = ${rs(lv[0])})`; }).join("\n");
        const code = `d$evento <- as.integer(d$${rn(y)} == ${rs(ev)})\n${prep}${prep ? "\n" : ""}m <- glm(evento ~ ${xs.map(rn).join(" + ")}, family = binomial, data = d)\nsummary(m)\nround(exp(cbind(RC = coef(m), confint.default(m))), 2)   # razões de chances e IC 95%`;
        addLer(out, [lerP(res.p, "associação").replace("a associação é", "o modelo como um todo é"),
          ...res.coef.slice(1).filter(c => c.p < 0.05).map(c => `<b>${esc(c.name)}</b>: RC = ${f2(c.or)} — ${c.or >= 1 ? `chance de “${esc(ev)}” ${f2(c.or)} vez(es) ${/\(ref\.:/.test(c.name) ? "a da referência" : "maior a cada unidade a mais"}` : `chance ${fmt((1 - c.or) * 100, 0)}% menor ${/\(ref\.:/.test(c.name) ? "que na categoria de referência" : "a cada unidade a mais"}`}, considerando os outros preditores iguais.`),
          res.coef.slice(1).some(c => c.hi / c.lo > 20 || (c.ci && c.ci[1] / c.ci[0] > 20)) ? "Intervalos de confiança muito largos indicam poucos casos naquela categoria: a estimativa é imprecisa." : null,
          "A razão de chances não é o mesmo que risco: quando o evento é comum (como aqui), a RC parece maior do que a diferença real de probabilidade.",
          `R² de Nagelkerke = ${f2(res.nagelkerke)}: medida aproximada de quanto o modelo explica; não compare diretamente com o R² da regressão linear.`],
          rBlock(code, [y, ...xs], GU.T.logistica.jamovi)); }
      mount($("#lgCh"), () => CH.forest($("#lgCh"), { items: res.coef.slice(1).map(c => ({ label: c.name, or: c.or, lo: c.ci[0], hi: c.ci[1], p: c.p, pTxt: fp(c.p) })) }));
    };
    $("#lgGo").onclick = go;
  }

  // ---------------- antes e depois (reavaliações)
  function statPair(b) {
    const all = baseRows("part", { allMoments: true }).filter(r => passes(r, "part")); const by = {};
    all.forEach(r => (by[r.d_pessoa] = by[r.d_pessoa] || []).push(r)); const people = Object.values(by).filter(l => l.length > 1);
    b.innerHTML = `<div class="painelf"><div class="campos"><label>Desfecho numérico${varSelect("py", { types: ["num"], value: "s_bipq", table: "part" })}</label><label>Comparar<select id="pm"><option value="last">1ª avaliação × última</option><option value="2">1ª × 2ª avaliação</option></select></label>
      <label>Teste<select id="pt"><option value="auto">Automático (normalidade das diferenças)</option><option value="param">t pareado</option><option value="nonparam">Wilcoxon (postos sinalizados)</option></select></label></div>
      <p class="note" style="margin-top:8px">Reavaliações são reconhecidas quando a mesma pessoa (mesmo nome e data de nascimento) tem uma nova ficha de anamnese com ao menos 30 dias de intervalo. Hoje há <b>${people.length}</b> ${people.length === 1 ? "pessoa reavaliada" : "pessoas reavaliadas"}.</p><button class="primary" id="pGo" type="button"${people.length ? "" : " disabled"}>Comparar</button></div><div id="pOut"></div>`;
    if (!people.length) { $("#pOut").innerHTML = `<div class="painelf"><p class="box info">Ainda não há reavaliações na base. Quando o laboratório avaliar de novo um participante (por exemplo, depois de receber a órtese), registre uma <b>nova ficha de anamnese</b> e, se for o caso, novos B-IPQ, SF-36 e B-QUEST ligados a ela, com o mesmo nome e data de nascimento. A comparação aparece aqui automaticamente. As análises das outras telas usam só a 1ª avaliação de cada pessoa (regra ajustável na tela Dados).</p></div>`; return; }
    const go = () => {
      const y = $("#py").value, mode = $("#pm").value, out = $("#pOut");
      const pairs = people.map(l => { l = l.slice().sort((x, z) => x._mom - z._mom); const b2 = mode === "2" ? l[1] : l[l.length - 1]; return { id: l[0].d_pessoa, a: l[0][y], b: b2[y], dias: b2.d_dias_1a }; }).filter(p => p.a != null && p.b != null);
      if (pairs.length < 3) { out.innerHTML = resultBox(`<p class="box aviso">Só ${pairs.length} par(es) com ${esc(lbl(y))} nas duas avaliações: são necessários ao menos 3.</p>`); wireActions(out); return; }
      const A = pairs.map(p => p.a), B = pairs.map(p => p.b), dif = pairs.map(p => p.b - p.a), sw = S.shapiro(dif);
      const param = $("#pt").value === "param" || ($("#pt").value === "auto" && sw.p >= 0.05);
      const r = param ? S.pairedT(A, B) : S.wilcoxon(A, B), da = S.describe(A), db = S.describe(B), dd = S.describe(dif), dias = S.describe(pairs.map(p => p.dias));
      const stat = param ? `t(${r.df}) = ${f2(r.t)}` : `W = ${fmt(r.W, 1)}; z = ${f2(r.z)}`, eff = param ? `d<sub>z</sub> = ${f2(r.dz)} (${efLabel(r.dz, [0.2, 0.5, 0.8])})` : `r = ${f2(r.r)} (${efLabel(r.r, [0.1, 0.3, 0.5])})`;
      const lb = mode === "2" ? "2ª avaliação" : "Última avaliação";
      const h = `<h3 class="sec" style="margin-top:0">${esc(lbl(y))}: 1ª avaliação × ${lb.toLowerCase()}</h3><div class="card w12" style="border:0;padding:0"><div class="ch" id="pCh"></div></div>
        <div class="tw"><table class="t" id="tPar" style="max-width:760px"><thead><tr><th></th><th class="n">n</th><th class="n">Média ± DP</th><th class="n">Mediana [IIQ]</th></tr></thead><tbody>${[["1ª avaliação", da], [lb, db], ["Diferença (depois − antes)", dd]].map(([k, d]) => `<tr><td>${k}</td><td class="n">${d.n}</td><td class="n">${f2(d.mean)} ± ${f2(d.sd)}</td><td class="n">${f2(d.median)} [${f2(d.q1)}; ${f2(d.q3)}]</td></tr>`).join("")}</tbody></table></div>${actions("tPar")}
        <table class="t" style="max-width:760px;margin-top:12px"><tbody><tr><td>Teste</td><td><b>${r.test}</b> <span class="note">(Shapiro-Wilk das diferenças: ${pTxt(sw.p)})</span></td></tr><tr><td>Estatística</td><td>${stat}</td></tr><tr><td>Valor de p</td><td class="${r.p < 0.05 ? "sig" : ""}">${pTxt(r.p)}</td></tr><tr><td>Tamanho de efeito</td><td>${eff}</td></tr>${param ? `<tr><td>Diferença média</td><td>${f2(r.diff)} (IC 95%: ${f2(r.ci[0])} a ${f2(r.ci[1])})</td></tr>` : ""}<tr><td>Intervalo entre avaliações</td><td>mediana de ${fmt(dias.median, 0)} dias (${fmt(dias.min, 0)} a ${fmt(dias.max, 0)})</td></tr></tbody></table>
        <div style="margin-top:14px">${frase(`Entre a 1ª e a ${lb.toLowerCase()} (intervalo mediano de ${fmt(dias.median, 0)} dias; n = ${pairs.length}), ${r.p < 0.05 ? `houve ${dd.mean > 0 ? "aumento" : "redução"} estatisticamente significativa` : "não houve mudança estatisticamente significativa"} em ${esc(lbl(y))} (${param ? `de ${f2(da.mean)} ± ${f2(da.sd)} para ${f2(db.mean)} ± ${f2(db.sd)}` : `de ${f2(da.median)} [${f2(da.q1)}; ${f2(da.q3)}] para ${f2(db.median)} [${f2(db.q1)}; ${f2(db.q3)}]`}; ${r.test}: ${stat}; ${pTxt(r.p)}).`)}</div>`;
      out.innerHTML = resultBox(h); wireActions(out);
      { const Y = rn(y), m2 = mode === "2" ? "2ª avaliação" : "última";
        const code = `# Exporte com a regra "só a 1ª avaliação" DESLIGADA (tela Dados) e marque "Incluir respostas em texto livre".\na <- subset(d, d_momento == "1ª avaliação")[, c("d_pessoa", ${rs(Y)})]\nb <- subset(d, d_momento == ${rs(mode === "2" ? "2ª avaliação" : "2ª avaliação")})[, c("d_pessoa", ${rs(Y)})]   # ajuste para a última avaliação, se houver mais de duas\nw <- merge(a, b, by = "d_pessoa", suffixes = c(".antes", ".depois"))\nshapiro.test(w$${Y}.depois - w$${Y}.antes)\n${param ? `t.test(w$${Y}.depois, w$${Y}.antes, paired = TRUE)` : `wilcox.test(w$${Y}.depois, w$${Y}.antes, paired = TRUE, exact = FALSE)`}`;
        addLer(out, [`Cada pessoa é comparada com ela mesma: o teste olha a <b>diferença</b> (depois − antes) de cada uma. Média da diferença: ${f2(dd.mean)} (mediana ${f2(dd.median)}).`, lerP(r.p, "diferença"),
          `Tamanho de efeito: ${eff}.`, `No gráfico, cada linha é uma pessoa: azul = subiu, vermelho = desceu; a linha escura é a média.`,
          "Sem um grupo de comparação, a mudança não pode ser atribuída só à intervenção: o tempo, o crescimento e outros tratamentos também influenciam."], rBlock(code, [y], GU.T.pareado.jamovi)); }
      mount($("#pCh"), () => CH.paired($("#pCh"), { pairs, la: "1ª avaliação", lb, yLabel: lbl(y) }));
    };
    $("#pGo").onclick = go; go();
  }

  // ---------------- SF-36 × normas brasileiras
  const NORMAS = { fonte: "Cruz LN, Fleck MPA, Oliveira MR, Camey SA, Hoffmann JF, Bagattini AM, Polanczyk CA. Qualidade de vida relacionada à saúde no Brasil: dados normativos para o SF-36 em uma amostra da população geral do sul do Brasil. Ciênc Saúde Coletiva. 2013;18(7):1911-21",
    nota: "Porto Alegre (RS), adultos de 20 a 64 anos, n = 755, SF-36 versão 1, escores de 0 a 100.",
    grupos: { total: ["População geral", { s_sf_cf: [82.45, 20.51], s_sf_laf: [74.73, 35.33], s_sf_dor: [67.53, 23.75], s_sf_egs: [71.10, 19.52], s_sf_vit: [66.85, 20.39], s_sf_as: [78.30, 23.88], s_sf_lae: [70.02, 38.12], s_sf_sm: [73.82, 19.79] }],
      mulheres: ["Mulheres", { s_sf_cf: [79.4, 21.8], s_sf_laf: [71.7, 37.3], s_sf_dor: [63.6, 24.2], s_sf_egs: [69.4, 20.0], s_sf_vit: [63.3, 21.5], s_sf_as: [75.0, 25.5], s_sf_lae: [66.8, 39.5], s_sf_sm: [71.5, 21.0] }],
      homens: ["Homens", { s_sf_cf: [87.1, 17.2], s_sf_laf: [79.5, 31.4], s_sf_dor: [73.8, 21.6], s_sf_egs: [73.7, 18.4], s_sf_vit: [72.4, 16.9], s_sf_as: [83.6, 19.7], s_sf_lae: [75.0, 35.2], s_sf_sm: [77.5, 17.0] }] } };
  function statNorm(b) {
    if (!D.sfDomains || !V("s_sf_cf")) { b.innerHTML = "<div class='painelf'><p class='box aviso'>A base não tem os domínios do SF-36.</p></div>"; return; }
    b.innerHTML = `<div class="painelf"><div class="campos"><label>Referência<select id="nr">${Object.entries(NORMAS.grupos).map(([k, g]) => `<option value="${k}"${k === "mulheres" ? " selected" : ""}>${g[0]}</option>`).join("")}</select></label>
      <label>Teste<select id="nt"><option value="auto">Automático (Shapiro-Wilk)</option><option value="param">t para uma amostra</option><option value="nonparam">Wilcoxon para uma amostra</option></select></label></div>
      <p class="note" style="margin-top:8px">Compara a média da amostra com a média normativa de cada domínio. Referência: ${esc(NORMAS.nota)} Como o SF-36 aqui é respondido pelos responsáveis, em geral mães, a referência sugerida é “Mulheres”. Escore z = (escore − média normativa) ÷ DP normativo: 0 = igual à população, −1 = um desvio padrão abaixo.</p><button class="primary" id="nGo" type="button">Comparar</button></div><div id="nOut"></div>`;
    const go = () => {
      const g = NORMAS.grupos[$("#nr").value], rows = rowsOf("part"), mt = $("#nt").value;
      const res = D.sfDomains.map(k => { const vals = rows.map(r => r[k]).filter(x => x != null), [mu, sd] = g[1][k], d = S.describe(vals); const param = mt === "param" || (mt === "auto" && d.swP >= 0.05);
        const t = param ? S.oneSampleT(vals, mu) : S.oneSampleWilcoxon(vals, mu); const z = vals.map(x => (x - mu) / sd);
        return { k, label: lbl(k).replace(/^SF-36\s+/, ""), d, mu, sd, t, param, zm: S.mean(z), below: 100 * vals.filter(x => x < mu).length / vals.length }; });
      const h = `<h3 class="sec" style="margin-top:0">SF-36 da amostra × normas brasileiras (${esc(g[0].toLowerCase())})</h3><div class="card w12" style="border:0;padding:0"><div class="ch" id="nCh"></div><p class="note">● média da amostra com IC 95% · <span style="color:${CH.C.cat[1]};font-weight:700">|</span> média normativa</p></div>
        <div class="tw"><table class="t" id="tNorm"><thead><tr><th>Domínio</th><th class="n">n</th><th class="n">Amostra, média ± DP</th><th class="n">Norma, média ± DP</th><th class="n">Diferença</th><th class="n">Escore z médio</th><th class="n">% abaixo da norma</th><th>Teste</th><th class="n">p</th></tr></thead><tbody>${res.map(r => `<tr><td>${esc(r.label)}</td><td class="n">${r.d.n}</td><td class="n">${f2(r.d.mean)} ± ${f2(r.d.sd)}</td><td class="n">${f2(r.mu)} ± ${f2(r.sd)}</td><td class="n">${f2(r.d.mean - r.mu)}</td><td class="n">${f2(r.zm)}</td><td class="n">${fmt(r.below, 1)}</td><td class="note">${r.param ? "t" : "Wilcoxon"}</td><td class="n ${r.t.p < 0.05 ? "sig" : ""}">${fp(r.t.p)}</td></tr>`).join("")}</tbody></table></div>${actions("tNorm")}
        <p class="note" style="margin-top:8px">Fonte das normas: ${esc(NORMAS.fonte)}. Confira os valores na Tabela 2 (total) e na Tabela 3 (por sexo) do artigo antes de publicar.</p>
        <div style="margin-top:14px">${frase(`Em comparação com os valores normativos brasileiros (${esc(g[0].toLowerCase())}; Cruz et al., 2013), os responsáveis apresentaram escores ${res.filter(r => r.t.p < 0.05 && r.d.mean < r.mu).length ? "significativamente menores em " + res.filter(r => r.t.p < 0.05 && r.d.mean < r.mu).map(r => `${esc(r.label.toLowerCase())} (${f2(r.d.mean)} × ${f2(r.mu)}; ${pTxt(r.t.p)})`).join(", ") : "sem diferença significativa para menos em nenhum domínio"}${res.filter(r => r.t.p < 0.05 && r.d.mean > r.mu).length ? " e maiores em " + res.filter(r => r.t.p < 0.05 && r.d.mean > r.mu).map(r => `${esc(r.label.toLowerCase())} (${f2(r.d.mean)} × ${f2(r.mu)}; ${pTxt(r.t.p)})`).join(", ") : ""}.`)}</div>`;
      $("#nOut").innerHTML = resultBox(h); wireActions($("#nOut"));
      { const worst = res.slice().sort((x, y) => x.zm - y.zm)[0];
        const code = `normas <- c(${res.map(r => `${rn(r.k)} = ${r.mu}`).join(", ")})\nsapply(names(normas), function(k) c(media = mean(d[[k]], na.rm = TRUE),\n  p_t = t.test(d[[k]], mu = normas[k])$p.value,\n  p_wilcoxon = wilcox.test(d[[k]], mu = normas[k], exact = FALSE)$p.value))`;
        addLer($("#nOut"), [`Diferença negativa = responsáveis com qualidade de vida <b>pior</b> que a população de referência naquele domínio.`,
          `O domínio mais afetado foi <b>${esc(worst.label.toLowerCase())}</b>: escore z médio de ${f2(worst.zm)}, ou seja, ${fmt(Math.abs(worst.zm), 1)} desvio(s) padrão ${worst.zm < 0 ? "abaixo" : "acima"} da média normativa (${Math.abs(worst.zm) >= 0.8 ? "diferença grande" : Math.abs(worst.zm) >= 0.5 ? "diferença moderada" : Math.abs(worst.zm) >= 0.2 ? "diferença pequena" : "diferença desprezível"}).`,
          `“% abaixo da norma”: se a amostra fosse igual à população, seria perto de 50%.`,
          `Cada domínio usa o teste indicado na coluna “Teste” (t quando o domínio é compatível com a normal; Wilcoxon quando não). São 8 testes: um p perto de 0,05 merece cautela.`,
          `A referência é de adultos de 20 a 64 anos de Porto Alegre (SF-36 versão 1). Diferenças regionais e de perfil podem explicar parte da diferença.`], rBlock(code, D.sfDomains, GU.T.normas.jamovi)); }
      mount($("#nCh"), () => CH.means($("#nCh"), { domain: [0, 100], items: res.map(r => ({ label: r.label, mean: r.d.mean, lo: r.d.ci ? r.d.ci[0] : NaN, hi: r.d.ci ? r.d.ci[1] : NaN, n: r.d.n, ref: r.mu, extra: [["Norma", f2(r.mu)]] })) }));
    };
    $("#nGo").onclick = go; go();
  }

  // ---------------- dados ausentes
  function statMiss(b) {
    const def = ["7_Sexo", "d_idade", "d_diag", "d_peso", "d_ig", "d_pn", "43_Escolaridade", "44_Renda_Familiar_me", "d_municipio", "s_bipq", "s_sf_cf", "s_sf_sm"].filter(k => V(k) && st.model.tables[st.table].vars.includes(k));
    b.innerHTML = `<div class="painelf"><div class="campos" style="grid-template-columns:2fr 1fr"><div><div class="note" style="font-weight:600;margin-bottom:5px">Variáveis a examinar</div>${varChecks("mv", { types: ["num", "cat"], noVirtual: true }, def)}</div>
      <div><p class="note">Mostra quanto falta em cada variável e em cada participante, quantos casos estão completos e os padrões mais comuns de falta. Também compara quem respondeu e quem não respondeu uma variável: se forem diferentes, a análise só com quem respondeu pode ter viés.</p><button class="primary" id="mGo" type="button">Analisar</button></div></div></div><div id="msOut"></div>`;
    const go = () => {
      const ids = checked(b, "mv"), rows = rowsOf(st.table), n = rows.length, out = $("#msOut");
      if (!ids.length) { out.innerHTML = resultBox("<p class='box aviso'>Marque ao menos uma variável.</p>"); wireActions(out); return; }
      const miss = ids.map(k => ({ k, n: rows.filter(r => r[k] == null).length })).sort((x, y) => y.n - x.n);
      const per = rows.map(r => ids.filter(k => r[k] == null).length), comp = per.filter(x => x === 0).length;
      const pat = {}; rows.forEach(r => { const key = ids.map(k => r[k] == null ? "·" : "✓").join(""); pat[key] = (pat[key] || 0) + 1; });
      const pats = Object.entries(pat).sort((x, y) => y[1] - x[1]).slice(0, 10);
      const h = `<h3 class="sec" style="margin-top:0">Dados ausentes</h3><p><b>${comp}</b> de ${n} ${esc(st.model.tables[st.table].unidade)} (${fmt(100 * comp / Math.max(1, n), 1)}%) têm todas as ${ids.length} variáveis respondidas. Mediana de ${fmt(S.median(per), 0)} variável(is) faltando por participante.</p>
        <div class="grade"><div class="card w6" style="border:0;padding:0"><h4>% sem resposta por variável</h4><div class="ch" id="msCh1"></div></div><div class="card w6" style="border:0;padding:0"><h4>Nº de variáveis faltando por participante</h4><div class="ch" id="msCh2"></div></div></div>
        <h3 class="sec">Padrões mais comuns</h3><p class="note">✓ = respondido · “·” = sem resposta. Colunas na ordem: ${ids.map((k, i) => `${i + 1}. ${esc(lbl(k))}`).join("; ")}.</p>
        <div class="tw"><table class="t" id="tPat" style="max-width:640px"><thead><tr><th>Padrão</th><th class="n">n</th><th class="n">%</th></tr></thead><tbody>${pats.map(([k, c]) => `<tr><td style="font-family:ui-monospace,monospace;letter-spacing:3px">${k}</td><td class="n">${c}</td><td class="n">${fmt(100 * c / n, 1)}</td></tr>`).join("")}</tbody></table></div>${actions("tPat")}
        <h3 class="sec">Quem respondeu é diferente de quem não respondeu?</h3><div class="row"><label class="note" style="font-weight:600">Ausência em${varSelect("mY", { types: ["num", "cat"], value: miss[0].k, noVirtual: true })}</label><span class="note">comparada pelas características marcadas acima</span></div><div id="mCmp" style="margin-top:10px"></div>`;
      out.innerHTML = resultBox(h, "Dados ausentes"); wireActions(out);
      addLer(out, [`<b>${fmt(100 * comp / Math.max(1, n), 0)}%</b> dos participantes têm todas as variáveis marcadas: é o n de uma análise que use todas juntas (como uma regressão).`,
        `A variável com mais falta é <b>${esc(lbl(miss[0].k))}</b> (${fmt(100 * miss[0].n / Math.max(1, n), 0)}% sem resposta). ${miss[0].n / n > 0.2 ? "Acima de 20%, analisar só quem respondeu pode distorcer o resultado: relate como limitação." : ""}`,
        "Na comparação abaixo, p < 0,05 indica que quem não respondeu é diferente de quem respondeu naquela característica: os dados provavelmente não faltam ao acaso.",
        "Antes de imputar valores, tente recuperar a informação na ficha original ou com a família."],
        rBlock(`vars <- c(${ids.map(k => rs(rn(k))).join(", ")})\nsort(colSums(is.na(d[, vars])), decreasing = TRUE)   # ausentes por variável\nmean(complete.cases(d[, vars])) * 100   # % de casos completos\ntable(rowSums(is.na(d[, vars])))   # nº de ausentes por participante`, ids, GU.T.ausentes.jamovi));
      mount($("#msCh1"), () => CH.bar($("#msCh1"), { cats: miss.map(m => ({ label: lbl(m.k), value: +(100 * m.n / Math.max(1, n)).toFixed(1), base: 100, extra: [["Sem resposta", String(m.n)]] })), max: 100, pct: false, barH: 16 }));
      const cnt = {}; per.forEach(x => cnt[x] = (cnt[x] || 0) + 1);
      mount($("#msCh2"), () => CH.bar($("#msCh2"), { horizontal: false, cats: Object.keys(cnt).map(Number).sort((x, y) => x - y).map(k => ({ label: String(k), value: cnt[k], base: n })), height: 200 }));
      const cmp = () => { const y = $("#mY").value, others = ids.filter(k => k !== y); const lv = ["Respondeu", "Não respondeu"];
        const r = t1Build({ rows, ids: others, gOf: q => q[y] == null ? "Não respondeu" : "Respondeu", levels: lv, nm: "auto", tot: false, tid: "tMissCmp" });
        $("#mCmp").innerHTML = `<div class="tw">${r.h}</div><p class="note">${r.nt ? "Testes: " + r.nt + "." : ""} Diferenças significativas indicam que os dados de “${esc(lbl(y))}” provavelmente não faltam ao acaso.</p>${actions("tMissCmp")}`; wireActions($("#mCmp")); };
      $("#mY").onchange = cmp; cmp();
    };
    $("#mGo").onclick = go; go();
  }

  // ---------------- figura para publicação
  function figDialog(chEl, title) {
    const f = Object.assign({ n: 1, w: "17", dpi: "300", font: "Arial", gray: false, cap: false, lang: "pt" }, st.cfg.fig || {});
    dialog(`<h3>Exportar figura</h3><p class="note">Configurações no padrão das revistas. A legenda costuma ir no texto do artigo, não na imagem; marque “legenda na imagem” só se a revista pedir.</p>
      <div class="campos" style="margin-top:10px;grid-template-columns:1fr 1fr"><label>Figura nº<input type="number" id="fgN" min="1" value="${f.n}"></label><label>Largura<select id="fgW"><option value="8.5">1 coluna (8,5 cm)</option><option value="12">1,5 coluna (12 cm)</option><option value="17">2 colunas (17 cm)</option><option value="screen">Tamanho da tela</option></select></label>
      <label>Resolução<select id="fgD"><option value="300">300 dpi (padrão)</option><option value="600">600 dpi (gráficos com texto fino)</option><option value="150">150 dpi (apresentação)</option></select></label><label>Fonte<select id="fgF"><option>Arial</option><option>Times New Roman</option><option>Helvetica</option><option value="'Instrument Sans', sans-serif">Instrument Sans (tela)</option></select></label></div>
      <label class="note" style="display:block;font-weight:600;margin:10px 0 4px">Legenda</label><textarea id="fgC" rows="3" style="width:100%">${esc(title || "")}</textarea>
      <div class="row" style="margin-top:8px"><label class="chk"><input type="checkbox" id="fgG"${f.gray ? " checked" : ""}> Tons de cinza (impressão)</label><label class="chk"><input type="checkbox" id="fgL"${f.cap ? " checked" : ""}> Legenda na imagem</label><label class="chk"><input type="checkbox" id="fgE"${f.lang === "en" ? " checked" : ""}> Numerar como “Figure” (inglês)</label></div>
      <p class="note" id="fgInfo"></p>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button type="button" data-close>Cancelar</button><button type="button" id="fgCopy">Copiar legenda</button><button type="button" id="fgSvg">SVG (editável)</button><button class="primary" type="button" id="fgPng">PNG</button></div>`, el => {
      el.querySelector("#fgW").value = f.w; el.querySelector("#fgD").value = f.dpi; el.querySelector("#fgF").value = f.font;
      const read = () => { const o = { n: +el.querySelector("#fgN").value || 1, w: el.querySelector("#fgW").value, dpi: el.querySelector("#fgD").value, font: el.querySelector("#fgF").value, gray: el.querySelector("#fgG").checked, cap: el.querySelector("#fgL").checked, lang: el.querySelector("#fgE").checked ? "en" : "pt" }; st.cfg.fig = o; saveCfg(); return o; };
      const capTxt = o => `${o.lang === "en" ? "Figure" : "Figura"} ${o.n}. ${el.querySelector("#fgC").value.trim()}`;
      const info = () => { const o = read(); el.querySelector("#fgInfo").textContent = o.w === "screen" ? "" : `Saída: ${Math.round(+o.w / 2.54 * +o.dpi)} pixels de largura (${String(o.w).replace(".", ",")} cm a ${o.dpi} dpi).`; };
      el.querySelectorAll("select,input").forEach(i => i.addEventListener("change", info)); info();
      const fname = o => `figura-${o.n}-${(title || "grafico").normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40)}`;
      el.querySelector("#fgPng").onclick = async () => { const o = read(); try { const blob = await CH.png(chEl, { widthPx: o.w === "screen" ? null : +o.w / 2.54 * +o.dpi, scale: 3, font: o.font, gray: o.gray, caption: o.cap ? capTxt(o) : null, capBold: true }); await save(fname(o) + ".png", blob); st.cfg.fig.n = o.n + 1; saveCfg(); closeDlg(); } catch (e) { toast("Não consegui gerar a imagem."); } };
      el.querySelector("#fgSvg").onclick = async () => { const o = read(); const s = CH.svgString(chEl, { font: o.font, gray: o.gray }); if (s) { await save(fname(o) + ".svg", s); st.cfg.fig.n = o.n + 1; saveCfg(); closeDlg(); } };
      el.querySelector("#fgCopy").onclick = async () => { try { await navigator.clipboard.writeText(capTxt(read())); toast("Legenda copiada."); } catch (e) { toast("O navegador bloqueou a cópia."); } };
    });
  }

  // ---------------- relatório reprodutível
  async function repLoad() { try { const db = await idb(); st.report = await new Promise(res => { const q = db.transaction("base").objectStore("base").get("relatorio"); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch (e) { st.report = st.report || []; } renderRepCount(); }
  async function repSave() { renderRepCount(); try { const db = await idb(); await new Promise(res => { const tx = db.transaction("base", "readwrite"); tx.objectStore("base").put(st.report, "relatorio"); tx.oncomplete = res; tx.onerror = res; }); } catch (e) { } }
  const renderRepCount = () => { const c = $("#rCnt"); if (!c) return; const n = (st.report || []).length; c.hidden = !n; c.textContent = n; };
  const filtersText = () => { const f = Object.entries(st.filters); return f.length ? f.map(([k, x]) => `${lbl(k)}: ${x.kind === "in" ? x.values.join(", ") : `${x.min ?? "…"} a ${x.max ?? "…"}`}`).join("; ") : "nenhum"; };
  function addToReport(title, box) {
    const c = box.cloneNode(true);
    c.querySelectorAll(".noprint, .menu, button, select, input, textarea, datalist, .tab[hidden]").forEach(n => n.remove());
    c.querySelectorAll("[data-tip]").forEach(n => n.removeAttribute("data-tip")); c.querySelectorAll("[data-key]").forEach(n => n.removeAttribute("data-key"));
    c.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
    const h0 = c.querySelector("h3, h4"); if (h0 && h0.textContent.trim() === String(title).trim()) h0.remove();
    const html = c.innerHTML; if (html.length > 3e6) return toast("Resultado grande demais para o relatório.");
    st.report = st.report || []; st.report.push({ id: Date.now().toString(36), title, html, when: new Date().toISOString(), filtros: filtersText(), unidade: st.model.tables[st.table].unidade, n: rowsOf(st.table).length });
    repSave(); toast(`Adicionado ao relatório (${st.report.length} ${st.report.length === 1 ? "item" : "itens"}).`);
  }
  const hashStr = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).toUpperCase().padStart(8, "0"); };
  function repHeader() {
    const m = st.model, recN = Object.values(st.cfg.recodes || {}).reduce((s, r) => s + Object.keys(r).length, 0), tyN = Object.keys(st.cfg.types || {}).length, munN = Object.keys(st.cfg.municipios || {}).length;
    const last = (m.tables.part.rows.map(r => r.d_data).filter(Boolean).sort().pop() || "").split("-").reverse().join("/");
    const fp8 = hashStr(st.raw.map(r => r.name + JSON.stringify(r.json)).join("|"));
    const nDup = m.tables.part.rows.filter(r => r._dup).length, nRe = m.tables.part.rows.filter(r => r._mom > 1).length;
    return `<table class="t"><tbody><tr><td style="width:220px">Base de dados</td><td>Exportação do Epicollect5: ${m.forms.map(f => `${esc(f.nome)} (${f.n})`).join("; ")}. Última ficha: ${esc(last)}. Impressão digital da base: <code>${fp8}</code> <span class="note">(muda se qualquer resposta mudar)</span></td></tr>
      <tr><td>Regras de inclusão</td><td>${st.cfg.excludeDup !== false ? `${nDup} ficha(s) duplicada(s) excluída(s)` : "duplicatas mantidas"}; ${st.cfg.firstOnly !== false ? `só a 1ª avaliação de cada pessoa (${nRe} reavaliação(ões) fora das análises transversais)` : "todas as avaliações"}.</td></tr>
      <tr><td>Limpeza</td><td>Regras automáticas descritas em “Como calculamos”; ${recN} recodificação(ões) manuais, ${tyN} tipo(s) de variável alterado(s), ${munN} município(s) completado(s) à mão; ${m.quality.filter(q => q.sev === "erro").length} valores impossíveis tratados como sem resposta.</td></tr>
      <tr><td>Ferramenta</td><td>EITA! DADOS ${VERSAO} (Lab.EITA/UFG); relatório gerado em ${new Date().toLocaleString("pt-BR")}.</td></tr></tbody></table>`;
  }
  function pageRelatorio(pg) {
    const R = st.report || [], t = st.cfg.repTitle || "Relatório de análise — Lab.EITA";
    pg.innerHTML = `<div class="cab"><div><h2>Relatório</h2><p>Junte aqui os resultados que vão para o artigo ou para a reunião: em cada análise, gráfico ou tabela, use “+ Adicionar ao relatório”. Cada item guarda os filtros e o n do momento em que foi adicionado, e o relatório traz a versão da base e as regras de limpeza, para qualquer pessoa da equipe refazer o mesmo número.</p></div>
      <div class="acoes row"><button type="button" id="rCopy">Copiar para o Word</button><button type="button" id="rHtml">Baixar HTML</button><button type="button" id="rPrint">Imprimir / PDF</button></div></div>
      <div class="painelf"><div class="campos"><label>Título<input type="text" id="rT" value="${esc(t)}"></label><label>Autoria<input type="text" id="rA" value="${esc(st.cfg.repAutor || "")}" placeholder="Nome de quem fez as análises"></label></div></div>
      <div id="rDoc" class="painelf"></div>`;
    const draw = () => {
      $("#rDoc").innerHTML = `<h1 style="font:800 26px var(--f-display);margin:0 0 4px;color:var(--noite)">${esc(st.cfg.repTitle || t)}</h1><p class="note" style="margin:0 0 14px">${esc(st.cfg.repAutor || "")}${st.cfg.repAutor ? " · " : ""}${new Date().toLocaleDateString("pt-BR")}</p>
        <h2 style="font:700 18px var(--f-display);margin:18px 0 8px">Dados e regras</h2>${repHeader()}
        <h2 style="font:700 18px var(--f-display);margin:22px 0 8px">Métodos</h2><p style="line-height:1.6">${metodosTexto(true)}</p>
        <h2 style="font:700 18px var(--f-display);margin:22px 0 8px">Resultados</h2>
        ${R.length ? R.map((it, i) => `<section class="rep-it" style="border-top:1px solid var(--linha);padding-top:14px;margin-top:14px"><div class="row noprint" style="float:right"><button class="ghost small" type="button" data-up="${i}" ${i ? "" : "disabled"} aria-label="Subir">↑</button><button class="ghost small" type="button" data-dn="${i}" ${i < R.length - 1 ? "" : "disabled"} aria-label="Descer">↓</button><button class="ghost small" type="button" data-rm="${i}">Remover</button></div>
          <h3 style="font:700 16px var(--f-display);margin:0 0 3px">${i + 1}. ${esc(it.title)}</h3><p class="note" style="margin:0 0 10px">${esc(it.n)} ${esc(it.unidade)} · filtros: ${esc(it.filtros)} · adicionado em ${new Date(it.when).toLocaleString("pt-BR")}</p><div class="rep-body">${it.html}</div></section>`).join("") : `<p class="vazio">Nenhum resultado ainda. Vá à Estatística, à Tabela para artigo, ao Fluxograma ou ao Painel e use “+ Adicionar ao relatório”.</p>`}
        ${R.length ? `<div class="row noprint" style="margin-top:18px"><button class="ghost" type="button" id="rClear">Esvaziar relatório</button></div>` : ""}`;
      $("#rDoc").querySelectorAll("[data-up]").forEach(b => b.onclick = () => { const i = +b.dataset.up; [R[i - 1], R[i]] = [R[i], R[i - 1]]; repSave(); draw(); });
      $("#rDoc").querySelectorAll("[data-dn]").forEach(b => b.onclick = () => { const i = +b.dataset.dn; [R[i + 1], R[i]] = [R[i], R[i + 1]]; repSave(); draw(); });
      $("#rDoc").querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { R.splice(+b.dataset.rm, 1); repSave(); draw(); });
      const cl = $("#rClear"); if (cl) cl.onclick = () => { if (cl.dataset.ok) { st.report = []; repSave(); render(); } else { cl.dataset.ok = 1; cl.textContent = "Clique de novo para esvaziar"; cl.classList.add("perigo"); } };
    };
    draw();
    $("#rT").oninput = e => { st.cfg.repTitle = e.target.value; saveCfg(); }; $("#rT").onchange = draw;
    $("#rA").oninput = e => { st.cfg.repAutor = e.target.value; saveCfg(); }; $("#rA").onchange = draw;
    const docHtml = () => { const c = $("#rDoc").cloneNode(true); c.querySelectorAll(".noprint").forEach(n => n.remove()); return c.innerHTML; };
    const css = `body{font-family:Arial,Helvetica,sans-serif;color:#1C1730;max-width:900px;margin:32px auto;padding:0 20px;font-size:11pt;line-height:1.45}table{border-collapse:collapse;width:100%;font-size:10pt;margin:6px 0}th,td{border:1px solid #CFC6E6;padding:4px 7px;text-align:left;vertical-align:top}th{background:#F5F3FC}td.n,th.n{text-align:right}tr.grp td{background:#F5F3FC;font-weight:bold}td.ind{padding-left:20px}.note{color:#5E5878;font-size:9.5pt}.sig{font-weight:bold}.frase{background:#F7F4FF;border-left:3px solid #9560FD;padding:8px 12px;margin:8px 0}.frase .lbl{display:block;font-size:8.5pt;font-weight:bold;color:#6B3FD6;text-transform:uppercase}.box{padding:8px 12px;background:#FBEBDD;margin:6px 0}.grade{display:block}.card{margin:8px 0}h1{font-size:20pt}h2{font-size:14pt;margin-top:22px}h3{font-size:12pt}svg{max-width:100%;height:auto}section{page-break-inside:avoid;border-top:1px solid #E4DFF0;padding-top:10px;margin-top:14px}`;
    $("#rHtml").onclick = () => save(`relatorio-eita-dados_${new Date().toISOString().slice(0, 10)}.html`, `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(st.cfg.repTitle || t)}</title><style>${css}</style></head><body>${docHtml()}</body></html>`);
    $("#rCopy").onclick = async () => {
      // gráficos viram imagens PNG embutidas, que o Word aceita ao colar
      const c = $("#rDoc").cloneNode(true); c.querySelectorAll(".noprint").forEach(n => n.remove());
      const live = [...$("#rDoc").querySelectorAll(".rep-body svg")], copies = [...c.querySelectorAll(".rep-body svg")];
      for (let i = 0; i < live.length; i++) { try { const wrap = document.createElement("div"); wrap.appendChild(live[i].cloneNode(true)); const blob = await CH.png(wrap, { scale: 2, font: "Arial" }); const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); const img = document.createElement("img"); img.src = url; img.width = Math.min(640, +live[i].getAttribute("width") || 640); copies[i].replaceWith(img); } catch (e) { } }
      const html = `<html><head><meta charset="utf-8"><style>${css}</style></head><body>${c.innerHTML}</body></html>`;
      try { await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([c.innerText], { type: "text/plain" }) })]); toast("Relatório copiado. Cole no Word ou no Google Docs."); }
      catch (e) { toast("O navegador bloqueou a cópia. Use “Baixar HTML” e abra o arquivo no Word."); }
    };
    $("#rPrint").onclick = () => { try { window.print(); } catch (e) { toast("Impressão indisponível nesta janela. Baixe o HTML e imprima pelo navegador."); } };
  }

  // ---------------- fluxograma de participantes
  function pageFluxo(pg) {
    const m = st.model, all = m.tables.part.rows, lang = st.cfg.flowLang || "pt", T = (pt, en) => lang === "en" ? en : pt;
    const dups = all.filter(r => r._dup).length, reav = all.filter(r => !r._dup && r._mom > 1).length;
    const base = baseRows("part"), incl = rowsOf("part"), filt = base.length - incl.length;
    const main = [{ lines: [T("Fichas de anamnese registradas", "Intake forms recorded"), `(n = ${all.length})`] }];
    const side1 = []; if (st.cfg.excludeDup !== false && dups) side1.push(T(`Fichas duplicadas (n = ${dups})`, `Duplicate records (n = ${dups})`)); if (st.cfg.firstOnly !== false && reav) side1.push(T(`Reavaliações da mesma pessoa (n = ${reav})`, `Repeated assessments (n = ${reav})`));
    if (side1.length) { main[0].side = [T("Excluídas", "Excluded"), ...side1]; main.push({ lines: [T("Participantes únicos", "Unique participants"), `(n = ${base.length})`] }); }
    if (filt) { const fl = Object.entries(st.filters).map(([k, x]) => `${lbl(k)}: ${x.kind === "in" ? x.values.join(", ") : `${x.min ?? "…"}–${x.max ?? "…"}`}`); main[main.length - 1].side = [T(`Fora dos critérios (n = ${filt})`, `Not meeting criteria (n = ${filt})`), ...fl.map(s => s.length > 52 ? s.slice(0, 50) + "…" : s)]; }
    main.push({ lines: [T("Incluídos na análise", "Included in the analysis"), `(n = ${incl.length})`] }); if (main.length >= 2 && main[main.length - 2].lines[0] === main[main.length - 1].lines[0]) main.splice(main.length - 2, 1);
    const branches = [];
    const cnt = f => incl.filter(f).length;
    if (V("s_bipq") || m.forms.some(f => /ipq/i.test(f.slug))) { const f = m.forms.find(x => /ipq/i.test(x.slug)); branches.push(["B-IPQ", T(`Responderam: ${cnt(r => r["_has_" + f.slug])}`, `Answered: ${cnt(r => r["_has_" + f.slug])}`), T(`Escore total calculado: ${cnt(r => r.s_bipq != null)}`, `Total score available: ${cnt(r => r.s_bipq != null)}`)]); }
    if (D.sfDomains && V("s_sf_cf")) { const f = m.forms.find(x => /sf/i.test(x.slug)); branches.push(["SF-36", T(`Responderam: ${cnt(r => r["_has_" + f.slug])}`, `Answered: ${cnt(r => r["_has_" + f.slug])}`), T(`8 domínios calculados: ${cnt(r => D.sfDomains.every(k => r[k] != null))}`, `All 8 domains: ${cnt(r => D.sfDomains.every(k => r[k] != null))}`)]); }
    const qt = Object.values(m.tables).find(t => t.id !== "part");
    if (qt) { const ids = new Set(incl.map(r => r._id)), qr = qt.rows.filter(r => ids.has(r._pid)); branches.push(["B-QUEST", T(`Participantes: ${new Set(qr.map(r => r._pid)).size}`, `Participants: ${new Set(qr.map(r => r._pid)).size}`), T(`Dispositivos avaliados: ${qr.length}`, `Devices rated: ${qr.length}`), T(`Escore total calculado: ${qr.filter(r => r.s_quest_total != null).length}`, `Total score available: ${qr.filter(r => r.s_quest_total != null).length}`)]); }
    pg.innerHTML = `<div class="cab"><div><h2>Fluxograma de participantes</h2><p>Diagrama de fluxo no formato pedido pelas revistas (STROBE): quantas fichas foram registradas, quantas saíram e por quê, e quantas pessoas responderam cada instrumento. Ele segue as regras de inclusão (tela Dados) e os filtros do topo, que aparecem como critérios de exclusão.</p></div>
      <div class="acoes row"><label class="chk"><input type="checkbox" id="flEn"${lang === "en" ? " checked" : ""}> Em inglês</label></div></div>
      ${helpBox("fluxo")}<div class="painelf res"><h3 class="sec" style="margin-top:0">${T("Fluxograma de participantes", "Participant flow diagram")}</h3><div class="ch" id="flCh"></div>
      <div class="row noprint" style="margin-top:14px;justify-content:flex-end;border-top:1px solid var(--linha);padding-top:10px"><button class="small" type="button" data-fig>Exportar figura</button><button class="small primary" type="button" data-rep data-title="Fluxograma de participantes">+ Adicionar ao relatório</button></div></div>
      ${frase(T(`Foram registradas ${all.length} fichas de anamnese${side1.length ? `; ${[st.cfg.excludeDup !== false && dups ? `${dups} duplicada(s)` : "", st.cfg.firstOnly !== false && reav ? `${reav} reavaliação(ões) da mesma pessoa` : ""].filter(Boolean).join(" e ")} foram excluídas` : ""}${filt ? `, e ${filt} participante(s) não atenderam aos critérios de inclusão (${esc(filtersText())})` : ""}. Foram incluídos ${incl.length} participantes${branches.map(b => `; ${b[1].replace(/^Responderam: /, "")} responderam ao ${b[0]}`).join("").replace(/Participantes: /, "")}.`, `A total of ${all.length} intake forms were recorded${side1.length ? `; ${dups + (st.cfg.firstOnly !== false ? reav : 0)} were excluded (duplicates or repeated assessments)` : ""}${filt ? `, and ${filt} did not meet the inclusion criteria` : ""}. ${incl.length} participants were included.`), T("Para o texto de métodos/resultados", "For the methods/results section"))}`;
    $("#flEn").onchange = e => { st.cfg.flowLang = e.target.checked ? "en" : "pt"; saveCfg(); render(); };
    mount($("#flCh"), () => CH.flow($("#flCh"), { steps: { main, branches } }));
    wireActions(pg);
  }

  // ---------------- ajuda, “como ler” e reprodução em outros programas
  const GU = window.EGuia;
  const linkL = k => { const l = GU.L[k]; return l ? `<li><a href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.t)}</a></li>` : ""; };
  function helpBox(key, open) {
    const h = GU && GU.T[key]; if (!h) return "";
    const li = a => a && a.length ? `<ul>${a.map(x => `<li>${x}</li>`).join("")}</ul>` : "";
    return `<details class="ajuda noprint"${open ? " open" : ""}><summary><span class="q">?</span> Como funciona e como interpretar: ${esc(h.titulo)}</summary><div class="ajb">
      <p><b>Quando usar.</b> ${h.quando}</p>${h.pressupostos ? `<p><b>Pressupostos</b></p>${li(h.pressupostos)}` : ""}<p><b>Como ler</b></p>${li(h.como)}${h.erros ? `<p><b>Erros comuns</b></p>${li(h.erros)}` : ""}
      ${h.jamovi ? `<p><b>Para conferir no jamovi:</b> ${esc(h.jamovi)}</p>` : ""}${h.leituras ? `<p><b>Para estudar</b></p><ul class="lk">${h.leituras.map(linkL).join("")}</ul>` : ""}
      <p><a href="#guia" data-guia="${key}">Abrir no guia de estatística →</a></p></div></details>`;
  }
  document.addEventListener("click", e => { const a = e.target.closest("[data-guia]"); if (a) { st.guideAnchor = a.dataset.guia; } });
  const pp = p => p < 0.001 ? "menor que 0,001" : fp(p);
  function comoLer(items) { return `<div class="ler"><span class="lbl">Como ler este resultado</span><ul>${items.filter(Boolean).map(i => `<li>${i}</li>`).join("")}</ul></div>`; }
  const lerP = (p, oque) => p < 0.05 ? `<b>p = ${pp(p)}</b>: se na população não houvesse ${oque}, um resultado como este apareceria em menos de 5% das amostras. Por isso se diz que ${oque === "diferença" ? "a diferença é" : "a associação é"} <b>estatisticamente significativa</b>.`
    : `<b>p = ${pp(p)}</b>: um resultado como este poderia aparecer só pelo acaso. Não há evidência suficiente de ${oque} — o que <b>não</b> prova que ela não exista (com amostra pequena, pode faltar poder).`;
  // nomes das colunas como ficam no R (read.csv2 acrescenta X antes de nomes que começam com número)
  const rn = id => { let n = id.includes("::") ? id.split("::")[0] + "__" + D.key(id.split("::")[1]) : id; n = n.replace(/[^A-Za-z0-9_.]/g, "."); return /^[0-9_]/.test(n) ? "X" + n : n; };
  const rs = s => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  function rPrep(ids) { return ids.filter(id => id.includes("::")).map(id => `d$${rn(id)} <- factor(d$${rn(id)}, levels = c(1, 0), labels = c("Sim", "Não"))`).join("\n"); }
  function rBlock(code, ids, jamovi) {
    const tid = st.table, file = `eita-dados_${tid.replace(/^form-\d+__/, "") === "part" ? "part" : tid.replace(/^form-\d+__/, "")}_AAAA-MM-DD.csv`;
    const head = `# 1. Tela Exportar: tabela "${st.model.tables[tid].label}", Linhas = só as que passam pelos filtros,\n#    Cabeçalho = códigos curtos, Separador = ponto e vírgula.\n# 2. Troque o nome do arquivo abaixo pelo que foi baixado.\nd <- read.csv2(${rs(file)}, fileEncoding = "UTF-8-BOM", na.strings = c("", "NA"))\n${rPrep(ids || [])}`;
    const full = head.trim() + "\n\n" + code.trim();
    return `<details class="codigo noprint"><summary>Refazer no R ou no jamovi</summary><div class="ajb">${jamovi ? `<p><b>jamovi:</b> ${esc(jamovi)}</p>` : ""}<p><b>R</b> <button type="button" class="ghost small" data-copyr>Copiar código</button></p><pre>${esc(full)}</pre></div></details>`;
  }
  function addLer(out, items, rcode) {
    const fr = out.querySelector(".frase"); const anchor = fr ? fr.parentElement === out.querySelector(".res") ? fr : fr.parentElement : out.querySelector(".res > .row.noprint:last-child");
    const html = comoLer(items) + (rcode || "");
    if (anchor) anchor.insertAdjacentHTML("beforebegin", html); else out.querySelector(".res").insertAdjacentHTML("beforeend", html);
    out.querySelectorAll("[data-copyr]").forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.closest(".ajb").querySelector("pre").textContent); toast("Código copiado."); } catch (e) { toast("O navegador bloqueou a cópia; selecione o texto."); } });
    glossify(out);
  }
  const GL_ALIAS = { "Valor de p": "p", "p ajustado": "p ajustado", "IC 95% da RC": "IC 95%", "IC 95% da média": "IC 95%", "Média ± DP": "DP", "Mediana [IIQ]": "IIQ", "Shapiro-Wilk p": "Shapiro-Wilk", "Shapiro-Wilk (p)": "Shapiro-Wilk", "V de Cramér": "V de Cramér", "Escore z médio": "Escore z", "Amostra, média ± DP": "DP", "Norma, média ± DP": "DP", "Correlação item-total corrigida": "α", "α se o item for retirado": "α", "β padronizado": "β padronizado" };
  function glossify(root) {
    if (!GU) return; root.querySelectorAll("table.t th, table.t td:first-child").forEach(c => { if (c.dataset.gl) return; const t = c.textContent.trim(); const k = GU.G[t] ? t : GL_ALIAS[t]; if (k && GU.G[k]) { c.title = GU.G[k]; c.classList.add("gl"); c.dataset.gl = 1; } });
  }

  // ---------------- GUIA
  function pageGuia(pg) {
    const T = GU.T, li = a => a && a.length ? `<ul>${a.map(x => `<li>${x}</li>`).join("")}</ul>` : "";
    const ordem = ["descritiva", "comparar", "associacao", "correlacao", "regressao", "logistica", "pareado", "normas", "ausentes", "confiabilidade", "tabela1", "fluxo"];
    const body = `<h1 class="g-h1">Guia de estatística do EITA! DADOS</h1><p class="note">Para alunos e pesquisadores do Lab.EITA/UFG: como a ferramenta faz cada análise, como ler os resultados e onde estudar mais.</p>
      <nav class="g-ind"><b>Neste guia</b><ol>${GU.S.map(s => `<li><a href="#guia" data-ir="${s.id}">${esc(s.titulo)}</a></li>`).join("")}<li><a href="#guia" data-ir="testes">As análises, uma a uma</a></li><li><a href="#guia" data-ir="glossario">Glossário</a></li><li><a href="#guia" data-ir="leituras">Leituras e programas</a></li></ol></nav>
      ${GU.S.map(s => `<section id="g-${s.id}" class="g-sec"><h2>${esc(s.titulo)}</h2>${s.html}</section>`).join("")}
      <section id="g-testes" class="g-sec"><h2>As análises, uma a uma</h2>${ordem.map(k => { const h = T[k]; return `<article id="g-${k}" class="g-art"><h3>${esc(h.titulo)}</h3><p><b>Quando usar.</b> ${h.quando}</p>${h.pressupostos ? `<p><b>Pressupostos</b></p>${li(h.pressupostos)}` : ""}<p><b>Como ler</b></p>${li(h.como)}${h.erros ? `<p><b>Erros comuns</b></p>${li(h.erros)}` : ""}${h.jamovi ? `<p><b>Para conferir no jamovi:</b> ${esc(h.jamovi)}</p>` : ""}${h.leituras ? `<p><b>Para estudar</b></p><ul class="lk">${h.leituras.map(linkL).join("")}</ul>` : ""}</article>`; }).join("")}</section>
      <section id="g-glossario" class="g-sec"><h2>Glossário</h2><dl class="g-dl">${Object.entries(GU.G).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></section>
      <section id="g-leituras" class="g-sec"><h2>Leituras e programas</h2><p class="note">Artigos de acesso aberto, em português sempre que possível. A série do Prof. Hélio Miot no Jornal Vascular Brasileiro é curta e muito didática.</p><ul class="lk">${Object.keys(GU.L).map(linkL).join("")}</ul>
      <p class="note">Instrumentos: Ciconelli RM et al. Tradução para a língua portuguesa e validação do questionário genérico de avaliação de qualidade de vida SF-36 (Brasil SF-36). Rev Bras Reumatol. 1999;39(3):143-50 · Demers L, Weiss-Lambrou R, Ska B. The Quebec User Evaluation of Satisfaction with Assistive Technology (QUEST 2.0): an overview and recent progress. Technol Disabil. 2002;14(3):101-5.</p></section>`;
    pg.innerHTML = `<div class="cab"><div><h2>Guia de estatística</h2><p>Texto de apoio para a equipe. Cada aba da Estatística também tem uma caixa “?” com o resumo da análise e, em cada resultado, um bloco “Como ler este resultado” escrito com os números obtidos.</p></div><div class="acoes row"><button type="button" id="gBaixa">Baixar o guia (HTML)</button></div></div><div class="painelf guia" id="gDoc">${body}</div>`;
    pg.querySelectorAll("[data-ir]").forEach(a => a.onclick = e => { e.preventDefault(); const t = document.getElementById("g-" + a.dataset.ir); if (t) t.scrollIntoView({ behavior: "smooth" }); });
    $("#gBaixa").onclick = () => save("guia-estatistica-eita-dados.html", `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Guia de estatística — EITA! DADOS</title><style>body{font-family:Arial,sans-serif;max-width:860px;margin:30px auto;padding:0 20px;line-height:1.55;color:#1C1730}h1{font-size:24pt}h2{margin-top:30px;border-bottom:2px solid #9560FD;padding-bottom:4px}h3{margin-top:22px;color:#4F2BA8}table{border-collapse:collapse;width:100%}td,th{border:1px solid #CFC6E6;padding:5px 8px;text-align:left}th{background:#F5F3FC}dt{font-weight:bold;margin-top:8px}a{color:#6B3FD6}.note{color:#5E5878}nav{background:#F5F3FC;padding:10px 16px}</style></head><body>${body.replace(/ data-ir="([^"]+)"/g, ' data-x="$1"').replace(/href="#guia" data-x="([^"]+)"/g, 'href="#g-$1"')}<p class="note">EITA! DADOS ${VERSAO} · Lab.EITA/UFG</p></body></html>`);
    if (st.guideAnchor) { const t = document.getElementById("g-" + st.guideAnchor); st.guideAnchor = null; if (t) setTimeout(() => t.scrollIntoView(), 50); }
    glossify(pg);
  }

  // ---------------- TABELA 1
  function pageTabela1(pg) {
    const t = st.model.tables[st.table];
    const def = ["7_Sexo", "d_idade", "d_faixa", "d_diag", "d_prematuro", "43_Escolaridade", "42_Situao_Profission", "76_Comunicao_e_cogni", "d_motor", "s_bipq", ...(D.sfDomains || [])].filter(k => V(k) && t.vars.includes(k));
    pg.innerHTML = `<div class="cab"><div><h2>Tabela para artigo</h2><p>A “Tabela 1” de caracterização da amostra, no formato das revistas: números como média ± DP ou mediana [IIQ] conforme a normalidade, categorias como n (%), e o valor de p da comparação entre grupos, com o teste indicado em nota.</p></div></div>
      ${helpBox("tabela1")}<div class="painelf"><div class="campos" style="grid-template-columns:2fr 1fr"><div><div class="note" style="font-weight:600;margin-bottom:5px">Linhas da tabela</div>${varChecks("t1", { types: ["num", "cat"], noVirtual: false }, def)}</div>
      <div style="display:flex;flex-direction:column;gap:10px"><label class="note" style="font-weight:600">Comparar por (colunas)${varSelect("t1g", { types: ["cat"], none: "— só a amostra total —", value: "" })}</label>
      <label class="note" style="font-weight:600">Números<select id="t1n"><option value="auto">Automático (Shapiro-Wilk)</option><option value="mean">Sempre média ± DP</option><option value="median">Sempre mediana [IIQ]</option></select></label>
      <label class="chk"><input type="checkbox" id="t1t" checked> Coluna de total</label><label class="chk"><input type="checkbox" id="t1m"> Linha de “sem resposta”</label>
      <button class="primary" id="t1Go" type="button">Montar tabela</button></div></div></div><div id="t1Out"></div>`;
    const go = () => {
      const ids = checked(pg, "t1"), g = $("#t1g").value, rows = rowsOf(st.table);
      const r = t1Build({ rows, ids, gOf: g ? (x => x[g]) : null, levels: g ? D.levelsOf(V(g), rows).filter(l => rows.some(q => q[g] === l)) : [], nm: $("#t1n").value, tot: $("#t1t").checked, showMiss: $("#t1m").checked });
      $("#t1Out").innerHTML = resultBox(`<h3 class="sec" style="margin-top:0">Tabela 1. Características da amostra${g ? " segundo " + esc(V(g).label.toLowerCase()) : ""}</h3><div class="tw">${r.h}</div><p class="note" style="margin-top:8px">DP: desvio padrão; IIQ: intervalo interquartil (1º e 3º quartis). Porcentagens calculadas sobre quem respondeu.${r.nt ? " Testes: " + r.nt + "." : ""}</p>${actions("tT1")}
        ${frase(metodosTexto(g ? V(g).label : null), "Texto para a seção de métodos")}`);
      wireActions($("#t1Out"));
      addLer($("#t1Out"), ["Cada linha diz qual resumo foi usado: média ± DP (dados compatíveis com a normal) ou mediana [IIQ] (dados assimétricos); categorias em n (%).",
        g ? "A coluna p diz se os grupos diferem naquela característica; a letra sobrescrita indica o teste, explicado na nota abaixo da tabela. Diferenças de base entre os grupos podem confundir comparações posteriores (considere ajustá-las numa regressão)." : "Sem grupos, a tabela só descreve a amostra; escolha uma variável em “Comparar por” para ter os valores de p.",
        "No artigo, a tabela deve ter título acima e as abreviações explicadas na nota, como aqui."],
        rBlock(`# install.packages(c("gtsummary", "dplyr"))\nlibrary(gtsummary)\nvars <- c(${ids.map(k => rs(rn(k))).join(", ")})\ntbl_summary(d[, c(vars${g ? ", " + rs(rn(g)) : ""})]${g ? `, by = ${rn(g)}` : ""}, missing = "no")${g ? " |>\n  add_p()" : ""}`, ids.concat(g ? [g] : []), GU.T.tabela1.jamovi || "Exploration → Descriptives (com Split by), e os testes de cada linha nos menus correspondentes."));
    };
    $("#t1Go").onclick = go; go();
  }
  function t1Build(o) {
    const { rows, ids, gOf, levels: lv, nm, showMiss } = o; const g = !!gOf, tot = o.tot;
    const sets = (g ? lv.map(l => ({ l, rows: rows.filter(r => gOf(r) === l) })) : []); if (tot || !g) sets.unshift({ l: "Total", rows });
    const notes = new Set(); const marks = { "Teste t de Welch": "a", "ANOVA de uma via": "b", "ANOVA de Welch": "b", "Mann-Whitney U": "c", "Kruskal-Wallis": "d", "Qui-quadrado de Pearson": "e", "Qui-quadrado (correção de Yates)": "e", "Exato de Fisher": "f" };
    const mark = name => { const k = Object.keys(marks).find(x => name.startsWith(x.replace("Teste ", ""))) || (name.startsWith("Qui-quadrado com p") ? "MC" : null); const m = k === "MC" ? "g" : k ? marks[k] : ""; if (m) notes.add(m + "|" + (k === "MC" ? "Qui-quadrado com p por simulação de Monte Carlo" : k)); return m; };
    let h = `<table class="t" id="${o.tid || "tT1"}"><thead><tr><th>Característica</th>${sets.map(s => `<th class="n">${esc(s.l)}<br><span class="note" style="font-weight:500">(n = ${s.rows.length})</span></th>`).join("")}${g ? '<th class="n">p</th>' : ""}</tr></thead><tbody>`;
    ids.forEach(id => {
      const v = V(id); if (!v) return;
      if (v.type === "num") {
        const all = rows.map(r => r[id]).filter(x => x != null); const sw = all.length >= 3 ? S.shapiro(all).p : 0;
        const useMean = nm === "mean" || (nm === "auto" && sw >= 0.05);
        let p = "";
        if (g) { const gs = lv.map(l => rows.filter(r => gOf(r) === l).map(r => r[id]).filter(x => x != null)).filter(x => x.length >= 2); if (gs.length >= 2) { const r = compare(gs.map((values, i) => ({ label: String(i), values })), useMean ? "param" : "nonparam"); p = `${fp(r.main.p)}<sup>${mark(r.main.test)}</sup>`; } }
        const cell = s => { const d = S.describe(s.rows.map(r => r[id])); return d.n ? (useMean ? `${f2(d.mean)} ± ${f2(d.sd)}` : `${f2(d.median)} [${f2(d.q1)}; ${f2(d.q3)}]`) : "—"; };
        h += `<tr><td>${esc(v.label)}${v.unit && !/\(/.test(v.label) ? ` (${esc(v.unit)})` : ""}, ${useMean ? "média ± DP" : "mediana [IIQ]"}</td>${sets.map(s => `<td class="n">${cell(s)}</td>`).join("")}${g ? `<td class="n">${p}</td>` : ""}</tr>`;
        if (showMiss) { h += `<tr><td class="ind note">Sem resposta</td>${sets.map(s => `<td class="n note">${s.rows.filter(r => r[id] == null).length}</td>`).join("")}${g ? "<td></td>" : ""}</tr>`; }
      } else {
        let p = "";
        if (g) { const xt = S.crosstab(rows.map(r => r[id]), rows.map(r => gOf(r))); if (xt.rows.length >= 2 && xt.cols.length >= 2) { let t = S.chisq(xt.m); if (xt.rows.length === 2 && xt.cols.length === 2 && t.minE < 5) t = S.fisher2x2(xt.m); else if (t.lowEPct > 0.2) t = S.chisqMC(xt.m, 20000); p = `${fp(t.p)}<sup>${mark(t.test)}</sup>`; } }
        h += `<tr><td><b>${esc(v.label)}</b>, n (%)</td>${sets.map(() => "<td></td>").join("")}${g ? `<td class="n">${p}</td>` : ""}</tr>`;
        const levels = counts(rows, id).cats.map(c => c.label);
        levels.forEach(l => h += `<tr><td class="ind">${esc(l)}</td>${sets.map(s => { const c = counts(s.rows, id), x = c.cats.find(q => q.label === l); return `<td class="n">${x ? `${x.value} (${fmt(100 * x.value / x.base, 1)})` : "0 (0)"}</td>`; }).join("")}${g ? "<td></td>" : ""}</tr>`);
        if (showMiss) h += `<tr><td class="ind note">Sem resposta</td>${sets.map(s => `<td class="n note">${counts(s.rows, id).miss}</td>`).join("")}${g ? "<td></td>" : ""}</tr>`;
      }
    });
    h += `</tbody></table>`;
    const nt = [...notes].sort().map(x => { const [m, n] = x.split("|"); return `<sup>${m}</sup> ${n}`; }).join("; ");
    return { h, nt };
  }
  const metodosTexto = grp => `As variáveis numéricas foram descritas por média e desvio padrão (DP) quando a distribuição foi compatível com a normal pelo teste de Shapiro-Wilk, e por mediana e intervalo interquartil (IIQ) nos demais casos; as variáveis categóricas, por frequências absolutas e relativas.${grp ? ` As comparações entre ${grp === true ? "grupos" : "os grupos de " + esc(grp)} usaram o teste t de Welch ou a ANOVA (com correção de Welch quando o teste de Levene indicou variâncias diferentes) para dados normais, e os testes de Mann-Whitney ou Kruskal-Wallis para os demais; as variáveis categóricas foram comparadas pelo qui-quadrado de Pearson, pelo exato de Fisher (tabelas 2×2 com frequência esperada menor que 5) ou pelo qui-quadrado com valor de p por simulação de Monte Carlo (tabelas maiores com mais de 20% das caselas com frequência esperada menor que 5).` : ""} O nível de significância adotado foi de 5%. A qualidade de vida foi avaliada pelo SF-36, com escores de 0 a 100 por domínio calculados conforme Ciconelli et al. (1999); a percepção da doença, pelo Brief IPQ (escore total de 0 a 80, itens 3, 4 e 7 invertidos); e a satisfação com a tecnologia assistiva, pelo B-QUEST 2.0 (médias de 1 a 5 nas subescalas dispositivo e serviços). As análises foram feitas na ferramenta EITA! DADOS (Lab.EITA/UFG).`;

  // ---------------- QUALIDADE
  function pageQualidade(pg) {
    const m = st.model, q = m.quality, n = s => q.filter(x => x.sev === s).length;
    const nameOf = id => { const r = m.tables.part.rows.find(x => x._id === id); return r ? (r["4_Nome_do_participan"] || r._title || "") : ""; };
    pg.innerHTML = `<div class="cab"><div><h2>Qualidade dos dados</h2><p>O que a ferramenta corrigiu sozinha, o que deixou de fora e o que precisa ser conferido na ficha original. Corrija no Epicollect e exporte de novo; ou ajuste categorias na tela Variáveis.</p></div>
      <div class="acoes row"><label class="chk"><input type="checkbox" id="qPII"${st.cfg.showPII ? " checked" : ""}> Mostrar nomes (só nesta tela)</label></div></div>
      <div class="kpis"><div class="kpi"><div class="k">Para conferir</div><div class="v" style="color:var(--erro)">${n("erro")}</div><div class="d">valores impossíveis ou duplicidades</div></div><div class="kpi"><div class="k">Avisos</div><div class="v" style="color:var(--aviso)">${n("aviso")}</div><div class="d">textos que não deu para ler</div></div><div class="kpi"><div class="k">Ajustes automáticos</div><div class="v">${n("info")}</div><div class="d">códigos 999, unidades convertidas</div></div>
      ${m.forms.map(f => `<div class="kpi"><div class="k">${esc(f.nome.replace(/\s*\(.*\)/, ""))}</div><div class="v">${f.n}</div><div class="d">${f.rel === "raiz" ? "fichas principais" : f.rel === "1:1" ? "ligadas à ficha" : `registros de ${f.linked} participantes`}</div></div>`).join("")}</div>
      <div class="grade"><div class="card w12"><h4>Preenchimento por pergunta</h4><div class="sub">% de fichas com resposta; perguntas condicionais (“se sim, qual”) ficam naturalmente baixas</div><div class="row" style="margin-bottom:8px"><select id="qSec"></select></div><div class="ch" id="qCh"></div></div></div>
      <h3 class="sec">Ocorrências</h3><div class="row" style="margin-bottom:10px"><select id="qSev"><option value="">Todas</option><option value="erro">Para conferir</option><option value="aviso">Avisos</option><option value="info">Ajustes automáticos</option></select><input type="search" id="qBusca" placeholder="Buscar por variável, ID ou valor"></div><div class="painelf tw" id="qTab"></div>`;
    $("#qPII").onchange = e => { st.cfg.showPII = e.target.checked; saveCfg(); render(); };
    const secs = [...new Set(m.tables.part.vars.map(k => V(k)).filter(v => v && v.raw && !v.pii && !v.hide && !v.virtual).map(v => v.section))];
    $("#qSec").innerHTML = secs.map(s => `<option>${esc(s)}</option>`).join("");
    const drawC = () => { const s = $("#qSec").value; const vs = Object.values(m.vars).filter(v => v.raw && !v.pii && !v.hide && !v.virtual && v.section === s && v.n);
      mount($("#qCh"), () => CH.bar($("#qCh"), { cats: vs.map(v => ({ label: v.label, value: +(100 * (v.n - v.missing) / v.n).toFixed(1), base: 100, extra: [["Sem resposta", String(v.missing)]] })), max: 100, pct: false, barH: 16 })); };
    $("#qSec").onchange = drawC; drawC();
    const drawT = () => {
      const sev = $("#qSev").value, bq = D.key($("#qBusca").value || "");
      const list = q.filter(x => (!sev || x.sev === sev) && (!bq || D.key([x.var && lbl(x.var), x.pid, x.val, x.msg].join(" ")).includes(bq)));
      const lab = { erro: "conferir", aviso: "aviso", info: "ajuste" };
      $("#qTab").innerHTML = list.length ? `<table class="t" id="tQ"><thead><tr><th></th><th>ID</th>${st.cfg.showPII ? "<th>Nome</th>" : ""}<th>Pergunta</th><th>Valor digitado</th><th>O que foi feito</th></tr></thead><tbody>${list.slice(0, 600).map(x => `<tr><td><span class="badge ${x.sev}">${lab[x.sev]}</span></td><td>${esc(x.pid || "")}</td>${st.cfg.showPII ? `<td>${esc(x.pid ? nameOf(x.pid) : "")}</td>` : ""}<td>${esc(x.var ? lbl(x.var) : "")}</td><td>${esc(x.val)}</td><td>${esc(x.msg)}</td></tr>`).join("")}</tbody></table>${list.length > 600 ? `<p class="note">Mostrando 600 de ${list.length}.</p>` : ""}${actions("tQ")}` : "<p class='vazio'>Nada encontrado.</p>";
      wireActions($("#qTab"));
    };
    $("#qSev").onchange = drawT; $("#qBusca").oninput = drawT; drawT();
  }

  // ---------------- VARIÁVEIS (rótulos, tipos e recodificação)
  function pageVariaveis(pg) {
    const m = st.model; const all = Object.values(m.vars).filter(v => !v.virtual && (st.cfg.showPII || !v.pii));
    if (!st.varCur || !V(st.varCur)) st.varCur = "d_diag";
    pg.innerHTML = `<div class="cab"><div><h2>Variáveis</h2><p>Todas as perguntas e as variáveis calculadas. Aqui você corrige rótulos, junta categorias escritas de jeitos diferentes, transforma texto livre em categorias e esconde o que não interessa. As regras ficam salvas neste navegador e podem ser exportadas para a equipe usar as mesmas.</p></div></div>
      <div class="vars"><div><input type="search" id="vBusca" placeholder="Buscar variável" style="width:100%;margin-bottom:8px"><div class="vlist" id="vList"></div></div><div id="vDet"></div></div>`;
    const list = () => {
      const bq = D.key($("#vBusca").value || ""); const groups = {};
      all.filter(v => !bq || D.key(v.label + " " + v.id).includes(bq)).forEach(v => (groups[v.section] = groups[v.section] || []).push(v));
      const tp = { num: "número", cat: "categoria", multi: "múltipla", date: "data", text: "texto" };
      $("#vList").innerHTML = Object.entries(groups).map(([g, vs]) => `<div class="g">${esc(g)}</div>${vs.map(v => `<button type="button" data-v="${esc(v.id)}" class="${v.id === st.varCur ? "cur" : ""}"><span>${esc(v.label)}${v.derived ? ' <span class="badge calc">calculada</span>' : ""}${(st.cfg.hidden || []).includes(v.id) ? ' <span class="badge info">oculta</span>' : ""}</span><span class="tp">${tp[v.type]}</span></button>`).join("")}`).join("");
    };
    $("#vBusca").oninput = list; list();
    $("#vList").onclick = e => { const b = e.target.closest("[data-v]"); if (b) { st.varCur = b.dataset.v; list(); det(); } };
    const det = () => {
      const v = V(st.varCur), t = m.tables[tableOf(v.id)], rows = t.rows; const el = $("#vDet");
      const rec = st.cfg.recodes[v.id] || {};
      let h = `<div class="painelf"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="note">${esc(v.section)} · ${v.derived ? "calculada pela ferramenta" : "pergunta do Epicollect (" + esc(v.form || "") + ")"} · código <code>${esc(v.id)}</code></div><h3 style="margin:4px 0 0;font:700 20px var(--f-display)">${esc(v.label)}</h3>${v.fullQuestion ? `<p class="note">Enunciado: ${esc(v.fullQuestion)}</p>` : ""}${v.desc ? `<p class="note" style="max-width:80ch">${esc(v.desc)}</p>` : ""}</div>
        <label class="chk"><input type="checkbox" id="vHide"${(st.cfg.hidden || []).includes(v.id) ? " checked" : ""}> Ocultar nas análises</label></div>
        <div class="campos" style="margin-top:12px"><label>Rótulo<input type="text" id="vLbl" value="${esc(st.cfg.labels[v.id] || v.label)}"></label>
        ${v.raw ? `<label>Tipo<select id="vType">${[["cat", "Categoria"], ["num", "Número"], ["text", "Texto livre"], ["multi", "Múltipla escolha"], ["date", "Data"]].map(([k, l]) => `<option value="${k}"${v.type === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
        <div class="row"><button class="primary" type="button" id="vSave">Salvar rótulo e tipo</button></div></div>
        <p class="note">${v.n != null ? `${v.n - (v.missing || 0)} com resposta · ${v.missing || 0} sem resposta (${fmt(100 * (v.missing || 0) / Math.max(1, v.n), 0)}%)` : ""}</p></div>`;
      if (v.type === "cat" || v.type === "multi" || v.type === "text") {
        const cnt = new Map(); rows.forEach(r => { const x = r[v.id]; (Array.isArray(x) ? x : x == null ? [] : [x]).forEach(y => cnt.set(y, (cnt.get(y) || 0) + 1)); });
        // valores antes da recodificação (para poder desfazer)
        Object.entries(rec).forEach(([from]) => { if (!cnt.has(from)) cnt.set(from, 0); });
        const vals = [...cnt.entries()].sort((a, b) => b[1] - a[1]);
        h += `<div class="painelf"><h4 style="margin:0 0 4px;font:700 16px var(--f-display)">${v.type === "text" ? "Respostas em texto" : "Categorias"}</h4><p class="note">${v.type === "text" ? "Para usar este campo em gráficos e testes, mude o tipo para “Categoria” e agrupe as respostas parecidas." : "Escreva o novo nome em “Juntar em” para unir categorias (por exemplo, duas grafias do mesmo serviço). Deixe “(sem resposta)” para descartar um valor."} ${v.derived ? "<b>Variável calculada: a recodificação não se aplica.</b>" : ""}</p>
          ${v.type !== "text" && !v.derived ? `<datalist id="vDl">${vals.map(([x]) => `<option value="${esc(x)}">`).join("")}</datalist>` : ""}
          <div class="tw"><table class="t"><thead><tr><th>Valor</th><th class="n">n</th>${v.type !== "text" && !v.derived ? "<th>Juntar em</th>" : ""}</tr></thead><tbody>${vals.slice(0, 300).map(([x, n]) => {
            const orig = Object.keys(rec).filter(k => rec[k] === x && k !== x);
            return `<tr><td>${esc(x)}${orig.length ? `<div class="note">juntou: ${orig.map(esc).join(", ")}</div>` : ""}${rec[x] !== undefined ? `<div class="note">→ ${esc(rec[x] || "(sem resposta)")}</div>` : ""}</td><td class="n">${n}</td>${v.type !== "text" && !v.derived ? `<td><input type="text" list="vDl" data-from="${esc(x)}" value="${esc(rec[x] ?? "")}" placeholder="manter" style="width:100%">${rec[x] !== undefined ? ` <button type="button" class="ghost small" data-undo="${esc(x)}">desfazer</button>` : ""}</td>` : ""}</tr>`;
          }).join("")}</tbody></table></div>${v.type !== "text" && !v.derived ? `<div class="row" style="margin-top:10px"><button class="primary" type="button" id="vRec">Aplicar recodificação</button></div>` : ""}</div>`;
      } else if (v.type === "num") {
        h += `<div class="painelf"><div class="ch" id="vCh"></div></div>`;
      }
      el.innerHTML = h;
      if (v.type === "num") mount($("#vCh"), () => CH.hist($("#vCh"), { values: rows.map(r => r[v.id]), xLabel: v.label }));
      $("#vHide").onchange = e => { const hd = st.cfg.hidden || (st.cfg.hidden = []); const i = hd.indexOf(v.id); e.target.checked ? (i < 0 && hd.push(v.id)) : (i >= 0 && hd.splice(i, 1)); saveCfg(); list(); };
      $("#vSave").onclick = () => { const l = $("#vLbl").value.trim(); if (l && l !== v.label) st.cfg.labels[v.id] = l; const ty = $("#vType"); if (ty && ty.value !== v.type) st.cfg.types[v.id] = ty.value; saveCfg(); rebuild(); render(); toast("Variável atualizada."); };
      const rb = $("#vRec"); if (rb) rb.onclick = () => { const r = st.cfg.recodes[v.id] = st.cfg.recodes[v.id] || {}; el.querySelectorAll("input[data-from]").forEach(i => { const to = i.value.trim(); if (to) r[i.dataset.from] = /^\(sem resposta\)$/i.test(to) ? "" : to; }); saveCfg(); rebuild(); render(); toast("Recodificação aplicada em todas as telas."); };
      el.querySelectorAll("[data-undo]").forEach(bt => bt.onclick = () => { delete st.cfg.recodes[v.id][bt.dataset.undo]; saveCfg(); rebuild(); render(); });
    };
    det();
  }

  // ---------------- EXPORTAR
  function pageExportar(pg) {
    const m = st.model;
    pg.innerHTML = `<div class="cab"><div><h2>Exportar</h2><p>Base limpa para o SPSS, o R, o Jamovi ou o Excel, com o dicionário de variáveis. Por padrão os arquivos saem <b>sem identificação</b>: nomes, datas de nascimento, bairro, fotos e e-mails ficam de fora; cada pessoa é identificada pelo código EITA (os 6 primeiros caracteres do identificador do Epicollect).</p></div></div>
      <div class="painelf"><div class="campos"><label>Tabela<select id="xT">${Object.values(m.tables).map(t => `<option value="${t.id}"${t.id === st.table ? " selected" : ""}>${esc(t.label)} (${t.rows.length} ${esc(t.unidade)})</option>`).join("")}</select></label>
        <label>Linhas<select id="xR"><option value="f">Só as que passam pelos filtros</option><option value="a">Todas</option></select></label>
        <label>Cabeçalho<select id="xH"><option value="l">Rótulos legíveis</option><option value="c">Códigos curtos (melhor para R/SPSS)</option></select></label>
        <label>Separador do CSV<select id="xS"><option value=";"${st.cfg.sep === ";" ? " selected" : ""}>Ponto e vírgula, decimal com vírgula (Excel em português)</option><option value=","${st.cfg.sep === "," ? " selected" : ""}>Vírgula, decimal com ponto (R, Python)</option></select></label></div>
        <div class="row" style="margin-top:12px"><label class="chk"><input type="checkbox" id="xTx"> Incluir respostas em texto livre</label><label class="chk"><input type="checkbox" id="xP"> Incluir dados de identificação</label></div>
        <div id="xWarn"></div>
        <div class="row" style="margin-top:14px"><button class="primary" type="button" id="xCsv">Baixar CSV</button><button type="button" id="xXlsx">Baixar Excel (dados + dicionário + qualidade)</button><button type="button" id="xDic">Baixar dicionário (CSV)</button></div></div>
      <div class="painelf"><h4 style="margin:0 0 6px;font:700 16px var(--f-display)">Regras de limpeza da equipe</h4><p class="note">Recodificações, rótulos, tipos, municípios completados e gráficos fixados ficam salvos neste navegador. Exporte o arquivo de regras e mande para quem também analisa os dados, para todos chegarem aos mesmos números.</p><div class="row"><button type="button" id="xCfg">Baixar regras (.json)</button><button type="button" id="xCfgIn">Carregar regras</button><input type="file" id="xCfgF" accept=".json" hidden></div></div>`;
    $("#xP").onchange = e => $("#xWarn").innerHTML = e.target.checked ? `<p class="box aviso" style="margin-top:10px">O arquivo terá nomes e datas de nascimento de crianças. Guarde em lugar protegido, conforme o termo de consentimento e a LGPD; não envie por e-mail nem anexe em artigo.</p>` : "";
    const build = () => { const tid = $("#xT").value, rows = $("#xR").value === "f" ? rowsOf(tid) : m.tables[tid].rows; return D.exportRows(m, tid, rows, { pii: $("#xP").checked, text: $("#xTx").checked, codes: $("#xH").value === "c", varIds: m.tables[tid].vars.filter(k => !V(k).virtual && !V(k).hide && !(V(k).type === "date" && !$("#xP").checked && V(k).pii)) }); };
    const fname = ext => `eita-dados_${$("#xT").value.replace(/^form-\d+__/, "")}_${new Date().toISOString().slice(0, 10)}.${ext}`;
    $("#xCsv").onclick = () => { const sep = $("#xS").value; st.cfg.sep = sep; saveCfg(); const e = build(); save(fname("csv"), D.toCSV(e.head, e.rows, sep, sep === ";" ? "," : ".")); };
    $("#xDic").onclick = () => { const d = D.dictionary(m, $("#xT").value).filter(x => !V(x.id).virtual); const sep = $("#xS").value; save(`dicionario_${fname("csv")}`, D.toCSV(Object.keys(d[0]), d.map(o => Object.values(o)), sep, ",")); };
    $("#xXlsx").onclick = async () => {
      try { await loadScript(XLSX_URL); } catch (e) { toast("Não consegui carregar o gerador de Excel. Use o CSV."); return; }
      const X = window.XLSX, e = build(), wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([e.head, ...e.rows]), "dados");
      const d = D.dictionary(m, $("#xT").value).filter(x => !V(x.id).virtual); X.utils.book_append_sheet(wb, X.utils.json_to_sheet(d), "dicionario");
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(m.quality.map(q => ({ tipo: q.sev, id: q.pid || "", variavel: q.var ? lbl(q.var) : "", valor: q.val, ocorrencia: q.msg }))), "qualidade");
      save(fname("xlsx"), new Blob([X.write(wb, { type: "array", bookType: "xlsx" })]));
    };
    $("#xCfg").onclick = () => save("eita-dados_regras.json", JSON.stringify({ app: "EITA! DADOS", versao: VERSAO, regras: { recodes: st.cfg.recodes, types: st.cfg.types, labels: st.cfg.labels, hidden: st.cfg.hidden, pins: st.cfg.pins, municipios: st.cfg.municipios } }, null, 2));
    $("#xCfgIn").onclick = () => $("#xCfgF").click();
    $("#xCfgF").onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); const r = j.regras || j; ["recodes", "types", "labels", "hidden", "pins", "municipios"].forEach(k => { if (r[k]) st.cfg[k] = r[k]; }); saveCfg(); rebuild(); render(); toast("Regras carregadas."); } catch (er) { toast("Arquivo de regras inválido."); } };
  }

  // ---------------- DADOS (carregar)
  function pageDados(pg) {
    const m = st.model;
    pg.innerHTML = `<div class="cab"><div><h2>Dados</h2><p>Carregue a exportação do Epicollect5. Os arquivos são lidos <b>só neste navegador</b>: nada é enviado para servidores, nem para o Claude.</p></div></div>
      <div class="drop" id="drop" tabindex="0" role="button"><b>Solte aqui o .zip exportado do Epicollect</b>ou os arquivos .json de cada formulário · clique para escolher<br><span class="note">No Epicollect: projeto → Download → formato JSON → todas as fichas. Pode incluir também a “definição do projeto” para trazer os enunciados completos das perguntas.</span></div>
      <input type="file" id="fi" accept=".zip,.json,application/json,application/zip" multiple hidden>
      <div id="dInfo" style="margin-top:16px"></div>`;
    const drop = $("#drop"), fi = $("#fi");
    drop.onclick = () => fi.click(); drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fi.click(); } };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("hover"); }; drop.ondragleave = () => drop.classList.remove("hover");
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove("hover"); loadFiles([...e.dataTransfer.files]); };
    fi.onchange = () => loadFiles([...fi.files]);
    if (m) {
      $("#dInfo").innerHTML = `<div class="painelf"><h4 style="margin:0 0 8px;font:700 16px var(--f-display)">Base carregada</h4><table class="t" style="max-width:820px"><thead><tr><th>Formulário</th><th class="n">Registros</th><th>Ligação</th><th>Vira</th></tr></thead><tbody>${m.forms.map(f => `<tr><td>${esc(f.nome)}<div class="note">${esc(f.slug)}</div></td><td class="n">${f.n}</td><td>${f.rel === "raiz" ? "ficha principal" : f.rel === "1:1" ? "uma por participante" : "várias por participante"}${f.orphans ? ` · <span class="badge aviso">${f.orphans} sem vínculo</span>` : ""}</td><td>${f.rel === "1:n" ? "tabela própria (" + esc(m.tables[f.slug].unidade) + ")" : "colunas da tabela de participantes"}</td></tr>`).join("")}</tbody></table>
        <p class="note">Os formulários são ligados pela cadeia de identificadores do Epicollect (cada ficha filha aponta para a mãe). Arquivos lidos: ${st.raw.map(r => esc(r.name)).join(", ")}${st.defs.length ? " + definição do projeto" : ""}.</p>
        <div class="row" style="margin-top:12px"><label class="chk"><input type="checkbox" id="dPer"${st.cfg.persist ? " checked" : ""}> Guardar a base neste navegador para a próxima visita</label><button type="button" class="ghost" id="dDel">Apagar a base deste navegador</button></div>
        <p class="note">A base guardada contém dados identificáveis. Desmarque em computadores compartilhados.</p></div>
        <div class="painelf"><h4 style="margin:0 0 8px;font:700 16px var(--f-display)">Regras de inclusão</h4>
        <label class="chk"><input type="checkbox" id="dDup"${st.cfg.excludeDup !== false ? " checked" : ""}> Excluir fichas duplicadas (mesmo nome e nascimento, menos de 30 dias entre as avaliações) · ${m.tables.part.rows.filter(r => r._dup).length} na base</label><br>
        <label class="chk" style="margin-top:6px"><input type="checkbox" id="dFirst"${st.cfg.firstOnly !== false ? " checked" : ""}> Usar só a 1ª avaliação de cada pessoa nas análises (as reavaliações entram em “Antes e depois”) · ${m.tables.part.rows.filter(r => !r._dup && r._mom > 1).length} reavaliação(ões) na base</label>
        <p class="note">Essas regras valem para todas as telas e aparecem no fluxograma e no relatório.</p></div>`;
      $("#dPer").onchange = async e => { st.cfg.persist = e.target.checked; saveCfg(); try { if (st.cfg.persist) await idbPut({ raw: st.raw, defs: st.defs }); else await idbDel(); } catch (er) { } toast(st.cfg.persist ? "A base fica guardada neste navegador." : "A base não será guardada."); };
      $("#dDup").onchange = e => { st.cfg.excludeDup = e.target.checked; saveCfg(); toast("Regra aplicada em todas as telas."); };
      $("#dFirst").onchange = e => { st.cfg.firstOnly = e.target.checked; saveCfg(); toast("Regra aplicada em todas as telas."); };
      $("#dDel").onclick = async () => { await idbDel().catch(() => { }); st.raw = []; st.defs = []; st.model = null; st.filters = {}; renderNav(); render(); toast("Base apagada deste navegador."); };
    }
  }
  async function loadFiles(files) {
    const out = [], defs = [];
    try {
      for (const f of files) {
        if (/\.zip$/i.test(f.name)) {
          await loadScript(JSZIP); const z = await window.JSZip.loadAsync(f);
          for (const [name, entry] of Object.entries(z.files)) { if (entry.dir || !/\.json$/i.test(name) || /__MACOSX/.test(name)) continue; out.push({ name: name.split("/").pop(), json: JSON.parse(await entry.async("string")) }); }
        } else if (/\.json$/i.test(f.name)) out.push({ name: f.name, json: JSON.parse(await f.text()) });
      }
    } catch (e) { toast("Não consegui ler: " + e.message, 6000); return; }
    const forms = out.filter(o => o.json && Array.isArray(o.json.data)); out.filter(o => !(o.json && Array.isArray(o.json.data))).forEach(o => defs.push(o.json.data && o.json.data.project ? o.json.data.project : o.json.project || o.json));
    if (!forms.length && defs.length && st.raw.length) { st.defs = defs; } // só a definição do projeto
    else if (!forms.length) { toast("Nenhum formulário do Epicollect encontrado nesses arquivos.", 5000); return; }
    else { st.raw = forms; if (defs.length) st.defs = defs; }
    try { rebuild(); } catch (e) { toast("Erro ao montar a base: " + e.message, 7000); console.error(e); return; }
    if (st.cfg.persist) idbPut({ raw: st.raw, defs: st.defs }).catch(() => { });
    toast(`Base carregada: ${st.model.tables.part.rows.length} participantes.`); renderNav();
    if (st.page === "dados") location.hash = "painel"; else render();
  }

  // ---------------- COMO CALCULAMOS
  function pageMetodos(pg) {
    pg.innerHTML = `<div class="cab"><div><h2>Como calculamos</h2><p>Referência das regras usadas pela ferramenta, para conferir e citar nos métodos.</p></div></div>
    <div class="painelf" style="line-height:1.6;max-width:900px">
      <h3 class="sec" style="margin-top:0">Ligação dos formulários</h3><p>Cada registro do Epicollect tem um identificador (<code>ec5_uuid</code>) e, nos formulários filhos, o identificador do registro-mãe (<code>ec5_parent_uuid</code>). A ferramenta sobe essa cadeia até a ficha de anamnese. Formulários com no máximo um registro por participante (B-IPQ, SF-36) viram colunas da tabela de participantes; os que podem ter vários (B-QUEST, um por dispositivo) viram uma tabela própria, que também carrega os dados do participante.</p>
      <h3 class="sec">Limpeza automática</h3><ul><li>Espaços extras, maiúsculas e acentos: grafias diferentes da mesma resposta são unidas na forma mais frequente (“Goias”, “Góias” → “Goiás”).</li><li>Códigos 999 e 9999 = sem resposta.</li><li>Peso em gramas convertido para kg; valores abaixo de 200 lidos como já digitados em kg; zero = sem resposta.</li><li>Faixas plausíveis: altura 40–210 cm; peso 2–150 kg; Apgar 0–10; comprimento ao nascer 25–60 cm; peso ao nascer 300–6500 g; IMC 8–60. Fora disso, o valor vira “sem resposta” e aparece em Qualidade.</li><li>Textos lidos como número: idade gestacional (“38 semanas e 5 dias” = 38,7), peso ao nascer (“2,115 kg” = 2115 g), duração do parto (horas) e dias de UTIN/UCIN (1 mês = 30 dias).</li><li>Idade = data da avaliação − data de nascimento.</li></ul>
      <h3 class="sec">Escores dos instrumentos</h3>
      <p><b>B-IPQ (Brief Illness Perception Questionnaire)</b>: itens de 0 a 10. Escore total (0–80) = itens 1 (consequências) + 2 (duração) + 5 (identidade) + 6 (preocupação) + 8 (resposta emocional) + (10 − item 3, controle pessoal) + (10 − item 4, controle do tratamento) + (10 − item 7, compreensão). Maior = percepção mais ameaçadora. O item adicional de responsabilidade (pergunta 91) e a questão aberta de causas não entram. Só é calculado com os 8 itens respondidos.</p>
      <p><b>SF-36</b>: Raw Scale da versão brasileira (Ciconelli et al., 1999). Fase 1, ponderação: questão 1 (1→5,0; 2→4,4; 3→3,4; 4→2,0; 5→1,0); questão 6 invertida; questão 7 (1→6,0; 2→5,4; 3→4,2; 4→3,1; 5→2,0; 6→1,0); questão 8 dependente da 7; itens 9a, 9d, 9e, 9h invertidos; 11b e 11d invertidos. Fase 2: domínio = (valor obtido − menor valor possível) ÷ variação × 100. Limites e variações: capacidade funcional 10/20; limitação por aspectos físicos 4/4; dor 2/10; estado geral 5/20; vitalidade 4/20; aspectos sociais 2/8; limitação por aspectos emocionais 3/3; saúde mental 5/25. Itens em branco são preenchidos pela média dos respondidos do mesmo domínio quando ao menos metade foi respondida. A pergunta 107 foi tratada como o item 3c (levantar ou carregar mantimentos) — confirme no formulário.</p>
      <p><b>B-QUEST 2.0</b>: itens de 1 a 5. Dispositivo = média dos itens 1–8 (mínimo 6 respondidos); serviços = média dos itens 9–12 (mínimo 3); total = média dos 12 itens (mínimo 9).</p>
      <p><b>Escore motor do laboratório</b> (exploratório, não validado): cada tarefa motora da ficha pontuada pela posição na escala (0 = não consegue/não realiza … máximo = sem ajuda/independente), somada e expressa em % do máximo possível.</p>
      <h3 class="sec">Testes estatísticos</h3>
      <ul><li>Normalidade: Shapiro-Wilk (algoritmo de Royston). No modo automático, o teste paramétrico é usado só quando todos os grupos têm p ≥ 0,05 e ao menos 3 casos.</li><li>Dois grupos: t de Welch (com g de Hedges) ou Mann-Whitney (com r = |z|/√N; correção de continuidade e de empates).</li><li>Três ou mais grupos: ANOVA de uma via (ou de Welch se Levene p &lt; 0,05), com η²; ou Kruskal-Wallis, com ε². Pós-teste: t de Welch par a par ou Dunn, com correção de Holm.</li><li>Categorias: qui-quadrado de Pearson (Yates em 2×2), exato de Fisher em 2×2 com esperado &lt; 5, e qui-quadrado com p por Monte Carlo (20.000 simulações) em tabelas maiores com mais de 20% das caselas com esperado &lt; 5. V de Cramér.</li><li>Correlação: Pearson (com IC 95% por transformação de Fisher) ou Spearman.</li><li>Regressão linear múltipla por mínimos quadrados, com IC 95%, β padronizado e teste de normalidade dos resíduos.</li><li>Regressão logística por máxima verossimilhança (IRLS), com razões de chances, IC 95% de Wald, teste da razão de verossimilhança e R² de Nagelkerke.</li><li>Antes e depois: t pareado (d<sub>z</sub>) ou Wilcoxon de postos sinalizados (diferenças zero descartadas; r = |z|/√n), conforme a normalidade das diferenças. Reavaliação = mesma pessoa (nome e nascimento) com nova ficha ao menos 30 dias depois; com menos de 30 dias, a ficha é tratada como duplicata.</li><li>SF-36 × normas: t ou Wilcoxon para uma amostra contra as médias normativas de Cruz et al. (2013), Porto Alegre, 20–64 anos, n = 755 (Ciênc Saúde Coletiva 18(7):1911-21); escore z = (escore − média normativa) ÷ DP normativo.</li><li>Dados ausentes: proporção por variável e por participante, padrões de ausência e comparação de quem respondeu com quem não respondeu.</li><li>Alfa de Cronbach, correlação item-total corrigida e alfa sem o item.</li><li>Interpretação dos efeitos: Cohen (d: 0,2/0,5/0,8; r: 0,1/0,3/0,5; η²/ε²: 0,01/0,06/0,14).</li></ul>
      <p class="note">As rotinas foram conferidas contra o SciPy 1.18 (mesmos valores de estatística e de p até a 6ª casa). Rótulos com * foram reconstruídos a partir dos nomes curtos que o Epicollect exporta; carregue a definição do projeto ou corrija na tela Variáveis.</p>
    </div>
    <div class="rodape"><img class="lab" src="assets/logo-labeita.png" alt="Lab.EITA"><img src="assets/logo-ufg.png" alt="Universidade Federal de Goiás"><img src="assets/logo-mcti.png" alt="Ministério da Ciência, Tecnologia e Inovação — Governo do Brasil"><p><b>EITA! DADOS ${VERSAO}</b> · Laboratório de Estudos Inventivos em Tecnologias Assistivas da Universidade Federal de Goiás (Lab.EITA/UFG). Ferramenta de apoio à pesquisa; confira as análises antes de publicar.</p></div>`;
  }

  // ---------------- navegação
  function renderNav() {
    const m = st.model;
    $("#baseInfo").innerHTML = m ? `<b>${m.tables.part.rows.length} participantes</b><br>${m.forms.map(f => `${esc(f.nome.replace(/\s*\(.*\)/, ""))}: ${f.n}`).join("<br>")}<br>Última ficha: ${esc((m.tables.part.rows.map(r => r.d_data).filter(Boolean).sort().pop() || "").split("-").reverse().join("/"))}<br><span style="opacity:.8">Dados só neste navegador.</span>` : "Nenhuma base carregada.";
    const qe = m ? m.quality.filter(q => q.sev === "erro").length : 0; $("#qCnt").hidden = !qe; $("#qCnt").textContent = qe;
  }
  function render() {
    const p = (location.hash || "#painel").slice(1); st.page = ["painel", "mapa", "explorar", "estatistica", "tabela1", "fluxo", "relatorio", "guia", "qualidade", "variaveis", "exportar", "dados", "metodos"].includes(p) ? p : "painel";
    $$("#nav a").forEach(a => a.classList.toggle("cur", a.dataset.p === st.page));
    const pg = $("#pag"); ro.disconnect(); const tp = document.querySelector(".ch-tip"); if (tp) tp.style.display = "none";
    if (!st.model && !["dados", "metodos", "guia"].includes(st.page)) { st.page = "dados"; }
    renderTopo();
    try { ({ painel: pagePainel, mapa: pageMapa, explorar: pageExplorar, estatistica: pageEstat, tabela1: pageTabela1, fluxo: pageFluxo, relatorio: pageRelatorio, guia: pageGuia, qualidade: pageQualidade, variaveis: pageVariaveis, exportar: pageExportar, dados: pageDados, metodos: pageMetodos })[st.page](pg); }
    catch (e) { console.error(e); pg.innerHTML = `<p class="box erro">Algo deu errado nesta tela: ${esc(e.message)}</p>`; }
  }
  window.addEventListener("hashchange", () => { $("#pag").scrollTop = 0; window.scrollTo(0, 0); $("#nav").classList.remove("aberto"); $("#navBtn").setAttribute("aria-expanded", "false"); $("#navBtn").textContent = "Menu"; render(); });
  $("#navBtn").addEventListener("click", () => { const o = $("#nav").classList.toggle("aberto"); $("#navBtn").setAttribute("aria-expanded", String(o)); $("#navBtn").textContent = o ? "Fechar" : "Menu"; });

  // aberto dentro de outro site (ex.: Google Sites incorporando o GitHub Pages): oferece a tela cheia,
  // onde o navegador guarda a base e baixa os arquivos sem as restrições do quadro incorporado
  try {
    if (window.top !== window.self && /github\.io$/.test(location.hostname)) {
      const bar = document.createElement("div"); bar.className = "emquadro noprint";
      bar.innerHTML = `Dentro de outro site, o navegador pode não guardar a base nem baixar arquivos. <a href="${esc(location.href.split("#")[0])}" target="_blank" rel="noopener">Abrir o EITA! DADOS em tela cheia ↗</a>`;
      document.body.prepend(bar);
    }
  } catch (e) { }

  // início
  (async () => {
    renderNav(); render(); repLoad();
    try { const b = await idbGet(); if (b && b.raw && b.raw.length && !st.raw.length) { st.raw = b.raw; st.defs = b.defs || []; rebuild(); renderNav(); render(); } } catch (e) { }
  })();
  window.EITA_DADOS = { st, loadFiles, rebuild, render }; // para testes
})();
