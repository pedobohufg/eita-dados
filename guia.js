/*
  EITA! DADOS — guia de estatística para a equipe (textos, glossário e leituras)
  © 2026 Lab.EITA/UFG. Autor: Pedro Henrique Gonçalves. Todos os direitos reservados.
*/
(function (root) {
  "use strict";
  const L = {
    normalidade: { t: "Miot HA. Avaliação da normalidade dos dados em estudos clínicos e experimentais. J Vasc Bras. 2017;16(2):88-91.", u: "https://www.scielo.br/j/jvb/a/FPW5hwZ6DTH4gvj5mJYpt6B/?lang=pt" },
    correlacao: { t: "Miot HA. Análise de correlação em estudos clínicos e experimentais. J Vasc Bras. 2018;17(4):275-9.", u: "https://www.scielo.br/j/jvb/a/YwjG3GsXpBFrZLQhFQG45Rb/" },
    ausentes: { t: "Miot HA. Valores anômalos e dados faltantes em estudos clínicos e experimentais. J Vasc Bras. 2019;18:e20190004.", u: "https://www.scielo.br/j/jvb/a/mygXvfCbQ6q4Dz5DtFbkV4D/?lang=pt" },
    concordancia: { t: "Miot HA. Análise de concordância em estudos clínicos e experimentais. J Vasc Bras. 2016;15(2):89-92.", u: "https://doi.org/10.1590/1677-5449.004216" },
    amostra: { t: "Miot HA. Tamanho da amostra em estudos clínicos e experimentais. J Vasc Bras. 2011;10(4):275-8.", u: "https://doi.org/10.1590/S1677-54492011000400001" },
    categoricas: { t: "Miola AC, Miot HA. Comparing categorical variables in clinical and experimental studies. J Vasc Bras. 2022 (em inglês, com versão em português na revista).", u: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8992732" },
    efeito1: { t: "Espírito-Santo H, Daniel F. Calcular e apresentar tamanhos do efeito em trabalhos científicos (1): as limitações do p < 0,05 na análise de diferenças de médias de dois grupos. RPICS. 2015;1(1):3-16.", u: "https://doi.org/10.7342/ismt.rpics.2015.1.1.14" },
    efeito2: { t: "Espírito-Santo H, Daniel F. Calcular e apresentar tamanhos do efeito em trabalhos científicos (2): guia para reportar a força das relações. RPICS. 2017;3(1):53-64.", u: "https://doi.org/10.7342/ismt.rpics.2017.3.1.48" },
    efeito3: { t: "Espírito-Santo H, Daniel F. Calcular e apresentar tamanhos do efeito em trabalhos científicos (3): guia para reportar os tamanhos do efeito para análises de regressão e ANOVAs. RPICS. 2018.", u: "https://dialnet.unirioja.es/descarga/articulo/6325689.pdf" },
    strobe: { t: "Malta M, Cardoso LO, Bastos FI, Magnanini MMF, Silva CMFP. Iniciativa STROBE: subsídios para a comunicação de estudos observacionais. Rev Saúde Pública. 2010;44(3):559-65.", u: "https://www.scielo.br/j/rsp/a/3gYcXJLzXksk6bLLpvTdnYf/?lang=pt" },
    logistica: { t: "Exemplo comentado das etapas de uma regressão logística multivariada em estudo caso-controle. Rev Saúde Pública. 1998;32(1):82-8.", u: "https://scielosp.org/pdf/rsp/1998.v32n1/82-88/pt" },
    normasSF: { t: "Cruz LN et al. Qualidade de vida relacionada à saúde no Brasil: dados normativos para o SF-36 em uma amostra da população geral do sul do Brasil. Ciênc Saúde Coletiva. 2013;18(7):1911-21.", u: "https://doi.org/10.1590/S1413-81232013000700006" },
    normasSF2: { t: "Laguardia J et al. Dados normativos brasileiros do questionário Short Form-36 versão 2. Rev Bras Epidemiol. 2013;16(4):889-97.", u: "https://www.scielo.br/j/rbepid/a/jKQdkPHXVmGFvgLghfbrq4P/" },
    bipq: { t: "Broadbent E, Petrie KJ, Main J, Weinman J. The Brief Illness Perception Questionnaire. J Psychosom Res. 2006;60(6):631-7.", u: "https://doi.org/10.1016/j.jpsychores.2005.10.020" },
    jamovi: { t: "jamovi — programa estatístico gratuito, com menus (bom para conferir os resultados).", u: "https://www.jamovi.org" },
    jasp: { t: "JASP — programa estatístico gratuito, com menus e explicações dos resultados.", u: "https://jasp-stats.org" },
    r: { t: "R — linguagem estatística gratuita (os scripts de cada análise podem ser copiados na ferramenta).", u: "https://www.r-project.org" },
  };

  // Glossário (aparece ao passar o mouse nos termos das tabelas)
  const G = {
    "p": "Valor de p: probabilidade de observar uma diferença (ou associação) pelo menos tão grande quanto a encontrada se, na verdade, ela não existisse na população. p < 0,05 = resultado “estatisticamente significativo”. Não mede o tamanho nem a importância do efeito.",
    "p ajustado": "Valor de p corrigido porque várias comparações foram feitas ao mesmo tempo (correção de Holm). Sem a correção, quanto mais comparações, maior a chance de um falso positivo.",
    "IC 95%": "Intervalo de confiança de 95%: faixa de valores plausíveis para o valor verdadeiro na população. Intervalo estreito = estimativa precisa. Se o IC de uma diferença não inclui 0 (ou o de uma razão de chances não inclui 1), o resultado é significativo a 5%.",
    "DP": "Desvio padrão: o quanto os valores se espalham em torno da média. Use com a média quando os dados são simétricos (aproximadamente normais).",
    "IIQ": "Intervalo interquartil: do 1º quartil (25% dos valores abaixo) ao 3º quartil (75% abaixo). Contém a metade central dos dados. Use com a mediana quando os dados são assimétricos.",
    "Mediana": "Valor do meio quando os dados são ordenados: metade fica abaixo, metade acima. Não é puxada por valores extremos.",
    "Média": "Soma dos valores dividida pelo número de valores. É puxada por valores extremos.",
    "Shapiro-Wilk": "Teste de normalidade. p ≥ 0,05: os dados são compatíveis com a distribuição normal (pode usar testes paramétricos). p < 0,05: os dados fogem da normal (prefira testes não paramétricos).",
    "n": "Número de casos com dado válido naquela análise.",
    "RC": "Razão de chances (odds ratio): quantas vezes a chance do evento muda. RC = 1: sem efeito; RC = 2: chance duas vezes maior; RC = 0,5: chance pela metade.",
    "B": "Coeficiente de regressão: quanto o desfecho muda, em média, quando o preditor aumenta 1 unidade (ou em relação à categoria de referência), mantidos os outros preditores constantes.",
    "EP": "Erro padrão: incerteza da estimativa. Quanto menor, mais precisa.",
    "β padronizado": "Coeficiente em desvios padrão: permite comparar a força de preditores medidos em unidades diferentes.",
    "R²": "Proporção da variação do desfecho explicada pelo modelo (0 a 1). R² = 0,20 = 20% da variação explicada.",
    "R² ajustado": "R² corrigido pelo número de preditores; não aumenta só por acrescentar variáveis.",
    "η²": "Eta ao quadrado: proporção da variação explicada pelos grupos (ANOVA). 0,01 pequeno; 0,06 médio; 0,14 grande.",
    "ε²": "Épsilon ao quadrado: tamanho de efeito do Kruskal-Wallis, lido como o η². 0,01 pequeno; 0,06 médio; 0,14 grande.",
    "g de Hedges": "Diferença entre duas médias em desvios padrão (versão corrigida do d de Cohen). 0,2 pequeno; 0,5 médio; 0,8 grande.",
    "r": "No Mann-Whitney e no Wilcoxon: tamanho de efeito (0,1 pequeno; 0,3 médio; 0,5 grande). Na correlação de Pearson: coeficiente de −1 a +1.",
    "ρ": "Rô de Spearman: correlação entre as ordens (postos) dos valores, de −1 a +1. Não exige normalidade nem relação linear.",
    "V de Cramér": "Força da associação entre duas variáveis categóricas (0 a 1). Em tabelas 2×2: 0,1 pequena; 0,3 média; 0,5 grande.",
    "α": "Alfa de Cronbach: consistência interna de um conjunto de itens (0 a 1). ≥ 0,7 aceitável; ≥ 0,8 boa; ≥ 0,9 excelente.",
    "Escore z": "Quantos desvios padrão um valor está acima (positivo) ou abaixo (negativo) da média de referência.",
    "Estatística": "Valor calculado pelo teste (t, U, H, χ², F…). É convertido no valor de p; deve ser informado no artigo junto com os graus de liberdade.",
    "Tamanho de efeito": "Quanto os grupos diferem ou quão forte é a relação, numa escala que não depende do tamanho da amostra. Complementa o p, que só diz se há evidência de diferença.",
  };

  // Ajuda por análise
  const T = {
    descritiva: {
      titulo: "Estatística descritiva", quando: "Primeiro passo de qualquer análise: resumir a amostra antes de testar hipóteses.",
      como: ["Números simétricos (Shapiro-Wilk p ≥ 0,05): média ± desvio padrão.", "Números assimétricos (p < 0,05), escalas e escores com teto ou chão: mediana [intervalo interquartil].", "Categorias: n (%), com a porcentagem calculada sobre quem respondeu.", "Sempre olhe o histograma (tela Explorar): o teste de normalidade é muito sensível em amostras grandes e pouco sensível em amostras pequenas."],
      erros: ["Apresentar média ± DP de uma variável muito assimétrica (por exemplo, dias de UTIN).", "Calcular porcentagem sobre o total quando há muitas respostas em branco: informe quantos responderam."],
      jamovi: "Exploration → Descriptives (marque Shapiro-Wilk e os gráficos).", leituras: ["normalidade", "ausentes"] },
    comparar: {
      titulo: "Comparar grupos (número × categoria)", quando: "Um desfecho numérico (por exemplo, escore do B-IPQ) comparado entre 2 ou mais grupos independentes (por exemplo, diagnósticos). Cada pessoa está em um só grupo.",
      pressupostos: ["Testes paramétricos (t, ANOVA): distribuição aproximadamente normal em cada grupo. Com variâncias diferentes, a ferramenta usa as versões de Welch.", "Testes não paramétricos (Mann-Whitney, Kruskal-Wallis): não exigem normalidade; comparam as distribuições (ordens dos valores). Informe medianas.", "Observações independentes: a mesma pessoa não pode estar em dois grupos."],
      como: ["Valor de p < 0,05: há evidência de diferença entre os grupos.", "Tamanho de efeito: quanto os grupos diferem. Um p pequeno com efeito desprezível costuma não ter importância clínica.", "Com 3 ou mais grupos, o teste geral só diz que algum grupo difere; as comparações par a par (com p ajustado) dizem quais.", "Grupos com menos de 5 casos tornam o resultado frágil: junte categorias ou deixe-os de fora."],
      erros: ["Fazer vários testes t entre pares de grupos sem correção (aumenta os falsos positivos).", "Concluir que “não há diferença” só porque p ≥ 0,05: com amostra pequena, pode faltar poder estatístico.", "Ler associação como causa: estes dados são observacionais."],
      jamovi: "2 grupos: T-Tests → Independent Samples T-Test (marque Welch's e Mann-Whitney U). 3 ou mais: ANOVA → One-Way ANOVA, ou ANOVA → Non-Parametric → One-Way ANOVA (Kruskal-Wallis). No jamovi o pós-teste não paramétrico é o DSCF; aqui é o de Dunn — os resultados são parecidos, mas não idênticos.",
      leituras: ["normalidade", "efeito1", "efeito3"] },
    associacao: {
      titulo: "Associação entre categorias", quando: "Duas variáveis categóricas (por exemplo, sexo × uso de órtese). Pergunta: a distribuição de uma muda conforme a outra?",
      pressupostos: ["Qui-quadrado: frequências esperadas de ao menos 5 em 80% das caselas. Se não, a ferramenta troca sozinha para o exato de Fisher (2×2) ou para o p por simulação de Monte Carlo (tabelas maiores).", "Cada pessoa conta uma vez."],
      como: ["Compare as porcentagens na linha (ou na coluna) para ver onde está a diferença.", "p < 0,05: as variáveis estão associadas.", "V de Cramér: força da associação.", "Razão de chances (2×2): quantas vezes a chance muda de um grupo para o outro."],
      erros: ["Usar o qui-quadrado com muitas caselas vazias ou com frequência esperada baixa.", "Apresentar só o p, sem as porcentagens.", "Criar categorias demais: junte as raras (tela Variáveis)."],
      jamovi: "Frequencies → Independent Samples: χ² test of association (em Statistics, marque Fisher's exact e Cramer's V; em Cells, as porcentagens).", leituras: ["categoricas", "efeito2"] },
    correlacao: {
      titulo: "Correlação", quando: "Duas variáveis numéricas medidas nas mesmas pessoas (por exemplo, idade × escore motor). Pergunta: quando uma aumenta, a outra tende a aumentar ou diminuir?",
      pressupostos: ["Pearson (r): relação linear e dados aproximadamente normais, sem valores extremos.", "Spearman (ρ): só precisa de uma relação que sobe ou desce sempre na mesma direção; é a escolha segura para escores e escalas."],
      como: ["O sinal mostra o sentido: positivo (sobem juntas) ou negativo (uma sobe, a outra desce).", "Força pelo valor absoluto: < 0,1 desprezível; 0,1–0,3 fraca; 0,3–0,5 moderada; ≥ 0,5 forte.", "Sempre olhe o gráfico de dispersão: um ponto extremo pode criar ou esconder uma correlação.", "Com muitas variáveis, alguns p < 0,05 aparecem por acaso."],
      erros: ["Concluir causalidade a partir de uma correlação.", "Usar correlação para avaliar concordância entre dois avaliadores ou instrumentos (o certo é ICC ou Bland-Altman)."],
      jamovi: "Regression → Correlation Matrix (marque Pearson e/ou Spearman e Report significance).", leituras: ["correlacao", "concordancia", "efeito2"] },
    regressao: {
      titulo: "Regressão linear múltipla", quando: "Explicar um desfecho numérico por vários preditores ao mesmo tempo, separando o efeito de cada um (por exemplo, o B-IPQ explicado por diagnóstico e idade, um ajustado pelo outro).",
      pressupostos: ["Relação linear entre preditores numéricos e desfecho.", "Resíduos com distribuição aproximadamente normal e variância constante (veja o gráfico de resíduos: deve parecer uma nuvem sem forma).", "Ao menos 10 a 15 casos por preditor.", "Preditores pouco correlacionados entre si."],
      como: ["B: quanto o desfecho muda por unidade do preditor (ou em relação à categoria de referência), mantido o resto constante.", "IC 95% de B que não inclui 0 = associação significativa.", "R²: quanto da variação do desfecho o modelo explica.", "β padronizado: compara a força relativa dos preditores."],
      erros: ["Pôr muitos preditores para poucos casos (superajuste).", "Escolher preditores só porque deram p < 0,05 na análise bivariada, sem justificativa teórica."],
      jamovi: "Regression → Linear Regression (em Model Coefficients, marque Confidence interval e Standardized estimate; em Assumption Checks, Normality e Residuals plots).", leituras: ["efeito3"] },
    logistica: {
      titulo: "Regressão logística", quando: "O desfecho é sim/não (por exemplo, usa órtese) e você quer estimar a influência de vários preditores ao mesmo tempo.",
      pressupostos: ["Desfecho binário: escolha qual categoria é o evento (“1”).", "Ao menos 10 eventos por preditor (eventos = a categoria menos frequente).", "Sem separação perfeita: se uma categoria do preditor tem 0% ou 100% de eventos, o modelo não converge bem; junte categorias."],
      como: ["Razão de chances (RC) > 1: o preditor aumenta a chance do evento; < 1: diminui.", "IC 95% da RC que não inclui 1 = associação significativa.", "Para categorias, a RC compara com a categoria de referência indicada.", "R² de Nagelkerke: medida aproximada de ajuste (não é igual ao R² da regressão linear)."],
      erros: ["Interpretar a RC como risco relativo quando o evento é comum (aqui o evento costuma ser comum, então a RC exagera o risco).", "Ignorar ICs enormes (sinal de poucos casos naquela categoria)."],
      jamovi: "Regression → 2 Outcomes: Binomial (em Model Coefficients, marque Odds ratio e Confidence interval).", leituras: ["logistica", "efeito3"] },
    pareado: {
      titulo: "Antes e depois (amostras pareadas)", quando: "A mesma pessoa medida duas vezes (por exemplo, antes e depois de receber a órtese). Compara-se a mudança dentro de cada pessoa.",
      pressupostos: ["t pareado: as diferenças (depois − antes) com distribuição aproximadamente normal.", "Wilcoxon: não exige normalidade das diferenças.", "Ao menos 3 pares; para conclusões firmes, bem mais."],
      como: ["Olhe a diferença média (ou mediana) e o IC 95%.", "p < 0,05: houve mudança.", "No gráfico, cada linha é uma pessoa: azul subiu, vermelho desceu."],
      erros: ["Usar o teste para grupos independentes com dados pareados (perde poder).", "Atribuir a mudança à intervenção sem grupo de comparação: o tempo, o crescimento da criança e outros fatores também mudam o resultado."],
      jamovi: "T-Tests → Paired Samples T-Test (marque Wilcoxon rank). Os dados precisam estar em colunas lado a lado (antes, depois).", leituras: ["normalidade", "efeito1"] },
    normas: {
      titulo: "SF-36 comparado às normas brasileiras", quando: "Saber se a qualidade de vida dos responsáveis está acima ou abaixo da população geral.",
      pressupostos: ["A referência deve ser parecida com a amostra (idade, sexo, versão do questionário). As normas de Cruz et al. (2013) são do SF-36 versão 1, adultos de 20 a 64 anos de Porto Alegre.", "Teste para uma amostra: compara a média da amostra com um valor fixo (a média normativa)."],
      como: ["Diferença negativa e p < 0,05: escore abaixo da população.", "Escore z médio: −0,5 = meio desvio padrão abaixo da população (diferença moderada); −1 = um desvio padrão (grande).", "% abaixo da norma: proporção da amostra com escore menor que a média da população."],
      erros: ["Comparar com normas de outra versão (SF-36 v2 tem pontuação baseada em normas, média 50).", "Esquecer que quem responde aqui é o responsável, não a criança."],
      jamovi: "T-Tests → One Sample T-Test (em Test value, a média normativa; marque Wilcoxon rank).", leituras: ["normasSF", "normasSF2"] },
    ausentes: {
      titulo: "Dados ausentes", quando: "Antes das análises principais: saber quanto falta, onde falta e se quem não respondeu é diferente de quem respondeu.",
      como: ["Até ~5% de falta numa variável costuma ter pouco impacto.", "Se quem não respondeu é diferente (p < 0,05 na comparação), analisar só quem respondeu pode distorcer os resultados (viés). Relate isso como limitação.", "Valores impossíveis viraram “sem resposta” (tela Qualidade): o ideal é corrigir na ficha original."],
      erros: ["Substituir ausentes pela média sem justificar.", "Não informar no artigo quantos casos entraram em cada análise."],
      jamovi: "Exploration → Descriptives mostra o número de ausentes por variável.", leituras: ["ausentes"] },
    confiabilidade: {
      titulo: "Confiabilidade (alfa de Cronbach)", quando: "Verificar se os itens de uma escala medem a mesma coisa na sua amostra (consistência interna).",
      como: ["α ≥ 0,7 aceitável; ≥ 0,8 bom; ≥ 0,9 excelente (acima de 0,95 pode indicar itens repetitivos).", "Correlação item-total baixa (< 0,3) ou α que sobe ao retirar o item: aquele item destoa do conjunto.", "Itens com sentido invertido precisam ser recodificados antes."],
      erros: ["Calcular α de itens que medem coisas diferentes (por exemplo, os itens do B-IPQ, cada um uma dimensão).", "Interpretar α com menos de 30 respondentes."],
      jamovi: "Factor → Reliability Analysis (marque Cronbach's α e item-rest correlation).", leituras: ["efeito2"] },
    tabela1: {
      titulo: "Tabela 1 (caracterização da amostra)", quando: "Primeira tabela de quase todo artigo: descreve quem participou e, se houver grupos, compara-os.",
      como: ["Cada linha mostra o resumo adequado ao tipo de dado, com a medida usada escrita na própria linha.", "A coluna p compara os grupos; as letras sobrescritas indicam o teste, explicado na nota.", "Copie para o Word e ajuste a formatação da revista; o texto de métodos sai pronto embaixo."],
      erros: ["Mostrar p em ensaio clínico randomizado (lá as diferenças de base são aleatórias por definição).", "Omitir quantos responderam cada item."], leituras: ["strobe"] },
    fluxo: {
      titulo: "Fluxograma de participantes", quando: "Mostrar de onde veio a amostra analisada: quantos foram registrados, quantos saíram e por quê. É pedido pela declaração STROBE para estudos observacionais.",
      como: ["Caixas tracejadas = exclusões, com o motivo.", "As caixas de baixo mostram quantos responderam cada instrumento: use esses n nas tabelas."], leituras: ["strobe"] },
  };

  // Seções gerais do guia
  const S = [
    { id: "passos", titulo: "Roteiro: do Epicollect ao artigo", html: `<ol>
      <li><b>Carregue</b> a exportação do Epicollect (JSON ou CSV) ou uma planilha do Excel (tela Dados) e confira as <b>regras de inclusão</b>.</li>
      <li><b>Limpe</b>: na tela Qualidade, corrija no Epicollect o que for erro de digitação; na tela Variáveis, junte categorias escritas de jeitos diferentes. Exporte as regras para a equipe usar as mesmas.</li>
      <li><b>Defina a pergunta</b> antes de testar: qual é o desfecho, quais são os grupos ou preditores. Escreva isso no projeto.</li>
      <li><b>Descreva</b> a amostra (Tabela para artigo) e o fluxo dos participantes (Fluxograma).</li>
      <li><b>Teste</b> só as hipóteses planejadas (Estatística). Use o teste que a ferramenta indica e leia o “Como ler este resultado”.</li>
      <li><b>Junte no Relatório</b> tudo que vai para o artigo. Ele guarda os filtros, a versão da base e as regras usadas.</li>
      <li><b>Confira</b> num segundo programa (jamovi, JASP ou R): cada análise tem o caminho dos menus e o script pronto.</li></ol>` },
    { id: "conceitos", titulo: "Conceitos que aparecem em todas as análises", html: `
      <h4>Tipos de variável</h4><p><b>Numérica</b> (idade, escore): resumida por média ou mediana. <b>Categórica</b> (sexo, diagnóstico): resumida por n (%). <b>Ordinal</b> (escolaridade, escala de 1 a 5): categorias com ordem; em geral analisada com testes não paramétricos.</p>
      <h4>Média ± DP ou mediana [IIQ]?</h4><p>A média resume bem dados simétricos. Quando a distribuição é torta (muitos valores baixos e poucos muito altos, como renda ou dias de internação) ou tem teto/chão (escores do SF-36), a mediana e o intervalo interquartil representam melhor o “típico”. A ferramenta decide pelo teste de Shapiro-Wilk, mas olhe também o histograma.</p>
      <h4>Valor de p</h4><p>É a probabilidade de encontrar uma diferença pelo menos tão grande quanto a observada se, na população, ela não existisse. Por convenção, p &lt; 0,05 é chamado de significativo. O p <b>não</b> diz o tamanho da diferença, nem se ela importa na prática, nem a probabilidade de a hipótese ser verdadeira.</p>
      <h4>Intervalo de confiança de 95%</h4><p>Faixa de valores plausíveis para o valor verdadeiro. Diz ao mesmo tempo a direção, o tamanho e a precisão do resultado, por isso as revistas preferem o IC ao p sozinho.</p>
      <h4>Tamanho de efeito</h4><p>Mede quanto os grupos diferem ou quão forte é uma relação, sem depender do tamanho da amostra. Com amostras grandes, diferenças pequenas e sem importância dão p &lt; 0,05; com amostras pequenas, diferenças grandes podem não chegar lá. Por isso informe sempre o efeito junto com o p.</p>
      <h4>Paramétrico × não paramétrico</h4><p>Testes paramétricos (t, ANOVA, Pearson) supõem distribuição normal e comparam médias; são mais poderosos quando a suposição vale. Não paramétricos (Mann-Whitney, Kruskal-Wallis, Spearman, Wilcoxon) trabalham com a ordem dos valores, valem para qualquer distribuição e são a escolha segura para escalas e escores.</p>
      <h4>Muitas comparações</h4><p>A cada teste feito a 5%, há 1 chance em 20 de um falso positivo. Fazendo 20 testes, espera-se um “significativo” por acaso. Planeje poucas hipóteses, use as correções que a ferramenta já aplica (Holm) e trate o resto como exploratório.</p>
      <h4>Associação não é causa</h4><p>Os dados do laboratório são observacionais: mostram que duas coisas andam juntas, não que uma causa a outra. Escreva “associou-se a”, não “causou” ou “levou a”.</p>` },
    { id: "escolha", titulo: "Qual análise usar?", html: `<table class="t"><thead><tr><th>Pergunta</th><th>Tipo de dado</th><th>Análise (aba da ferramenta)</th></tr></thead><tbody>
      <tr><td>Como é a amostra?</td><td>qualquer</td><td>Descritiva · Tabela para artigo</td></tr>
      <tr><td>Um número difere entre 2 grupos?</td><td>número × categoria com 2 níveis</td><td>Comparar grupos → t de Welch ou Mann-Whitney</td></tr>
      <tr><td>Um número difere entre 3 ou mais grupos?</td><td>número × categoria</td><td>Comparar grupos → ANOVA ou Kruskal-Wallis + pós-teste</td></tr>
      <tr><td>Duas categorias estão associadas?</td><td>categoria × categoria</td><td>Associação → qui-quadrado ou Fisher</td></tr>
      <tr><td>Dois números andam juntos?</td><td>número × número</td><td>Correlação → Spearman ou Pearson</td></tr>
      <tr><td>Vários fatores explicam um número?</td><td>desfecho numérico</td><td>Regressão linear</td></tr>
      <tr><td>Vários fatores explicam um sim/não?</td><td>desfecho binário</td><td>Regressão logística</td></tr>
      <tr><td>A pessoa mudou entre duas avaliações?</td><td>mesmo número, 2 momentos</td><td>Antes e depois → t pareado ou Wilcoxon</td></tr>
      <tr><td>A amostra difere da população?</td><td>SF-36</td><td>SF-36 × normas</td></tr>
      <tr><td>Os itens de uma escala são consistentes?</td><td>vários itens numéricos</td><td>Confiabilidade → alfa de Cronbach</td></tr>
      <tr><td>Quanto falta e isso distorce?</td><td>qualquer</td><td>Dados ausentes</td></tr></tbody></table>` },
    { id: "instrumentos", titulo: "Os instrumentos do laboratório", html: `
      <h4>B-IPQ (Brief Illness Perception Questionnaire)</h4><p>Percepção do responsável sobre a condição da criança, em 8 itens de 0 a 10 (consequências, duração, controle pessoal, controle pelo tratamento, identidade/sintomas, preocupação, compreensão, resposta emocional) e uma pergunta aberta sobre as causas. O escore total vai de 0 a 80: <b>quanto maior, mais ameaçadora a percepção</b>. Os itens de controle e de compreensão são invertidos no total. Cada item é uma dimensão própria, por isso o alfa de Cronbach não é indicado.</p>
      <h4>SF-36</h4><p>Qualidade de vida relacionada à saúde do responsável, em 8 domínios de 0 a 100: <b>0 = pior estado, 100 = melhor</b>. Domínios físicos: capacidade funcional, limitação por aspectos físicos, dor e estado geral de saúde. Domínios mentais: vitalidade, aspectos sociais, limitação por aspectos emocionais e saúde mental. Não existe escore total no método de Ciconelli: analise por domínio.</p>
      <h4>B-QUEST 2.0</h4><p>Satisfação com o dispositivo de tecnologia assistiva, em 12 itens de 1 (nada satisfeito) a 5 (totalmente satisfeito): 8 sobre o dispositivo e 4 sobre os serviços. Escores são médias de 1 a 5. A unidade é a avaliação do dispositivo: uma pessoa pode ter vários.</p>` },
    { id: "escrever", titulo: "Como escrever os resultados", html: `<ul>
      <li>Informe o teste, a estatística com os graus de liberdade, o valor de p e o tamanho de efeito: “(Kruskal-Wallis: H(3) = 12,4; p = 0,006; ε² = 0,08)”.</li>
      <li>Escreva p com duas ou três casas (p = 0,032) e, abaixo de 0,001, “p &lt; 0,001”. Não escreva “p = 0,000”.</li>
      <li>Junte a medida descritiva de cada grupo: média ± DP para testes paramétricos, mediana [IIQ] para não paramétricos.</li>
      <li>Para regressões, informe o coeficiente (B ou RC) com IC 95%, não só o p.</li>
      <li>Diga quantos casos entraram em cada análise quando houver dados ausentes.</li>
      <li>Use as frases prontas da ferramenta como ponto de partida e adapte ao estilo da revista.</li></ul>` },
  ];

  root.EGuia = { L, G, T, S };
})(typeof window !== "undefined" ? window : globalThis);
