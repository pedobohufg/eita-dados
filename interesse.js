/*
  EITA! DADOS — manifestação de interesse nos produtos de tecnologia assistiva
  Lê a planilha do Google Forms "Manifestação de Interesse nos Produtos - Tecnologias Assistivas" (CSV ou .xlsx)
  e a transforma numa ficha no formato que o resto da ferramenta entende (uma linha por solicitação).
  As respostas em texto livre (produto, diagnóstico, atividades da vida diária, altura, peso, cidade) são
  agrupadas por regras simples, descritas em cada variável e na tela "Como calculamos". O texto original
  fica guardado ao lado, para conferência.
  © 2026 Lab.EITA/UFG. Autor: Pedro Henrique Gonçalves. Todos os direitos reservados.
*/
(function (root) {
  "use strict";
  const D = root.EData, I = root.EInstr;
  const deacc = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  const tidy = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const baixo = s => deacc(tidy(s)).toLowerCase();
  const SEC = "Manifestação de interesse";

  // ---------------- colunas do formulário (reconhecidas pelo começo do enunciado, sem acento)
  const COLUNAS = [
    ["mi_envio", /^carimbodedatahora|^timestamp|^datahora/],
    ["mi_email", /^nomedeusuario|^email|^enderecodeemail/],
    ["mi_nome", /^nomedointeressado|^nomedopaciente|^nomedousuario$/],
    ["mi_nasc", /^datadenascimento/],
    ["mi_diag_texto", /^diagnostico/],
    ["mi_avd_texto", /dependencia|atividadedavidadiaria/],
    ["mi_resp", /^nomedoresponsavel/],
    ["mi_tel", /telefone|whatsapp|celular/],
    ["mi_estado", /^estado$|^uf$/],
    ["mi_cidade", /^cidade|^municipio/],
    ["mi_end", /^endereco|^rua|^bairro/],
    ["mi_ortese", /usodeortese|usaortese/],
    ["mi_terapia", /fazterapia/],
    ["mi_clinica", /clinica/],
    ["mi_fisio", /fisioterapeuta|profissionalresponsavel/],
    ["mi_prod_texto", /^produto/],
    ["mi_altura_texto", /^altura/],
    ["mi_peso_texto", /^peso/],
    ["mi_termo", /^marqueaopcao|termo|consentimento|aceito/],
  ];
  D.ehInteresse = head => { const ks = head.map(h => D.key(h)); return ks.some(k => /^produto/.test(k)) && ks.some(k => /^nomedointeressado|^carimbodedatahora/.test(k)); };

  // ---------------- metadados (rótulos, tipos, identificação)
  const SN = ["Sim", "Não"];
  const NIVEIS_AVD = ["Nenhuma", "Parcial (algumas atividades)", "Total (todas as atividades)", "Sim, sem dizer quais", "Resposta não descreve dependência"];
  const add = (sec, list) => list.forEach(([k, label, o]) => { I.F[k] = Object.assign({ label, section: sec }, o || {}); });
  add("Identificação", [
    ["mi_envio", "Carimbo de data/hora (como exportado)", { type: "text", hide: true }],
    ["mi_data", "Data da solicitação (formulário)", { type: "date", hide: true, desc: "Dia em que o formulário foi enviado (carimbo de data/hora do Google Forms)." }],
    ["mi_email", "E-mail de quem enviou", { pii: true }],
    ["mi_nome", "Nome do interessado", { pii: true, personName: true }],
    ["mi_nasc", "Data de nascimento", { type: "date", pii: true, personBirth: true }],
    ["mi_resp", "Nome do responsável", { pii: true }],
    ["mi_tel", "Telefone (WhatsApp)", { pii: true }],
    ["mi_end", "Endereço (rua e bairro)", { pii: true }],
    ["mi_termo", "Termo de consentimento", { hide: true }],
    ["mi_solicitante", "Tipo de solicitante (estimado pelo texto)", { order: ["Pessoa ou família", "Instituição ou profissional"], desc: "“Instituição ou profissional” quando o produto ou o diagnóstico fala em pacientes, ambulatório, estudantes, pesquisa ou doação; senão, “Pessoa ou família”. Estimativa: confira na tela Variáveis." }],
  ]);
  add("Local", [
    ["mi_estado", "Estado (como respondido)", { type: "cat", hide: true }],
    ["mi_cidade", "Cidade (como digitada)", { type: "text", hide: true }],
    ["mi_municipio", "Município (padronizado)", { type: "cat", desc: "Cidade digitada, comparada sem acentos nem maiúsculas com os 246 municípios de Goiás (aceita um erro de digitação e abreviações como “Ap. Goiânia”). Fora de Goiás, fica como digitada. Formulários antigos sem a pergunta “Cidade”: usa a coluna sem título que guardava a cidade." }],
  ]);
  add("Produto solicitado", [
    ["mi_prod_texto", "Produto(s) de interesse (como respondido)", { type: "text" }],
    ["mi_produto", "Produto solicitado (grupo)", { type: "multi", desc: "Agrupado pelo código do catálogo (ex.: 701 = Parapodium) e por palavras do texto (parapódio, cadeira de rodas, órtese de mão…). Uma solicitação pode ter mais de um produto." }],
    ["mi_item", "Item do catálogo (código)", { type: "multi", desc: "Códigos de 3 dígitos citados na resposta, com o nome mais usado para cada código na própria base." }],
    ["mi_n_produtos", "Nº de produtos na solicitação", { type: "num" }],
  ]);
  add("Saúde e função", [
    ["mi_diag_texto", "Diagnóstico clínico e funcional (como respondido)", { type: "text" }],
    ["mi_diag", "Condições citadas no diagnóstico", { type: "multi", desc: "Palavras do diagnóstico agrupadas (com as grafias erradas mais comuns): paralisia cerebral, hidrocefalia, mielomeningocele, microcefalia, epilepsia, TEA, síndromes etc. Uma pessoa pode ter várias." }],
    ["mi_diag_principal", "Diagnóstico principal (grupo)", { type: "cat", desc: "Primeiro grupo citado na ordem: paralisia cerebral, mielomeningocele, síndrome de Down, TEA, AVC, lesão medular, doença neuromuscular, outras síndromes, hidrocefalia, microcefalia, assimetria craniana, condição ortopédica, malformação, atraso sem diagnóstico; senão, “Outros”." }],
    ["mi_avd_texto", "Dependência nas atividades da vida diária (como respondido)", { type: "text" }],
    ["mi_avd_nivel", "Dependência nas AVD (nível)", { type: "cat", order: NIVEIS_AVD, desc: "Lida do texto: “todas”, “tudo”, “totalmente dependente” = total; atividades citadas = parcial; “não”/“nenhuma” = nenhuma; “sim” sozinho = sem dizer quais; respostas sobre terapias ou o diagnóstico = não descreve dependência." }],
    ["mi_avd", "Atividades com dependência citadas", { type: "multi", desc: "Locomoção, sentar/ficar em pé, alimentação, higiene e banho, vestir, comunicação e uso das mãos, quando citadas no texto." }],
    ["mi_ortese", "Faz uso de órtese", { order: SN }],
    ["mi_terapia", "Faz terapias atualmente", { order: SN }],
    ["mi_clinica", "Clínica(s) onde faz terapia", { type: "text" }],
    ["mi_fisio", "Fisioterapeuta responsável", { pii: true }],
    ["mi_altura_texto", "Altura (como digitada)", { type: "text", hide: true }],
    ["mi_peso_texto", "Peso (como digitado)", { type: "text", hide: true }],
    ["mi_altura", "Altura (cm)", { type: "num", unit: "cm", range: [30, 210], desc: "Lida do texto: “1,23” e “1 metro e 22” viram centímetros." }],
    ["mi_peso", "Peso (kg)", { type: "num", unit: "kg", range: [1.5, 200], desc: "Lido do texto: “15kg700g” = 15,7; “8.100” = 8,1; valores acima de 300 tratados como gramas." }],
  ]);

  // ---------------- leitura dos textos
  // altura em cm
  D.alturaCm = s => {
    let t = baixo(s); if (!t) return NaN;
    const mc = t.match(/(\d+)\s*(?:m|metro|metros)\b\s*(?:e\s*)?(\d+)?/); if (mc && !/^\d+[.,]\d/.test(t)) return +mc[1] * 100 + (mc[2] ? +mc[2] : 0);
    const m = t.match(/(\d+(?:\s*[.,]\s*\d+)?)/); if (!m) return NaN; let x = parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
    if (x < 3) x *= 100; return Math.round(x * 10) / 10;
  };
  // peso em kg
  D.pesoKg = s => {
    let t = baixo(s); if (!t) return NaN;
    const kg = t.match(/(\d+)\s*(?:kg|kl|k|quilos?|kilos?)\s*(?:e\s*)?(\d+)\s*(?:g|gramas?)\b/); if (kg) return +kg[1] + +kg[2] / 1000;
    const m = t.match(/(\d+(?:\s*[.,]\s*\d+)?)/); if (!m) return NaN; let x = parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
    if (x > 300) x /= 1000; return Math.round(x * 1000) / 1000;
  };

  // produtos
  const GRUPOS_PROD = [
    ["Parapodium", /parapo|paradium|parapdi|ficar? em pe|suporte para crianca ficar/],
    ["Cadeira de rodas", /cadeir\w* de rodas?|cadeiras? de roda|^cadeira$/],
    ["Cadeira de alimentação", /cadeir\w* (de )?aliment|cadeira de roda e alimenta|e (para )?alimentacao$/],
    ["Órtese craniana", /cran|capacete|plagio|braqu/],
    ["Órtese de membro inferior", null], ["Órtese de membro superior", null], ["Órtese (não especificada)", null],
    ["Palmilha", /palmilha/],
    ["Adaptações para AVD", /talher|engross|multiuso|latex|adaptador|suporte (para|de) (escova|copo|chave|garraf|fone)|equipo/],
    ["Cadeira de banho", /banho/],
    ["Andador e triciclo", /andador|walker|walter|triciclo/],
    ["Posicionamento e assentos", /posicionamento|postural|apoio para sentar|carrinho|colete|suporte cervical|suporte de cabeca|cadeirinha de carro|escada/],
    ["Acesso digital", /touch|ponta/],
    ["Brinquedo e kit sensorial", /sensorial|brinquedo/],
    ["Prótese", /protese/],
    ["Comunicação alternativa", /comunica/],
  ];
  const GRUPO_CODIGO = c => { const n = +c;
    if (n >= 100 && n < 200) return "Adaptações para AVD"; if (n >= 300 && n < 400) return "Acesso digital";
    if (n === 601) return "Órtese craniana"; if (n === 607) return "Prótese"; if (n === 701) return "Parapodium"; if (n === 702) return "Cadeira de alimentação";
    if (n === 801) return "Cadeira de rodas"; if (n === 802) return "Andador e triciclo"; return null; };
  D.GRUPOS_PRODUTO = GRUPOS_PROD.map(g => g[0]).concat(["Outros"]);
  const ORTESE = /\b(ortese|orteses|ortose|ortase|otese|ortes|tala|talas|extensor|extensores|osp|suro|cruro|afo|tutor|cock)/;
  const MI = /\b(pe|pes|perna|pernas|joelho|joelhos|mmii|inferior|inferiores|suro|cruro|afo|tornozelo|tutor|quadril)\b|suropod|cruropod/;
  const MS = /\b(mao|maos|punho|bracos?|cotovelo|dedos|mmss|superior|superiores|cock)\b/;
  const codigosDe = t => [...String(t || "").matchAll(/(?:^|[^\d])([1-8]\d{2})(?:\.\d)?(?!\d)/g)].map(m => m[1]).filter(c => +c % 100 > 0 && +c % 100 < 40);
  D.produtosDe = texto => {
    const t = baixo(texto); if (!t) return [];
    const out = new Set(); codigosDe(texto).forEach(c => { const g = GRUPO_CODIGO(c); if (g) out.add(g); });
    const semCod = t.replace(/\b[1-8]\d{2}\b/g, " ");
    GRUPOS_PROD.forEach(([g, re]) => { if (re && re.test(semCod)) out.add(g); });
    // órteses pelo segmento do corpo (a craniana já foi reconhecida acima)
    const partes = semCod.split(/\s*(?:[;\n]|\be\b(?=\s*(?:ortese|cadeira|parapo|palmilha|extensor)))\s*/);
    partes.forEach(p => { if (!ORTESE.test(p) || /cran|capacete/.test(p)) return; const mi = MI.test(p), ms = MS.test(p);
      if (mi) out.add("Órtese de membro inferior"); if (ms) out.add("Órtese de membro superior"); if (!mi && !ms) out.add(/pra fica em pe|ficar em pe/.test(p) ? "Parapodium" : "Órtese (não especificada)"); });
    if (!out.size && /[a-z]{3}/.test(t)) out.add("Outros");
    return D.GRUPOS_PRODUTO.filter(g => out.has(g));
  };
  // nomes do catálogo: o nome mais usado para cada código na própria base ("701. Parapodium")
  D.catalogoDe = textos => {
    const cnt = {}, conta = (c, n, peso) => { n = tidy(n).replace(/[.\s-]+$/, "").replace(/^[-\s]+/, ""); if (!n || /^(e|ou)\b/i.test(n)) return; (cnt[c] = cnt[c] || {})[n] = (cnt[c][n] || 0) + peso; };
    textos.forEach(t => {
      [...String(t || "").matchAll(/(?:^|[^\d])([1-8]\d{2})(?:\.\d\s+|\s*[.\-–]\s*)([A-Za-zÀ-ÿ][^;,\n\d]{2,60})/g)].forEach(m => conta(m[1], m[2], 10));
      [...String(t || "").matchAll(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{2,40}?)\s*-?\s*([1-8]\d{2})(?![\d.])/g)].forEach(m => conta(m[2], m[1], 1));
    });
    const out = {}; Object.entries(cnt).forEach(([c, ns]) => { out[c] = Object.entries(ns).sort((a, b) => b[1] - a[1])[0][0]; }); return out;
  };

  // diagnósticos
  const GRUPOS_DIAG = [
    ["Paralisia cerebral", /\bpar\w*\s+c[e]?[rl]e?b|\bpar\w*\s+cer|\bpc\b|\bp\.c\b|\bg\s*\.?\s*80|encefalopatia cronica|ecnp\b|tetra\s?espas|diplegica espastica|quadripar|quadripl|tetrapar|diparet|hemipar|tetraplegia espastica/],
    ["Mielomeningocele", /miel|meningoc|meningoce|espinha bifida/],
    ["Síndrome de Down", /\bdown\b|\bdawn\b|trissomia (do cromossomo )?21/],
    ["TEA", /autis|\btea\b/],
    ["AVC", /\bavc\b|avecista|derrame/],
    ["Lesão medular ou trauma", /lesao medular|lesao na medula|lesao na medica|\blm\b|acidente|\btce\b|traumat/],
    ["Doença neuromuscular ou neurodegenerativa", /\bame\b|atrofia muscular|distrofia|miopatia|ataxia|paraplegia espa|leuco|pelizaeus|\bpmd\b|nbia|alexander|esclero/],
    ["Outras síndromes e doenças raras", /sindrom|sidrome|trissomia|doenca rara|genetic|patau|edward|rett|lesch|lesh|noonan|joubert|pitt|lowe|turner|robinow|dandy|pierre|harel|grin|foxg1|zmyz|cln5|hipomelanose|neurofibromatose|prune/],
    ["Hidrocefalia", /hidro\s?cef|idrocef|hidranencef|hidro anencef/],
    ["Microcefalia", /microcef|zika|zyka/],
    ["Epilepsia", /epilep|eplep|\bwest\b|dravet|lennox|convuls/],
    ["Assimetria craniana", /plagio|braqu|braque|assimetria crani|acimetria|escafocef|cabeca torta|torcicolo/],
    ["Encefalopatia hipóxico-isquêmica", /hipox|anoxia|parada cardio|\bpcr\b|afogamento/],
    ["Condição ortopédica", /fascite|esporao|esporrao|neuroma|hernia|joelho|pe plano|pes planos|pe torto|pes torto|metatars|metartal|discrepancia|fibromialgia|luxacao|displa\w* d[eo] quadril|displacia|hipermobilidade|cifose/],
    ["Malformação ou agenesia", /agenesia|agnesia|ma formacao|ma-formac|malforma|atresia|holoprosencef|holoprocencef|heloprosencef|lisencef|esquizencef|polimicrogiria|colpocef/],
    ["Deficiência visual ou auditiva", /visao|cegueira|visual|auditiv|audicao|retinopatia|retina/],
    ["Atraso do desenvolvimento sem diagnóstico", /atraso|sem diagnostico|nao possui diagnostico|em investigacao|investigacao/],
  ];
  D.GRUPOS_DIAG = GRUPOS_DIAG.map(g => g[0]).concat(["Outros"]);
  const PRIORIDADE = ["Paralisia cerebral", "Mielomeningocele", "Síndrome de Down", "TEA", "AVC", "Lesão medular ou trauma", "Doença neuromuscular ou neurodegenerativa", "Outras síndromes e doenças raras", "Hidrocefalia", "Microcefalia", "Assimetria craniana", "Condição ortopédica", "Malformação ou agenesia", "Encefalopatia hipóxico-isquêmica", "Atraso do desenvolvimento sem diagnóstico", "Epilepsia", "Deficiência visual ou auditiva"];
  D.diagnosticosDe = texto => {
    const t = baixo(texto); if (!t || /^(sim|nao|nada|nenhum|-)\b/.test(t) && t.length < 6) return [];
    const out = GRUPOS_DIAG.filter(([, re]) => re.test(t)).map(g => g[0]);
    // "Síndrome de West/Dravet/Lennox" é epilepsia; "síndrome congênita do Zika" é microcefalia: não contam como outra síndrome
    if (out.includes("Outras síndromes e doenças raras") && !/sindrom\w* de (?!west|dravet|lennox|down|dawn)|sidrome|trissomia (?!(do cromossomo )?21)|doenca rara|genetic|patau|edward|rett|lesch|lesh|noonan|joubert|pitt|lowe|turner|robinow|dandy|pierre|harel|grin|foxg1|zmyz|cln5|hipomelanose|neurofibromatose|prune/.test(t.replace(/sindrome congenita do zika/g, "")))
      out.splice(out.indexOf("Outras síndromes e doenças raras"), 1);
    if (!out.length) out.push("Outros");
    return out;
  };
  D.diagnosticoPrincipal = grupos => grupos.length ? (PRIORIDADE.find(g => grupos.includes(g)) || grupos[0]) : null;

  // atividades da vida diária
  const ATIV = [
    ["Locomoção", /\band(a|ar|o)?\b|caminh|locomo|marcha|deambul|mobilidade|cadeira de rodas|cadeirante|engatinh/],
    ["Sentar, ficar em pé e transferências", /sent[ae]|senta\b|em pe|de pe|transfer|rolar|tronco|cervical|levantar/],
    ["Alimentação", /\bcom[ei]r?\b|come\b|aliment|mastig|beber|tomar agua|copo|refei|degluti/],
    ["Higiene e banho", /banh|higien|escovar|dente|banheiro|fralda|toalete|pentear|barbear|autocuidado/],
    ["Vestir", /vest|roupa|calcar|abotoar|cadarco/],
    ["Comunicação", /\bfal[ao]r?\b|\bfala\b|comunica|verbal/],
    ["Uso das mãos", /\bmaos?\b|segurar|segura\b|pegar|manual|motora fina|escrever|lapis|pinca/],
  ];
  D.ATIVIDADES_AVD = ATIV.map(a => a[0]);
  D.avdDe = texto => {
    const t = baixo(texto); if (!t) return { nivel: null, ativ: [] };
    const ativ = ATIV.filter(([, re]) => re.test(t)).map(a => a[0]);
    let nivel;
    if (/\btod[ao]s?\b|\btudo\b|total|100 ?%|complet|qualquer|maxima|nada sozinh|pra tudo|para tudo|todo o cotidiano|nao consegue (fazer|realizar) (nada|atividad)|nao faz atividade|depende de (terceiros|alguem|ajuda|auxilio)|depende da (mae|familia)|depende das pessoas/.test(t)) nivel = NIVEIS_AVD[2];
    else if (ativ.length || /parcial|dificuldade|precisa de (mim|ajuda)/.test(t)) nivel = NIVEIS_AVD[1];
    else if (/^(nao|nenhum|nenhuma|nem uma|nao ha|no momento nenhum|nada)\b/.test(t)) nivel = NIVEIS_AVD[0];
    else if (/^sim\b/.test(t)) nivel = NIVEIS_AVD[3];
    else nivel = NIVEIS_AVD[4];
    return { nivel, ativ };
  };

  // município de Goiás a partir do texto digitado
  const ESTADOS_SUF = /\b(go|goias|df|distrito federal|sp|sao paulo|mg|minas gerais|brasil)\s*$/;
  const ALIAS = { apgoiania: "aparecidadegoiania", apdegoiania: "aparecidadegoiania", aparecida: "aparecidadegoiania", aparecidagoiania: "aparecidadegoiania", goiania: "goiania" };
  const lev = (a, b) => { if (Math.abs(a.length - b.length) > 1) return 9; const d = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return d[b.length]; };
  D.municipioGO = (texto, munNames) => {
    let t = baixo(texto).replace(/[*]/g, "").replace(/\s*[-\/(,].*$/, ""); if (!t) return null;
    for (let i = 0; i < 2; i++) t = t.replace(ESTADOS_SUF, "").trim();
    let k = D.key(t); if (!k || k === "goias") return null; k = ALIAS[k] || k;
    const by = new Map(munNames.map(n => [D.key(n), n])); if (by.has(k)) return by.get(k);
    if (k.length >= 6) { let best = null; by.forEach((n, kk) => { if (!best && lev(k, kk) <= 1) best = n; }); if (best) return best; }
    return null;
  };
  const titulo = s => tidy(s).replace(/\s*[-\/]\s*(go|goi[aá]s)\s*$/i, "").toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, w => w.toLowerCase());

  const dataDoCarimbo = s => { const t = tidy(s); let m = t.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/); if (m) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`;
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`; return ""; };
  const dataBR = v => { const t = tidy(v); let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`; return t; };
  const INSTITUCIONAL = /\bpacientes\b|ambulatorio|estudantes|professora?|pesquisador|contribuir|doar |comunidade|instituic|associacao|\bapae\b|internacao|criancas neuroatipicas|pcds/;

  // ---------------- planilha do Forms → ficha no formato da ferramenta
  // head/rows: cabeçalho e linhas da planilha; munNames: nomes dos municípios de Goiás (mapas.js)
  D.deInteresse = (head, rows, munNames) => {
    munNames = munNames || [];
    const col = {}; const extras = [];
    head.forEach((h, i) => { const k = D.key(h); if (!k) { extras.push(i); return; } const c = COLUNAS.find(([, re]) => re.test(k)); if (c && !(c[0] in col)) col[c[0]] = i; else col["x_" + i] = i; });
    const get = (r, k) => col[k] == null ? "" : D.celula(r[col[k]]);
    const catalogo = D.catalogoDe(rows.map(r => get(r, "mi_prod_texto")));
    const vistos = new Map();
    const data = rows.map((r, i) => {
      const envio = String(get(r, "mi_envio")), nome = String(get(r, "mi_nome"));
      let base = "mi:" + D.key(envio) + "|" + D.key(nome); const n = (vistos.get(base) || 0) + 1; vistos.set(base, n); if (n > 1) base += "#" + n;
      const o = { ec5_uuid: D.uuidDe(base), created_at: "" };
      const data = r[col.mi_envio] instanceof Date ? D.celula(r[col.mi_envio]) : dataDoCarimbo(envio);
      if (data) { const [d, m, y] = data.split("/"); o.created_at = `${y}-${m}-${d}T12:00:00.000Z`; }
      o.mi_envio = envio; o.mi_data = data;
      ["mi_email", "mi_nome", "mi_resp", "mi_tel", "mi_end", "mi_clinica", "mi_fisio", "mi_termo", "mi_diag_texto", "mi_avd_texto", "mi_prod_texto"].forEach(k => { if (k in col) o[k] = tidy(get(r, k)); });
      if ("mi_nasc" in col) o.mi_nasc = dataBR(get(r, "mi_nasc"));
      // local
      let est = tidy(get(r, "mi_estado")).replace(/\*+$/, "").trim(), cid = tidy(get(r, "mi_cidade"));
      if (!cid) { const ex = extras.map(j => tidy(D.celula(r[j]))).find(x => x && D.municipioGO(x, munNames)); if (ex) { cid = ex; if (!est && /goi[aá]s|\bgo\b/i.test(ex)) est = "Goiás"; } }
      const mun = cid ? D.municipioGO(cid, munNames) : null, foraGO = est && D.key(est) !== "goias";
      o.mi_estado = est || (mun ? "Goiás" : ""); o.mi_cidade = cid;
      o.mi_municipio = mun && !foraGO ? mun : cid ? titulo(cid) : "";
      // produto
      const prod = get(r, "mi_prod_texto"); o.mi_produto = D.produtosDe(prod);
      o.mi_item = [...new Set(codigosDe(prod))].map(c => c + " · " + (catalogo[c] || "item " + c));
      o.mi_n_produtos = o.mi_produto.length || "";
      // saúde e função
      const dg = D.diagnosticosDe(get(r, "mi_diag_texto")); o.mi_diag = dg; o.mi_diag_principal = D.diagnosticoPrincipal(dg) || "";
      const av = D.avdDe(get(r, "mi_avd_texto")); o.mi_avd_nivel = av.nivel || ""; o.mi_avd = av.ativ;
      o.mi_ortese = tidy(get(r, "mi_ortese")); o.mi_terapia = tidy(get(r, "mi_terapia"));
      o.mi_altura_texto = String(get(r, "mi_altura_texto")); o.mi_peso_texto = String(get(r, "mi_peso_texto"));
      const al = D.alturaCm(o.mi_altura_texto), pe = D.pesoKg(o.mi_peso_texto); o.mi_altura = isFinite(al) ? al : ""; o.mi_peso = isFinite(pe) ? pe : "";
      o.mi_solicitante = INSTITUCIONAL.test(baixo(prod + " " + get(r, "mi_diag_texto") + " " + get(r, "mi_avd_texto"))) ? "Instituição ou profissional" : "Pessoa ou família";
      // colunas que o formulário ganhar no futuro entram pelo caminho genérico, com o enunciado como chave
      Object.keys(col).filter(k => k.startsWith("x_")).forEach(k => { const h = head[col[k]]; o[h] = D.celula(r[col[k]]); });
      return o;
    });
    return [{ name: "manifestacao-de-interesse.json", json: { data }, planilha: "Manifestação de interesse", interesse: true }];
  };

  // ---------------- depois do build: vocabulário de solicitação, reenvios e ligação com a pesquisa
  // atendidos: [{nome, nasc (aaaa-mm-dd), data (aaaa-mm-dd)}] das fichas de anamnese da pesquisa (opcional)
  D.ajustarInteresse = (m, atendidos) => {
    const t = m.tables.part, rows = t.rows, V = m.vars;
    t.label = "Solicitações"; t.unidade = "solicitações";
    const rot = { d_data: ["Data da solicitação", "Dia em que o formulário foi enviado."], d_mes: ["Mês da solicitação"], d_pessoa: ["Pessoa (código)", "Código da primeira solicitação da pessoa; pedidos da mesma pessoa (mesmo nome e nascimento) têm o mesmo código."],
      d_momento: ["Ordem do pedido da pessoa", "1º pedido, 2º pedido…, pela data. Envios da mesma pessoa com menos de 30 dias de intervalo contam como reenvio do formulário."], d_n_aval: ["Nº de pedidos da pessoa"], d_dias_1a: ["Dias desde o 1º pedido"], d_idade: ["Idade na solicitação (anos)", "Data da solicitação − data de nascimento."], d_municipio: ["Município de residência"] };
    Object.entries(rot).forEach(([k, [l, d]]) => { if (V[k]) { V[k].label = l; if (d) V[k].desc = d; } });
    if (V.d_momento) { const lv = ["1º pedido", "2º pedido", "3º pedido", "4º pedido", "5º pedido"]; V.d_momento.levels = lv.filter(l => rows.some(r => r.d_momento && r.d_momento.startsWith(l[0]))); rows.forEach(r => { if (r.d_momento) r.d_momento = r.d_momento.replace(/ª avaliação$/, "º pedido"); }); V.d_momento.levels = V.d_momento.levels.filter(l => rows.some(r => r.d_momento === l)); }
    if (V.d_registrador) { delete V.d_registrador; t.vars = t.vars.filter(k => k !== "d_registrador"); }
    m.quality.forEach(q => { q.msg = q.msg.replace("Ficha duplicada de", "Reenvio do formulário de").replace("avaliações com menos de 30 dias", "menos de 30 dias entre os envios").replace("data da avaliação", "data da solicitação").replace("Data da avaliação", "Data da solicitação"); });
    // reenvio (mesma pessoa, menos de 30 dias): os produtos e itens pedidos no reenvio passam para o pedido mantido
    const porId = new Map(rows.map(r => [r._id, r]));
    rows.filter(r => r._dup).forEach(r => { const alvo = porId.get(r._dup); if (!alvo) return; ["mi_produto", "mi_item", "mi_diag", "mi_avd"].forEach(k => { if (Array.isArray(r[k]) && Array.isArray(alvo[k])) r[k].forEach(x => { if (!alvo[k].includes(x)) alvo[k].push(x); }); }); if (V.mi_n_produtos) alvo.mi_n_produtos = (alvo.mi_produto || []).length || null; });
    ["mi_produto", "mi_item", "mi_diag", "mi_avd"].forEach(k => { const v = V[k]; if (!v || !v.levels) return; const ordem = k === "mi_produto" ? D.GRUPOS_PRODUTO : k === "mi_diag" ? D.GRUPOS_DIAG : k === "mi_avd" ? D.ATIVIDADES_AVD : null;
      if (ordem) rows.forEach(r => { if (Array.isArray(r[k])) r[k].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b)); }); });
    // atendida no laboratório: mesma pessoa (nome e nascimento) numa ficha de anamnese da pesquisa
    if (atendidos && atendidos.length) {
      const by = new Map(); atendidos.forEach(a => { const k = D.key(a.nome || ""); if (!k) return; (by.get(k) || by.set(k, []).get(k)).push(a); });
      const achar = r => { const l = by.get(D.key(r.mi_nome || "")); if (!l) return null; return l.filter(a => !a.nasc || !r.mi_nasc || a.nasc === r.mi_nasc).sort((a, b) => String(a.data).localeCompare(String(b.data)))[0] || null; };
      const add = (id, meta, fn) => { V[id] = Object.assign({ id, derived: true, source: "Calculada", section: "Atendimento no laboratório" }, meta); if (!t.vars.includes(id)) t.vars.push(id); rows.forEach(r => { const v = fn(r); r[id] = v == null || (typeof v === "number" && !isFinite(v)) ? null : v; }); };
      add("i_atendido", { label: "Atendida no laboratório", type: "cat", levels: ["Sim", "Não"], ordinal: true, desc: "Sim quando a mesma pessoa (mesmo nome, sem acentos nem maiúsculas, e mesma data de nascimento quando as duas têm) tem ficha de anamnese na base da pesquisa carregada nesta ferramenta." }, r => achar(r) ? "Sim" : "Não");
      add("i_espera", { label: "Dias entre a solicitação e a 1ª avaliação", type: "num", unit: "dias", desc: "Data da 1ª ficha de anamnese − data da solicitação. Avaliações anteriores à solicitação (a pessoa já era atendida) ou mais de 1000 dias depois (data provavelmente errada) ficam sem valor." }, r => { const a = achar(r); if (!a || !a.data || !r.d_data) return null; const d = Math.round((Date.parse(a.data) - Date.parse(r.d_data)) / 864e5); return d >= 0 && d <= 1000 ? d : null; });
      V.i_atendido.n = rows.length; V.i_atendido.missing = 0;
    }
    return m;
  };
})(typeof window !== "undefined" ? window : globalThis);
