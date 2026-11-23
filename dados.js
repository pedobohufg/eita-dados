/*
  EITA! DADOS — leitura das exportações do Epicollect5, limpeza, variáveis derivadas e escores
  Tudo roda no navegador: nenhum dado sai do computador.
  © 2026 Lab.EITA/UFG. Autor: Pedro Henrique Gonçalves. Todos os direitos reservados.
*/
(function (root) {
  "use strict";
  const S = root.EStats, I = root.EInstr;
  const D = {};
  const MISSING_CODES = new Set([999, 9999, 99999, 999999]);
  const META = new Set(["ec5_uuid", "ec5_parent_uuid", "ec5_branch_owner_uuid", "created_at", "uploaded_at", "created_by", "title"]);

  // ---------- texto
  const deacc = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  D.key = s => deacc(String(s)).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const tidy = s => String(s).replace(/\s+/g, " ").trim();
  const parseNumText = s => { // "1,95" -> 1.95 ; "1.555" -> 1555? (ponto como milhar quando 3 dígitos)
    s = String(s).trim(); const m = s.match(/-?\d+(?:[.,]\d+)?/); if (!m) return NaN;
    let t = m[0];
    if (/^\d{1,3}\.\d{3}$/.test(t)) t = t.replace(".", ""); else t = t.replace(",", ".");
    return parseFloat(t);
  };
  D.parseNumText = parseNumText;
  const leadNum = s => { const m = String(s).trim().match(/^(-?\d+(?:[.,]\d+)?)(?:\s*[-–]\s*|\s*$|\s+)/); return m ? parseFloat(m[1].replace(",", ".")) : NaN; };
  const parseDate = s => {
    if (!s) return null; const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) { const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
    const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10);
  };
  D.parseDate = parseDate;
  const years = (a, b) => (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5);
  const hash6 = s => String(s).replace(/-/g, "").slice(0, 6).toUpperCase();

  // durações em texto -> minutos / dias / semanas
  D.parseMinutes = s => {
    s = deacc(String(s || "")).toLowerCase().trim(); if (!s) return NaN;
    if (/^9{3,}$/.test(s)) return NaN;
    let m;
    if ((m = s.match(/(\d+)\s*-\s*(\d+)\s*(h|hora|hr)/))) return (+m[1] + +m[2]) / 2 * 60;
    if ((m = s.match(/(\d+)\s*-\s*(\d+)\s*min/))) return (+m[1] + +m[2]) / 2;
    if ((m = s.match(/(\d+)\s*dia/))) return +m[1] * 1440;
    if ((m = s.match(/^(\d+):(\d{2})/))) return +m[1] * 60 + +m[2];
    let tot = 0, ok = false;
    if ((m = s.match(/(\d+(?:[.,]\d+)?)\s*(h\b|h\d|hs?\b|hrs?|horas?)/))) { tot += parseFloat(m[1].replace(",", ".")) * 60; ok = true; if (/e meia/.test(s)) tot += 30; }
    if ((m = s.match(/(?:h|hrs?|horas?)\s*(?:e\s*)?(\d+)\s*(min)?/)) && ok) tot += +m[1];
    else if ((m = s.match(/(\d+)\s*min/))) { tot += +m[1]; ok = true; }
    return ok ? tot : NaN;
  };
  D.parseDays = s => {
    s = deacc(String(s || "")).toLowerCase().trim(); if (!s || /^9{3,}$/.test(s)) return NaN;
    let tot = 0, ok = false, m;
    if ((m = s.match(/(\d+|um|uma)\s*m[eê]s(es)?/))) { tot += (m[1] === "um" || m[1] === "uma" ? 1 : +m[1]) * 30; ok = true; if (/e meio/.test(s)) tot += 15; }
    if ((m = s.match(/(\d+)\s*semana/))) { tot += +m[1] * 7; ok = true; }
    if ((m = s.match(/(\d+)\s*dia/))) { tot += +m[1]; ok = true; }
    if (!ok && (m = s.match(/^(\d+)\s*$/))) { tot = +m[1]; ok = true; }
    if (!ok && (m = s.match(/(?:aproximadamente|quase|cerca de)\s*(\d+)/))) { tot = +m[1]; ok = true; }
    return ok ? tot : NaN;
  };
  D.parseGestWeeks = s => {
    s = deacc(String(s || "")).toLowerCase().trim(); if (!s || /^9{3,}$/.test(s)) return NaN;
    const m = s.match(/^(\d{2})(?:\s*(?:s|sem|semanas?)?\s*(?:e|\+)?\s*(\d)\s*(?:d|dias?))?/); if (!m) return NaN;
    const w = +m[1] + (m[2] ? +m[2] / 7 : 0); return w >= 20 && w <= 45 ? w : NaN;
  };
  D.parseBirthWeight = s => { // gramas
    const t = String(s || "").trim(); if (!t || /^9{3,}$/.test(t)) return NaN;
    let v = parseNumText(t); if (!isFinite(v)) return NaN;
    if (v < 10) v *= 1000; // digitado em kg (1,95 / 2 kg / 3.290 kg)
    return v;
  };

  // ---------- leitura dos arquivos
  D.readEpicollect = files => { // files: [{name, json}]
    const forms = [], defs = [];
    for (const f of files) {
      const j = f.json;
      if (j && j.data && Array.isArray(j.data)) {
        const slug = f.name.replace(/\.json$/i, "").replace(/^.*\//, "");
        const ord = (slug.match(/form-(\d+)/) || [0, 99])[1];
        const known = I.FORMS.find(k => k.re.test(slug));
        forms.push({ slug, ord: +ord, nome: f.planilha || (known ? known.nome : slug.replace(/^form-\d+__/, "").replace(/[-_]+/g, " ")), unidade: known ? known.unidade : (f.planilha ? "registros" : undefined), planilha: f.planilha || null, interesse: !!f.interesse, records: j.data });
      } else if (j && j.data && j.data.project) defs.push(j.data.project); // definição do projeto
      else if (j && j.project && j.project.forms) defs.push(j.project);
    }
    forms.sort((a, b) => a.ord - b.ord);
    return { forms, defs };
  };

  // ---------- planilhas (CSV do Epicollect, .csv e .xlsx quaisquer)
  D.parseCSV = text => {
    text = String(text).replace(/^﻿/, "");
    const first = text.split(/\r?\n/, 1)[0] || "", cnt = c => (first.match(new RegExp(c === "|" ? "\\|" : c, "g")) || []).length;
    const sep = [";", ",", "\t"].sort((a, b) => cnt(b) - cnt(a))[0];
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    const clean = rows.filter(r => r.some(c => String(c).trim() !== ""));
    return { head: (clean[0] || []).map(h => tidy(h)), rows: clean.slice(1), sep };
  };
  // valor de célula de planilha → texto/número no formato do Epicollect
  const celula = v => {
    if (v instanceof Date) { if (isNaN(v)) return ""; return String(v.getDate()).padStart(2, "0") + "/" + String(v.getMonth() + 1).padStart(2, "0") + "/" + v.getFullYear(); }
    if (v === true) return "Sim"; if (v === false) return "Não";
    if (v == null) return ""; return typeof v === "number" ? v : String(v).trim();
  };
  D.celula = celula;
  D.ehEpicollect = head => head.includes("ec5_uuid");
  // CSV exportado pelo Epicollect: mesmas chaves do JSON; múltipla escolha vem numa célula, separada por vírgula
  D.deEpicollectCSV = (nome, head, rows) => {
    const data = rows.map(r => { const o = {}; head.forEach((h, i) => { let v = celula(r[i]); if (h && I.F[h] && I.F[h].type === "multi") v = v === "" ? [] : String(v).split(/\s*,\s+/).map(tidy).filter(Boolean); o[h] = v; }); return o; });
    return { name: nome.replace(/\.(csv|tsv|txt|xlsx?|ods)$/i, ".json"), json: { data } };
  };
  // identificador estável no formato de uuid, a partir de um texto (código do participante ou aba + linha)
  D.uuidDe = txt => { let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x7f4a7c15; const s = String(txt);
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193); h2 = Math.imul(h2 ^ c, 0x5bd1e995); h3 = Math.imul(h3 ^ c, 0x27d4eb2d); h4 = Math.imul(h4 ^ c, 0x165667b1); }
    const x = [h1, h2, h3, h4].map(h => (h >>> 0).toString(16).padStart(8, "0")).join(""); return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-8${x.slice(17, 20)}-${x.slice(20, 32)}`; };
  // planilha qualquer: uma aba principal (uma linha por participante) e abas ligadas por uma coluna de código
  // abas: [{nome, head, rows}]; cfg: {principal, idCol, ligacoes: {indiceDaAba: coluna}}
  D.dePlanilhas = (abas, cfg) => {
    const slug = t => D.key(t).slice(0, 30) || "aba";
    const p = abas[cfg.principal], idI = cfg.idCol ? p.head.indexOf(cfg.idCol) : -1, out = [], porCodigo = new Map(), vistos = new Map();
    const reg = (aba, r, extra) => { const o = Object.assign({}, extra); aba.head.forEach((h, i) => { if (h) o[h] = celula(r[i]); }); return o; };
    const dataP = p.rows.map((r, i) => {
      const cod = idI >= 0 ? String(celula(r[idI])) : "";
      let base = cod ? "id:" + D.key(cod) : `linha:${p.nome}:${i}`; const n = (vistos.get(base) || 0) + 1; vistos.set(base, n); if (n > 1) base += "#" + n;
      const u = D.uuidDe(base); if (cod && !porCodigo.has(D.key(cod))) porCodigo.set(D.key(cod), u);
      const o = reg(p, r, { ec5_uuid: u }); if (idI >= 0) { o["Código do participante (" + p.head[idI] + ")"] = o[p.head[idI]]; delete o[p.head[idI]]; }
      return o;
    });
    out.push({ name: `form-1__${slug(p.nome)}.json`, json: { data: dataP }, planilha: p.nome });
    const usados = new Set(p.head);
    abas.forEach((a, k) => {
      if (k === cfg.principal) return; const col = cfg.ligacoes && cfg.ligacoes[k]; if (!col) return;
      const li = a.head.indexOf(col); if (li < 0) return;
      const data = a.rows.map((r, i) => {
        const cod = D.key(String(celula(r[li]))), pai = porCodigo.get(cod) || null;
        const o = { ec5_uuid: D.uuidDe(`linha:${a.nome}:${i}`), ec5_parent_uuid: pai || D.uuidDe("sem-par:" + cod) };
        a.head.forEach((h, j) => { if (!h || j === li) return; const nomeCol = usados.has(h) ? `${h} (${a.nome})` : h; o[nomeCol] = celula(r[j]); });
        return o;
      });
      out.push({ name: `form-${out.length + 1}__${slug(a.nome)}.json`, json: { data }, planilha: a.nome });
    });
    return out;
  };
  // colunas que identificam pessoas (planilhas e formulários fora dos conhecidos)
  D.pareceIdentificacao = lbl => /\b(nome|e-?mail|telefone|celular|whats|cpf|rg|cns|cart[aã]o sus|endere[cç]o|rua|bairro|cep|foto|assinatura|prontu[aá]rio|c[oó]digo do participante)\b|nascimento/i.test(deacc(String(lbl)).replace(/_/g, " ")) || /nome|nascimento|endere|telefone|e-?mail/i.test(deacc(String(lbl)));

  // enunciados completos a partir da definição do projeto do Epicollect (opcional)
  function labelsFromDefs(defs) {
    const out = [];
    const walk = inputs => (inputs || []).forEach(inp => { if (inp.question) out.push(tidy(inp.question.replace(/<[^>]+>/g, ""))); walk(inp.branch); walk(inp.group); });
    defs.forEach(p => (p.forms || []).forEach(f => walk(f.inputs)));
    return out;
  }

  // ---------- modelo
  D.build = function (forms, opts) {
    opts = opts || {}; D.sfDomains = D.sfItems = D.bipqItems = D.questItems = D.munField = null; D.nReav = 0; const recodes = opts.recodes || {}; const defLabels = labelsFromDefs(opts.defs || []);
    const vars = {}, quality = [], log = [];
    const addVar = (id, m) => { vars[id] = Object.assign({ id, type: "cat", section: "Outros", label: id }, vars[id] || {}, m); return vars[id]; };
    const Q = (sev, varId, pid, msg, val) => quality.push({ sev, var: varId, pid, msg, val: val === undefined ? "" : String(val) });

    // índice de registros
    const byUuid = new Map(); forms.forEach((f, fi) => f.records.forEach(r => byUuid.set(r.ec5_uuid, { fi, r })));
    const rootIdx = forms.findIndex(f => f.records.length && f.records.every(r => !r.ec5_parent_uuid));
    if (rootIdx < 0) throw new Error("Não encontrei o formulário principal (aquele cujos registros não têm 'ec5_parent_uuid').");
    const rootOf = r => { let cur = r, guard = 0; while (cur && cur.ec5_parent_uuid && guard++ < 20) { const p = byUuid.get(cur.ec5_parent_uuid); if (!p) return null; cur = p.r; } return cur; };

    // relação de cada formulário com o participante
    forms.forEach((f, fi) => {
      const cnt = new Map(); let orphan = 0;
      f.records.forEach(r => { const ro = rootOf(r); if (!ro) { orphan++; return; } cnt.set(ro.ec5_uuid, (cnt.get(ro.ec5_uuid) || 0) + 1); });
      f.rel = fi === rootIdx ? "raiz" : Math.max(0, ...cnt.values()) > 1 ? "1:n" : "1:1"; f.orphans = orphan; f.linked = cnt.size;
      if (orphan) Q("aviso", null, null, `${orphan} registro(s) de "${f.nome}" sem ficha principal correspondente (vínculo perdido)`, f.nome);
    });

    // tipos dos campos
    const fieldsOf = f => { const ks = []; f.records.forEach(r => Object.keys(r).forEach(k => { if (!META.has(k) && !ks.includes(k)) ks.push(k); })); return ks; };
    const inferType = vals => {
      const ne = vals.filter(v => !(v === "" || v == null || (Array.isArray(v) && false)));
      if (!ne.length) return "text";
      if (ne.some(Array.isArray)) return "multi";
      if (ne.every(v => typeof v === "number")) return "num";
      const st = ne.map(v => String(v).trim()).filter(Boolean);
      if (st.every(v => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v))) return "date";
      if (st.every(v => !isNaN(leadNum(v)) && /^\s*-?\d+([.,]\d+)?\s*(-.*)?$/.test(v))) return "num";
      const distinct = new Set(st.map(D.key)).size;
      if (distinct <= 15 || distinct <= st.length * 0.2) return "cat";
      return "text";
    };

    // normalização de categorias: junta variantes de grafia (acentos, maiúsculas, espaços)
    const canonMaps = {};
    const canon = (id, values, order, rec) => {
      const freq = new Map(); values.forEach(v => { const t = tidy(v); if (!t) return; const k = D.key(t); if (!freq.has(k)) freq.set(k, new Map()); const m = freq.get(k); m.set(t, (m.get(t) || 0) + 1); });
      const map = {}; freq.forEach((m, k) => { let best = null, bn = -1; m.forEach((n, t) => { if (n > bn) { bn = n; best = t; } }); map[k] = best; });
      (order || []).forEach(o => { const k = D.key(o); if (map[k]) map[k] = o; });
      canonMaps[id] = map; return map;
    };
    const applyRec = (id, v) => { const r = recodes[id]; if (r && Object.prototype.hasOwnProperty.call(r, v)) return r[v] === "" ? null : r[v]; return v; };

    const part = []; const pById = new Map();
    const tables = { part: { id: "part", label: "Participantes", unidade: "participantes", rows: part, vars: [] } };
    // participantes (formulário raiz)
    forms[rootIdx].records.forEach(r => {
      const row = { _uuid: r.ec5_uuid, _id: "EITA-" + hash6(r.ec5_uuid), _created: r.created_at, _by: r.created_by, _title: r.title };
      part.push(row); pById.set(r.ec5_uuid, row);
    });

    const evalPseudo = new Map(); [...new Set(forms.flatMap(f => f.records.map(r => r.created_by)).filter(Boolean))].sort().forEach((e, i) => evalPseudo.set(e, "Registrador " + String(i + 1).padStart(2, "0")));

    let defIdx = 0;
    forms.forEach((f, fi) => {
      const keys = fieldsOf(f);
      let target;
      if (f.rel === "1:n") { target = { id: f.slug, label: f.nome, unidade: f.unidade || "registros", rows: [], vars: [], form: f.nome }; tables[f.slug] = target; }
      keys.forEach(k => {
        const known = I.F[k] || {};
        const vals = f.records.map(r => r[k]);
        let type = (opts.types && opts.types[k]) || known.type || inferType(vals);
        const fromDef = defLabels.find(q => D.key(q).startsWith(D.key(k.replace(/^\d+_/, "")).slice(0, 12)));
        const label = known.label || (fromDef ? fromDef : tidy(k.replace(/^\d+_/, "").replace(/_/g, " ")));
        const piiGuess = !I.F[k] && D.pareceIdentificacao(label);
        if (piiGuess && type === "text" && vals.some(v => typeof v === "string" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v.trim()))) type = "date";
        const meta = addVar(k, { label, fullQuestion: fromDef || null, section: known.section || f.nome, type, form: f.nome, formSlug: f.slug, source: f.planilha ? "Planilha" : "Epicollect", pii: !!known.pii || piiGuess, hide: !!known.hide, unit: known.unit || "", raw: true, key: k, desc: known.desc || undefined });
        if (type === "cat") meta.levelsOrder = known.order || null; if (opts.types && opts.types[k]) meta.typeOverride = true;
        if (type === "cat" || type === "multi") {
          const flat = type === "multi" ? vals.flatMap(v => Array.isArray(v) ? v : (v ? [v] : [])) : vals.filter(v => typeof v === "string");
          canon(k, flat, known.order);
        }
        (target ? target.vars : tables.part.vars).push(k);
        if (known.recode) recodes[k] = Object.assign({}, known.recode, recodes[k] || {});
      });
      // valores
      f.records.forEach(r => {
        const ro = rootOf(r); const prow = ro && pById.get(ro.ec5_uuid); if (!prow) return;
        let row = prow;
        if (target) { row = Object.create(null); row._uuid = r.ec5_uuid; row._pid = prow._id; row._prow = prow; row._id = prow._id + "·" + hash6(r.ec5_uuid).slice(0, 4); target.rows.push(row); }
        else if (fi !== rootIdx) row["_has_" + f.slug] = true;
        row["_by_" + f.slug] = evalPseudo.get(r.created_by) || null;
        row["_created_" + f.slug] = r.created_at;
        keys.forEach(k => {
          const meta = vars[k], known = I.F[k] || {}; let v = r[k];
          if (meta.type === "multi") {
            const arr = (Array.isArray(v) ? v : (v ? [v] : [])).map(x => { const t = tidy(x); return t ? (canonMaps[k][D.key(t)] || t) : null; }).filter(Boolean).map(x => applyRec(k, x)).filter(Boolean);
            row[k] = arr;
          } else if (meta.type === "num") {
            let x;
            if (typeof v === "number") x = v;
            else if (v == null || String(v).trim() === "") x = NaN;
            else if (known.map) { const mk = Object.keys(known.map).find(t => D.key(t) === D.key(v)); x = mk ? known.map[mk] : leadNum(v); }
            else x = leadNum(v); if (isNaN(x) && v !== "" && v != null && typeof v === "string") { const y = parseNumText(v); if (isFinite(y)) x = y; else Q("aviso", k, prow._id, "Valor não numérico ignorado", v); }
            if (MISSING_CODES.has(x)) { Q("info", k, prow._id, "Código de ausente (999/9999) tratado como sem resposta", x); x = NaN; }
            if (isFinite(x) && known.range && (x < known.range[0] || x > known.range[1])) { Q("erro", k, prow._id, `Fora da faixa plausível (${known.range.join("–")}); tratado como sem resposta`, x); x = NaN; }
            row[k] = isFinite(x) ? x : null;
            // rótulos de escala ("10 - Afeta muito")
            if (typeof v === "string" && /^\s*\d+\s*-\s*\S/.test(v)) { meta.valueLabels = meta.valueLabels || {}; const n = leadNum(v); if (isFinite(n)) meta.valueLabels[n] = tidy(v.replace(/^\s*\d+\s*-\s*/, "")); }
          } else if (meta.type === "date") row[k] = parseDate(v);
          else if (meta.type === "cat") { let t = v == null ? "" : tidy(Array.isArray(v) ? v.join(", ") : v); if (/^9{3,}$/.test(t)) t = ""; row[k] = t ? applyRec(k, canonMaps[k][D.key(t)] || t) : null; }
          else row[k] = v == null || tidy(v) === "" ? null : tidy(v);
        });
      });
    });

    // ordem dos níveis das categóricas
    const allRows = () => Object.values(tables).flatMap(t => t.rows);
    Object.values(vars).forEach(m => {
      if (m.type !== "cat" && m.type !== "multi") return;
      const tab = Object.values(tables).find(t => t.vars.includes(m.id)); const cnt = new Map();
      tab.rows.forEach(r => { const v = r[m.id]; (Array.isArray(v) ? v : v == null ? [] : [v]).forEach(x => cnt.set(x, (cnt.get(x) || 0) + 1)); });
      let lv = [...cnt.keys()].sort((a, b) => cnt.get(b) - cnt.get(a));
      if (m.levelsOrder) { const ok = m.levelsOrder.filter(o => cnt.has(o)); lv = ok.concat(lv.filter(x => !ok.includes(x))); m.ordinal = true; }
      m.levels = lv;
    });

    // ---------- variáveis derivadas
    const der = (id, meta, tableId, fn) => {
      const t = tables[tableId || "part"]; if (!t) return;
      addVar(id, Object.assign({ derived: true, source: "Calculada" }, meta)); if (!t.vars.includes(id)) t.vars.push(id);
      t.rows.forEach(r => { let v = fn(r); if (typeof v === "number" && !isFinite(v)) v = null; r[id] = v === undefined ? null : v; });
    };
    const has = k => !!vars[k];
    const P = "part";
    // data da avaliação e idade (formulários do laboratório ou, em planilhas, colunas de data reconhecidas pelo nome)
    const dataGen = !has("2_Data_da_avaliao") ? tables.part.vars.find(k => vars[k].type === "date" && !/nasc/i.test(deacc(vars[k].label)) && /avalia|coleta|consulta|atendimento|data/i.test(deacc(vars[k].label))) : null;
    const nascGen = !has("6_Data_de_nascimento") ? tables.part.vars.find(k => vars[k].type === "date" && /nasc/i.test(deacc(vars[k].label)) && !/respons|m[aã]e|pai/i.test(deacc(vars[k].label))) : null;
    der("d_data", { label: "Data da avaliação", type: "date", section: "Identificação", desc: "Data informada na ficha; se vazia ou impossível (antes de 2010 ou depois do envio ao Epicollect), a data do registro no Epicollect." }, P, r => {
      const reg = r._created ? r._created.slice(0, 10) : null, d = r["2_Data_da_avaliao"] || (dataGen ? r[dataGen] : null);
      if (d && reg && (d < "2010-01-01" || Date.parse(d) > Date.parse(reg) + 3 * 864e5)) { Q("erro", "2_Data_da_avaliao", r._id, "Data da avaliação impossível; usada a data do registro (" + reg.split("-").reverse().join("/") + ")", d.split("-").reverse().join("/")); return reg; }
      return d || reg;
    });
    der("d_mes", { label: "Mês da avaliação", type: "cat", section: "Identificação", ordinal: true }, P, r => r.d_data ? r.d_data.slice(0, 7) : null);
    // ---------- município, estado e região (mapas)
    const MUN = opts.munNames || [], UFS = opts.ufs || [];
    const munByKey = new Map(MUN.map(n => [D.key(n), n]));
    const cleanMun = x => String(x).replace(/\s*[-\/(,].*$/, "").trim();
    const munField = Object.values(vars).find(v => v.raw && !v.pii && !v.hide && (v.type === "cat" || v.type === "text") && tables.part.vars.includes(v.id) && !/estado|^uf$/i.test(v.label) && (() => {
      const vals = part.map(r => r[v.id]).filter(Boolean); const ok = vals.filter(x => { const k = D.key(cleanMun(x)); return k !== "goias" && munByKey.has(k); }).length; return vals.length >= 5 && ok >= vals.length * 0.6 && new Set(vals).size >= 3; })());
    const manual = opts.municipios || {};
    der("d_municipio", { label: "Município de residência", type: "cat", section: "Responsável e contexto",
      desc: munField ? `Lido da pergunta "${munField.label}" e completado à mão na tela Mapa.` : "Completado à mão na tela Mapa (a ficha atual não pergunta o município)." }, P, r => {
        const m = manual[r._uuid]; if (m) return munByKey.get(D.key(cleanMun(m))) || m;
        if (munField && r[munField.id]) { const x = r[munField.id]; return munByKey.get(D.key(cleanMun(x))) || x; }
        // pergunta de região/cidade ("Cidade que mora") já respondida com o nome do município
        const rf = Object.keys(vars).find(k => /^\d+_Cidade_que_mora$/.test(k)); const x = rf ? r[rf] : null;
        if (x) { const n = munByKey.get(D.key(cleanMun(x))); if (n && D.key(cleanMun(x)) !== "goias") return n; }
        return null;
      });
    D.munField = munField ? munField.id : null;
    const ufByKey = new Map(); UFS.forEach(u => { ufByKey.set(D.key(u.n), u.n); ufByKey.set(D.key(u.c), u.n); });
    const stateField = Object.keys(vars).find(k => /^\d+_Estado$/.test(k)) || Object.keys(vars).find(k => vars[k].raw && /^estado\b/i.test(vars[k].label) && tables.part.vars.includes(k));
    der("d_uf", { label: "Estado de residência", type: "cat", section: "Responsável e contexto", desc: "Pergunta \"Estado\" da ficha, padronizada; quando vazia e o município é de Goiás, Goiás." }, P, r => {
      const s = stateField ? r[stateField] : null; if (s) { const n = ufByKey.get(D.key(s)); if (n) return n; }
      if (r.d_municipio && munByKey.has(D.key(r.d_municipio))) return "Goiás"; return s || null;
    });
    const RMG = ["Goiânia", "Abadia de Goiás", "Aparecida de Goiânia", "Aragoiânia", "Bela Vista de Goiás", "Bonfinópolis", "Brazabrantes", "Caldazinha", "Caturaí", "Goianápolis", "Goianira", "Guapó", "Hidrolândia", "Inhumas", "Nerópolis", "Nova Veneza", "Santa Bárbara de Goiás", "Santo Antônio de Goiás", "Senador Canedo", "Terezópolis de Goiás", "Trindade"].map(D.key);
    D.RMG = RMG;
    const regField = Object.keys(vars).find(k => /^\d+_Cidade_que_mora$/.test(k));
    const REG = ["Goiânia (capital)", "Região Metropolitana de Goiânia, exceto a capital", "Demais municípios de Goiás", "Fora de Goiás"];
    der("d_regiao", { label: "Região de moradia", type: "cat", section: "Responsável e contexto", ordinal: true, levels: REG, desc: "Pelo município (Região Metropolitana de Goiânia pela Lei Complementar estadual 27/1999 e alterações) ou, sem município, pela pergunta de região da ficha." }, P, r => {
      if (r.d_municipio) { const k = D.key(r.d_municipio); if (k === RMG[0]) return REG[0]; if (RMG.includes(k)) return REG[1]; if (munByKey.has(k)) return REG[2]; return REG[3]; }
      if (r.d_uf && r.d_uf !== "Goiás") return REG[3];
      const x = regField ? r[regField] : null; if (!x) return null; const k = D.key(x); return REG.find(g => D.key(g).startsWith(k.slice(0, 8))) || x;
    });
    der("d_registrador", { label: "Registrador no Epicollect (pseudônimo)", type: "cat", section: "Identificação", desc: "E-mail de quem enviou a ficha, trocado por um código." }, P, r => evalPseudo.get(r._by) || null);
    const NASC = has("6_Data_de_nascimento") ? "6_Data_de_nascimento" : nascGen;
    if (NASC) {
      der("d_idade", { label: "Idade (anos)", type: "num", unit: "anos", section: "Identificação", desc: "Data da avaliação − data de nascimento." }, P, r => {
        if (!r[NASC] || !r.d_data) return null; const a = years(r[NASC], r.d_data);
        if (a < 0 || a > 100) { Q("erro", NASC, r._id, "Idade calculada impossível (data de nascimento ou da avaliação errada)", a.toFixed(1)); return null; } return +a.toFixed(2);
      });
      der("d_faixa", { label: "Faixa etária", type: "cat", section: "Identificação", ordinal: true, levels: ["0–2 anos", "3–5 anos", "6–11 anos", "12–17 anos", "18 anos ou mais"] }, P, r => {
        const a = r.d_idade; if (a == null) return null; return a < 3 ? "0–2 anos" : a < 6 ? "3–5 anos" : a < 12 ? "6–11 anos" : a < 18 ? "12–17 anos" : "18 anos ou mais";
      });
      if (has("15_Adulto_ou_Criana")) part.forEach(r => { if (r.d_idade != null && r["15_Adulto_ou_Criana"] && ((r.d_idade >= 18) !== (r["15_Adulto_ou_Criana"] === "Adulto"))) Q("aviso", "15_Adulto_ou_Criana", r._id, `Marcado como "${r["15_Adulto_ou_Criana"]}" mas a idade calculada é ${r.d_idade.toFixed(1)} anos`, r["15_Adulto_ou_Criana"]); });
    }
    if (has("8_Peso_em_gramas")) der("d_peso", { label: "Peso (kg)", type: "num", unit: "kg", section: "Identificação", desc: "Peso em gramas ÷ 1000. Valores abaixo de 200 foram lidos como já digitados em kg; zero = sem resposta." }, P, r => {
      const g = r["8_Peso_em_gramas"]; if (g == null || g === 0) return null;
      let kg = g < 200 ? g : g / 1000; if (g < 200) Q("info", "8_Peso_em_gramas", r._id, "Peso parece digitado em kg; convertido", g);
      if (kg < 2 || kg > 150) { Q("erro", "8_Peso_em_gramas", r._id, "Peso fora da faixa plausível (2–150 kg); tratado como sem resposta", g); return null; }
      return +kg.toFixed(2);
    });
    if (has("9_Altura__em_centmet")) {
      part.forEach(r => { if (r["9_Altura__em_centmet"] === 0) r["9_Altura__em_centmet"] = null; });
      der("d_imc", { label: "IMC (kg/m²)", type: "num", unit: "kg/m²", section: "Identificação", desc: "Peso ÷ altura². Em crianças, interpretar pelo escore-z da OMS, não pelos cortes de adulto." }, P, r => { if (!r.d_peso || !r["9_Altura__em_centmet"]) return null; const v = +(r.d_peso / (r["9_Altura__em_centmet"] / 100) ** 2).toFixed(1);
        if (v < 8 || v > 60) { Q("erro", "9_Altura__em_centmet", r._id, `IMC impossível (${v}); confira peso e altura`, `${r.d_peso} kg / ${r["9_Altura__em_centmet"]} cm`); return null; } return v; });
    }
    if (has("10_Diagnstico_clnico")) {
      const lv = vars["10_Diagnstico_clnico"].levels;
      der("d_diag", { label: "Diagnóstico (grupo)", type: "cat", section: "Identificação", desc: "Diagnóstico único marcado; quando há mais de um, o primeiro entre PC, Mielomeningocele, Síndrome rara, TEA, AVC, Síndrome de Down; senão \"Outros\"." }, P, r => {
        const d = r["10_Diagnstico_clnico"] || []; if (!d.length) return null; if (d.length === 1) return d[0];
        const pri = ["PC", "Mielomeningocele", "Síndrome rara", "TEA", "AVC", "Síndrome de Down"].find(x => d.includes(x)); return pri || d[0];
      });
      vars.d_diag.levels = lv.filter(x => part.some(r => r.d_diag === x));
    }
    if (has("25_Idade_gestacional")) {
      der("d_ig", { label: "Idade gestacional (semanas)", type: "num", unit: "semanas", section: "Gestação e parto", desc: "Lida do texto (ex.: \"38 semanas e 5 dias\" = 38,7)." }, P, r => {
        const t = r["25_Idade_gestacional"]; if (!t) return null; const w = D.parseGestWeeks(t); if (!isFinite(w)) Q("aviso", "25_Idade_gestacional", r._id, "Não consegui ler a idade gestacional", t); return isFinite(w) ? +w.toFixed(1) : null;
      });
      der("d_prematuro", { label: "Prematuridade", type: "cat", section: "Gestação e parto", ordinal: true, levels: ["Extremo (<28 sem)", "Muito prematuro (28–31)", "Moderado/tardio (32–36)", "A termo (≥37)"], desc: "Classificação da OMS pela idade gestacional." }, P, r => {
        const w = r.d_ig; if (w == null) return null; return w < 28 ? "Extremo (<28 sem)" : w < 32 ? "Muito prematuro (28–31)" : w < 37 ? "Moderado/tardio (32–36)" : "A termo (≥37)";
      });
    }
    if (has("26_Peso_ao_nascer")) {
      der("d_pn", { label: "Peso ao nascer (g)", type: "num", unit: "g", section: "Gestação e parto", desc: "Lido do texto; valores menores que 10 foram tratados como kg (\"2,115 kg\" = 2115 g)." }, P, r => {
        const t = r["26_Peso_ao_nascer"]; if (!t) return null; const g = D.parseBirthWeight(t);
        if (!isFinite(g)) { if (!/^9{3,}$/.test(t.trim())) Q("aviso", "26_Peso_ao_nascer", r._id, "Não consegui ler o peso ao nascer", t); return null; }
        if (g < 300 || g > 6500) { Q("erro", "26_Peso_ao_nascer", r._id, "Peso ao nascer fora da faixa plausível (300–6500 g)", t); return null; } return g;
      });
      der("d_bpn", { label: "Peso ao nascer (classe)", type: "cat", section: "Gestação e parto", ordinal: true, levels: ["Extremo baixo (<1000 g)", "Muito baixo (1000–1499 g)", "Baixo (1500–2499 g)", "Adequado (≥2500 g)"] }, P, r => {
        const g = r.d_pn; if (g == null) return null; return g < 1000 ? "Extremo baixo (<1000 g)" : g < 1500 ? "Muito baixo (1000–1499 g)" : g < 2500 ? "Baixo (1500–2499 g)" : "Adequado (≥2500 g)";
      });
    }
    if (has("21_Durao_do_parto")) der("d_dur_parto", { label: "Duração do parto (horas)", type: "num", unit: "h", section: "Gestação e parto", desc: "Lida do texto; números sem unidade ficam sem resposta." }, P, r => {
      const t = r["21_Durao_do_parto"]; if (!t) return null; const m = D.parseMinutes(t); if (!isFinite(m) && !/^9{3,}$/.test(t.trim()) && !/n[aã]o/i.test(t)) Q("aviso", "21_Durao_do_parto", r._id, "Duração do parto sem unidade ou ilegível", t); return isFinite(m) ? +(m / 60).toFixed(2) : null;
    });
    if (has("34_Se_sim_quantos_di")) der("d_utin_dias", { label: "Dias de UTIN", type: "num", unit: "dias", section: "Gestação e parto", desc: "Lido do texto (1 mês = 30 dias)." }, P, r => { const t = r["34_Se_sim_quantos_di"]; if (!t) return null; const d = D.parseDays(t); if (!isFinite(d) && !/^9{3,}$/.test(t.trim())) Q("aviso", "34_Se_sim_quantos_di", r._id, "Não consegui ler os dias de UTIN", t); return isFinite(d) ? d : null; });
    if (has("36_Se_sim_quantos_di")) der("d_ucin_dias", { label: "Dias de UCIN", type: "num", unit: "dias", section: "Gestação e parto" }, P, r => { const d = D.parseDays(r["36_Se_sim_quantos_di"]); return isFinite(d) ? d : null; });
    if (has("41_Data_de_nasciment")) der("d_idade_resp", { label: "Idade do responsável (anos)", type: "num", unit: "anos", section: "Responsável e contexto" }, P, r => {
      if (!r["41_Data_de_nasciment"] || !r.d_data) return null; const a = years(r["41_Data_de_nasciment"], r.d_data);
      if (a < 12 || a > 100) { Q("erro", "41_Data_de_nasciment", r._id, "Idade do responsável impossível", a.toFixed(1)); return null; } return +a.toFixed(1);
    });
    // escore motor exploratório
    const motorItems = Object.keys(I.F).filter(k => I.F[k].motor && has(k));
    if (motorItems.length) {
      der("d_motor", { label: "Escore motor do laboratório (0–100, exploratório)", type: "num", unit: "%", section: "Avaliação motora e funcional",
        desc: "Soma das " + motorItems.length + " tarefas motoras da ficha (cada uma pontuada pela posição na escala: 0 = não consegue … máximo = sem ajuda), em % do máximo possível. Não é um instrumento validado: use só para descrição e exploração." }, P, r => {
          let s = 0, mx = 0, miss = 0; motorItems.forEach(k => { const lv = I.F[k].order, v = r[k]; const i = lv ? lv.findIndex(o => D.key(o) === D.key(v || "")) : -1; if (i < 0) { miss++; return; } s += i; mx += lv.length - 1; });
          return miss > motorItems.length / 2 ? null : +(s / mx * 100).toFixed(1);
        });
      motorItems.forEach(k => vars[k].motorItem = true);
    }

    // ---------- B-IPQ
    const ipq = { c: "92_Quanto_a_doena_do", t: "93_Quanto_tempo_voc_", pc: "94_Quanto_controle_v", tc: "95_Quanto_voc_pensa_", id: "96_Quanto_voc_perceb", co: "97_At_que_ponto_voc_", cn: "98_Quanto_voc_est_pr", e: "99_Quanto_a_doena_do" };
    if (Object.values(ipq).every(has)) {
      der("s_bipq", { label: "B-IPQ escore total (0–80)", type: "num", section: "B-IPQ", instrument: "B-IPQ", score: true,
        desc: "Soma dos itens 1, 2, 5, 6 e 8 com os itens 3, 4 e 7 invertidos (10 − valor). Maior = percepção mais ameaçadora da doença. O item extra de responsabilidade (91) e as causas (100) ficam fora. Só calculado com os 8 itens respondidos." }, P, r => {
          const v = Object.values(ipq).map(k => r[k]); if (v.some(x => x == null)) return null;
          return r[ipq.c] + r[ipq.t] + r[ipq.id] + r[ipq.cn] + r[ipq.e] + (10 - r[ipq.pc]) + (10 - r[ipq.tc]) + (10 - r[ipq.co]);
        });
      D.bipqItems = Object.values(ipq);
    }

    // ---------- SF-36 (cálculo de Ciconelli et al., 1999 — versão brasileira)
    const sf = {
      q1: "103_Em_geral_voc_dir", q3: ["106_a_Atividades_Rig", "108_b_Atividades_mod", "107_a_Dificuldade_de", "109_d_Subir_vrios_la", "110_e_Subir_um_lance", "111_f_Curvarse_ajoel", "112_g_Andar_mais_de_", "113_h_Andar_vrios_qu", "114_i_Andar_um_quart", "115_j_Tomar_banho_ou"],
      q4: ["117_a_Durante_as_lti", "118_b_Durante_as_lti", "119_c_Durante_as_lti", "120_d_Durante_as_lti"], q5: ["122_a_Voc_diminuiu_a", "123_b_Realizou_menos", "124_c_No_realizou_ou"],
      q6: "125_Durante_as_ltima", q7: "126_Quanta_dor_no_co", q8: "127_Durante_as_ltima",
      q9: ["129_a_Quanto_tempo_v", "130_b_Quanto_tempo_v", "131_c_Quanto_tempo_v", "132_d_Quanto_tempo_v", "133_e_Quanto_tempo_v", "134_f_Quanto_tempo_v", "135_g_Quanto_tempo_v", "136_h_Quanto_tempo_v", "137_i_Quanto_tempo_v"],
      q10: "138_10__Durante_as_l", q11: ["140_a_Eu_costumo_obe", "141_b_Eu_sou_to_saud", "142_c_Eu_acho_que_a_", "143_d_Minha_sade__ex"]
    };
    if ([sf.q1, sf.q6, sf.q7, sf.q8, sf.q10, ...sf.q3, ...sf.q4, ...sf.q5, ...sf.q9, ...sf.q11].every(has)) {
      const rev = (v, max) => v == null ? null : max + 1 - v;
      const q1c = { 1: 5, 2: 4.4, 3: 3.4, 4: 2, 5: 1 }, q7c = { 1: 6, 2: 5.4, 3: 4.2, 4: 3.1, 5: 2, 6: 1 };
      // média dos itens respondidos × nº de itens, se ao menos metade respondida
      const fill = arr => { const ok = arr.filter(v => v != null); return ok.length >= arr.length / 2 ? S.mean(ok) * arr.length : null; };
      const dom = (raw, lo, range) => raw == null ? null : +Math.max(0, Math.min(100, (raw - lo) / range * 100)).toFixed(1);
      const conv = r => {
        const g = k => r[k];
        const q8 = (() => { const a = g(sf.q8), b = g(sf.q7); if (a == null) return null; if (b == null) return { 1: 6, 2: 4.75, 3: 3.5, 4: 2.25, 5: 1 }[a]; if (a === 1) return b === 1 ? 6 : 5; return { 2: 4, 3: 3, 4: 2, 5: 1 }[a]; })();
        const q9 = sf.q9.map((k, i) => [0, 3, 4, 7].includes(i) ? rev(g(k), 6) : g(k));
        const q11 = sf.q11.map((k, i) => i === 1 || i === 3 ? rev(g(k), 5) : g(k));
        return { q1: q1c[g(sf.q1)] ?? null, q3: sf.q3.map(g), q4: sf.q4.map(g), q5: sf.q5.map(g), q6: rev(g(sf.q6), 5), q7: q7c[g(sf.q7)] ?? null, q8, q9, q10: g(sf.q10), q11 };
      };
      const defs = [
        ["s_sf_cf", "SF-36 Capacidade funcional", c => dom(fill(c.q3), 10, 20)],
        ["s_sf_laf", "SF-36 Limitação por aspectos físicos", c => dom(fill(c.q4), 4, 4)],
        ["s_sf_dor", "SF-36 Dor", c => dom(fill([c.q7, c.q8]), 2, 10)],
        ["s_sf_egs", "SF-36 Estado geral de saúde", c => dom(fill([c.q1, ...c.q11]), 5, 20)],
        ["s_sf_vit", "SF-36 Vitalidade", c => dom(fill([c.q9[0], c.q9[4], c.q9[6], c.q9[8]]), 4, 20)],
        ["s_sf_as", "SF-36 Aspectos sociais", c => dom(fill([c.q6, c.q10]), 2, 8)],
        ["s_sf_lae", "SF-36 Limitação por aspectos emocionais", c => dom(fill(c.q5), 3, 3)],
        ["s_sf_sm", "SF-36 Saúde mental", c => dom(fill([c.q9[1], c.q9[2], c.q9[3], c.q9[5], c.q9[7]]), 5, 25)],
      ];
      defs.forEach(([id, label, fn]) => der(id, { label, type: "num", unit: "0–100", section: "SF-36", instrument: "SF-36", score: true,
        desc: "Raw Scale de Ciconelli et al. (1999): (valor − mínimo) ÷ variação × 100; 0 = pior, 100 = melhor. Itens em branco preenchidos pela média dos respondidos quando ao menos metade do domínio foi respondida." }, P, r => r._has_sf ? fn(conv(r)) : (sf.q3.some(k => r[k] != null) ? fn(conv(r)) : null)));
      D.sfDomains = defs.map(d => d[0]);
      D.sfItems = sf;
    }

    // ---------- B-QUEST 2.0
    const qk = I.qItens.map((_, i) => Object.keys(I.F).find(k => k.startsWith((148 + i) + "_")));
    const qt = Object.values(tables).find(t => t.vars.includes(qk[0]));
    if (qk.every(has) && qt) {
      const mean = (r, ks, min) => { const v = ks.map(k => r[k]).filter(x => x != null); return v.length >= min ? +S.mean(v).toFixed(2) : null; };
      der("s_quest_disp", { label: "B-QUEST Dispositivo (1–5)", type: "num", section: "B-QUEST", instrument: "B-QUEST", score: true, desc: "Média dos itens 1–8; exige ao menos 6 respondidos (manual do QUEST 2.0)." }, qt.id, r => mean(r, qk.slice(0, 8), 6));
      der("s_quest_serv", { label: "B-QUEST Serviços (1–5)", type: "num", section: "B-QUEST", instrument: "B-QUEST", score: true, desc: "Média dos itens 9–12; exige ao menos 3 respondidos." }, qt.id, r => mean(r, qk.slice(8), 3));
      der("s_quest_total", { label: "B-QUEST Total (1–5)", type: "num", section: "B-QUEST", instrument: "B-QUEST", score: true, desc: "Média dos 12 itens; exige ao menos 9 respondidos." }, qt.id, r => mean(r, qk, 9));
      D.questItems = qk;
      // resumo por participante
      const by = new Map(); qt.rows.forEach(r => { if (!by.has(r._pid)) by.set(r._pid, []); by.get(r._pid).push(r); });
      der("d_quest_n", { label: "Nº de dispositivos avaliados no B-QUEST", type: "num", section: "B-QUEST" }, P, r => (by.get(r._id) || []).length);
      der("s_quest_total_med", { label: "B-QUEST Total, média do participante", type: "num", section: "B-QUEST", instrument: "B-QUEST", score: true, desc: "Média do escore total entre os dispositivos avaliados do participante." }, P, r => {
        const v = (by.get(r._id) || []).map(x => x.s_quest_total).filter(x => x != null); return v.length ? +S.mean(v).toFixed(2) : null;
      });
    }
    // presença de cada formulário 1:1
    forms.forEach((f, fi) => { if (f.rel === "1:1") der("d_tem_" + f.slug, { label: "Respondeu " + f.nome, type: "cat", section: "Coleta", levels: ["Sim", "Não"] }, P, r => r["_has_" + f.slug] ? "Sim" : "Não"); });

    // dados do participante disponíveis nas tabelas 1:n
    Object.values(tables).forEach(t => { if (t.id === "part") return; t.rows.forEach(r => tables.part.vars.forEach(k => { if (!(k in r)) r[k] = r._prow[k]; })); t.partVars = tables.part.vars.slice(); });

    // mesma pessoa (nome + nascimento): duplicata (< 30 dias da avaliação anterior) ou reavaliação
    const nameKey = Object.keys(vars).find(k => /Nome_do_participan/.test(k) || (I.F[k] && I.F[k].personName)), birth = Object.keys(vars).find(k => /^\d+_Data_de_nascimento$/.test(k) || (I.F[k] && I.F[k].personBirth));
    const pessoas = new Map();
    part.forEach(r => { const k = nameKey && r[nameKey] ? D.key(r[nameKey]) + "|" + (birth ? r[birth] || "" : "") : "id|" + r._uuid; if (!pessoas.has(k)) pessoas.set(k, []); pessoas.get(k).push(r); });
    let nReav = 0;
    pessoas.forEach(list => {
      list.sort((a, b) => String(a.d_data || "").localeCompare(String(b.d_data || "")) || String(a._created).localeCompare(String(b._created)));
      let kept = [];
      list.forEach(r => {
        const prev = kept[kept.length - 1];
        if (prev && (!r.d_data || !prev.d_data || (Date.parse(r.d_data) - Date.parse(prev.d_data)) / 864e5 < 30)) {
          r._dup = prev._id; Q("erro", nameKey, r._id, `Ficha duplicada de ${prev._id} (mesmo nome e nascimento, avaliações com menos de 30 dias); fica fora das análises`, "");
        } else kept.push(r);
      });
      kept.forEach((r, i) => { r._mom = i + 1; r._nAval = kept.length; r._pessoa = kept[0]._id; r._dias1 = i && r.d_data && kept[0].d_data ? Math.round((Date.parse(r.d_data) - Date.parse(kept[0].d_data)) / 864e5) : 0; });
      if (kept.length > 1) nReav++;
    });
    der("d_pessoa", { label: "Pessoa (código)", type: "text", section: "Coleta", desc: "Código da primeira ficha da pessoa; reavaliações da mesma pessoa (mesmo nome e nascimento) têm o mesmo código." }, P, r => r._pessoa || r._dup || r._id);
    der("d_momento", { label: "Momento da avaliação", type: "cat", section: "Coleta", ordinal: true, levels: ["1ª avaliação", "2ª avaliação", "3ª avaliação", "4ª avaliação", "5ª avaliação"], desc: "Ordem da avaliação da pessoa pela data. Fichas da mesma pessoa com menos de 30 dias de intervalo contam como duplicata." }, P, r => r._dup ? null : (r._mom || 1) + "ª avaliação");
    der("d_n_aval", { label: "Nº de avaliações da pessoa", type: "num", section: "Coleta" }, P, r => r._dup ? null : r._nAval || 1);
    der("d_dias_1a", { label: "Dias desde a 1ª avaliação", type: "num", unit: "dias", section: "Coleta" }, P, r => r._dup ? null : r._dias1 || 0);
    D.nReav = nReav;
    forms.forEach(f => { if (f.rel === "1:1") { const miss = part.filter(r => !r["_has_" + f.slug]).length; if (miss) Q("info", null, null, `${miss} participante(s) ainda sem "${f.nome}"`, miss); } });

    // ausentes por variável
    Object.values(tables).forEach(t => t.vars.forEach(k => { const m = vars[k]; if (!m || m.type === "multi") return; let miss = 0; t.rows.forEach(r => { if (r[k] == null) miss++; }); m.missing = miss; m.n = t.rows.length; }));
    Object.values(vars).forEach(m => { if (m.type === "multi") { const t = Object.values(tables).find(tt => tt.vars.includes(m.id)); m.n = t.rows.length; m.missing = t.rows.filter(r => !(r[m.id] || []).length).length; } });

    log.push(`${forms.length} formulários; ${part.length} participantes.`);
    return { vars, tables, quality, forms: forms.map(f => ({ slug: f.slug, nome: f.nome, n: f.records.length, rel: f.rel, orphans: f.orphans, linked: f.linked })), canonMaps, recodes, rootSlug: forms[rootIdx].slug, log, builtAt: new Date().toISOString() };
  };

  // ---------- sugestão de município a partir de textos livres (bairro, local do parto…)
  D.suggestMun = (texts, munNames) => {
    const norm = s => " " + String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
    const list = (D._munNorm && D._munNorm.src === munNames) ? D._munNorm : (D._munNorm = Object.assign(munNames.map(n => [n, norm(n)]).filter(([n, k]) => k.trim().length >= 4 && k.trim() !== "goias").sort((a, b) => b[1].length - a[1].length), { src: munNames }));
    for (const t of texts) { if (!t) continue; const s = norm(t); for (const [n, k] of list) if (s.includes(k)) return n; }
    return null;
  };

  // ---------- valores para análise
  D.value = (row, v) => row[v.id];
  D.isNum = v => v.type === "num";
  D.levelsOf = (v, rows) => {
    if (v.levels) return v.levels.filter(l => rows.some(r => { const x = r[v.id]; return Array.isArray(x) ? x.includes(l) : x === l; }));
    const s = new Set(); rows.forEach(r => { const x = r[v.id]; if (x != null) s.add(x); }); return [...s].sort();
  };

  // ---------- exportação
  D.exportRows = (model, tableId, rows, opts) => {
    opts = opts || {}; const t = model.tables[tableId]; const vs = (opts.varIds || t.vars).map(k => model.vars[k]).filter(v => v && (opts.pii || !v.pii) && (opts.text || v.type !== "text"));
    const head = ["id"], cols = [];
    if (tableId !== "part") head.push("id_participante");
    vs.forEach(v => {
      if (v.type === "multi") (v.levels || []).forEach(l => { head.push(opts.codes ? `${v.id}__${D.key(l)}` : `${v.label}: ${l}`); cols.push(r => (r[v.id] || []).includes(l) ? 1 : 0); });
      else { head.push(opts.codes ? v.id : v.label + (v.unit && !v.label.includes("(") ? ` (${v.unit})` : "")); cols.push(r => r[v.id]); }
    });
    const out = rows.map(r => { const a = [r._id]; if (tableId !== "part") a.push(r._pid); cols.forEach(c => a.push(c(r))); return a; });
    return { head, rows: out, vars: vs };
  };
  D.toCSV = (head, rows, sep, dec) => {
    sep = sep || ";"; dec = dec || ",";
    const q = v => { if (v == null) return ""; if (typeof v === "number") return dec === "," ? String(v).replace(".", ",") : String(v); const s = String(v); return /[";\n\r]|^\s|\s$/.test(s) || s.includes(sep) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return "﻿" + [head, ...rows].map(r => r.map(q).join(sep)).join("\r\n");
  };
  D.dictionary = (model, tableId) => {
    const t = model.tables[tableId];
    return t.vars.map(k => model.vars[k]).filter(Boolean).map(v => ({
      id: v.id, rotulo: v.label, secao: v.section, tipo: { num: "numérica", cat: v.ordinal ? "categórica ordinal" : "categórica", multi: "múltipla escolha", date: "data", text: "texto livre" }[v.type],
      origem: v.derived ? "calculada" : "Epicollect · " + (v.form || ""), unidade: v.unit || "", categorias: (v.levels || []).join(" | "),
      validos: v.n != null ? v.n - (v.missing || 0) : "", ausentes: v.missing ?? "", identificador: v.pii ? "sim" : "", descricao: v.desc || ""
    }));
  };

  root.EData = D;
  if (typeof module !== "undefined") module.exports = D;
})(typeof window !== "undefined" ? window : globalThis);
