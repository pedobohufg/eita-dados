/*
  EITA! DADOS — rótulos e regras dos formulários conhecidos do Lab.EITA (Epicollect5)
  As chaves são as do JSON exportado pelo Epicollect (número da pergunta + começo do texto).
  Se a chave não bater exatamente, o campo entra pelo caminho genérico, sem perder dados.
  * no rótulo = texto reconstruído a partir da chave truncada; confirme com o formulário original
    (ou carregue a "definição do projeto" do Epicollect para trazer os enunciados completos).
  © 2026 Lab.EITA/UFG. Autor: Pedro Henrique Gonçalves. Todos os direitos reservados.
*/
(function (root) {
  "use strict";
  const SIM_AJUDA = ["Não", "Com Ajuda", "Sim"];
  const SUPORTE = ["Não consegue", "Com muito suporte", "Com pouco suporte", "Sem suporte/independente"];
  const AJUDA = ["Não consegue", "Consegue com muita ajuda", "Consegue com pouca ajuda", "Consegue sem ajuda"];
  const SN = ["Sim", "Não"];

  const F = {}; // chave -> metadados
  const add = (sec, list) => list.forEach(([k, label, o]) => { F[k] = Object.assign({ label, section: sec }, o || {}); });

  // ---------------- Ficha de anamnese
  add("Identificação", [
    ["1_Ficha_de_Anamnese", "Nome (título da ficha)", { pii: true }],
    ["2_Data_da_avaliao", "Data da avaliação (como digitada)", { type: "date", hide: true }],
    ["3_Avaliadores", "Avaliadores (nomes)", { pii: true }],
    ["4_Nome_do_participan", "Nome do participante", { pii: true }],
    ["5_Foto_do_participan", "Foto do participante", { pii: true }],
    ["6_Data_de_nascimento", "Data de nascimento", { type: "date", pii: true }],
    ["7_Sexo", "Sexo"],
    ["8_Peso_em_gramas", "Peso (g, como digitado)", { type: "num", hide: true }],
    ["9_Altura__em_centmet", "Altura (cm)", { type: "num", unit: "cm", range: [40, 210] }],
    ["10_Diagnstico_clnico", "Diagnóstico clínico", { type: "multi" }],
    ["11_Se_outro_diagonst", "Outro diagnóstico (texto)", { type: "text" }],
    ["12_Faz_tratamento_em", "Local de tratamento", { type: "multi" }],
    ["13_Faz_tratamento_em", "Outro local de tratamento (texto)", { type: "text" }],
    ["14_Tipo_de_atendimen", "Atendimentos que recebe", { type: "multi" }],
    ["15_Adulto_ou_Criana", "Adulto ou criança"],
  ]);
  add("Gestação e parto", [
    ["16_Tempo_de_rotura_d", "Tempo de rotura da bolsa (texto)", { type: "text" }],
    ["17_Sinais_de_sofrime", "Sinais de sofrimento fetal", { order: SN }],
    ["18_Tipo_de_gestao", "Tipo de gestação", { order: ["Única", "Dupla", "Tripla"] }],
    ["19_Tipo_de_parto", "Tipo de parto"],
    ["20_Local_do_parto", "Local do parto (texto)", { type: "text" }],
    ["21_Durao_do_parto", "Duração do parto (texto)", { type: "text" }],
    ["22_A_criana_chorou", "A criança chorou ao nascer", { order: SN }],
    ["23_Houve_alguma_comp", "Houve complicação no parto", { order: SN }],
    ["24_Se_sim_qual", "Complicação no parto (texto)", { type: "text" }],
    ["25_Idade_gestacional", "Idade gestacional (texto)", { type: "text" }],
    ["26_Peso_ao_nascer", "Peso ao nascer (texto)", { type: "text" }],
    ["27_Comprimento_ao_na", "Comprimento ao nascer (cm)", { type: "num", unit: "cm", range: [25, 60] }],
    ["28_Apgar_1", "Apgar no 1º minuto", { type: "num", range: [0, 10] }],
    ["29_Apgar_5", "Apgar no 5º minuto", { type: "num", range: [0, 10] }],
    ["30_Apgar_10", "Apgar no 10º minuto", { type: "num", range: [0, 10] }],
    ["31_Complicaes_neonat", "Complicações neonatais", { order: SN }],
    ["32_UTIN_Unidade_de_T", "Internação em UTIN", { order: SN }],
    ["33_Utilizou_de", "Recursos usados na internação (texto)", { type: "text" }],
    ["34_Se_sim_quantos_di", "Tempo de UTIN (texto)", { type: "text" }],
    ["35_UCIN_Unidade_de_C", "Internação em UCIN", { order: SN }],
    ["36_Se_sim_quantos_di", "Tempo de UCIN (texto)", { type: "text" }],
    ["37_Se_fez_cirurgias_", "Cirurgias realizadas (texto)", { type: "text" }],
    ["38_A_criana_frequent", "Frequenta escola", { type: "multi" }],
  ]);
  add("Responsável e contexto", [
    ["39_Nome_do_responsve", "Nome do responsável", { pii: true }],
    ["40_Parentesco", "Parentesco do responsável", { type: "multi" }],
    ["41_Data_de_nasciment", "Data de nascimento do responsável", { type: "date", pii: true }],
    ["42_Situao_Profission", "Situação profissional do responsável"],
    ["43_Escolaridade", "Escolaridade do responsável", { order: ["Fundamental incompleto", "Fundamental completo", "Ensino médio incompleto", "Ensino médio completo", "Ensino superior incompleto", "Ensino superior completo", "Pós-graduação"] }],
    ["44_Renda_Familiar_me", "Renda familiar mensal", { order: ["Até 1 salário mínimo", "Mais de 1 até 3 salários mínimos", "Mais de 3 até 5 salários mínimos", "Acima de 5 salários mínimos"] }],
    ["45_Recebe_algum_bene", "Benefício recebido"],
    ["46_Estado", "Estado", { recode: { "Goiânia": "Goiás" } }],
    ["47_Cidade_que_mora", "Região de moradia"],
    ["48_Zona_que_se_situa", "Zona de moradia"],
    ["49_Bairro", "Bairro", { pii: true }],
    ["50_Barreiras_para_mo", "Barreiras à mobilidade (pergunta 50)*", { order: SN }],
    ["51_Se_sim_qual", "Barreiras à mobilidade, quais (pergunta 51)*", { type: "multi" }],
    ["52_Barreiras_para_mo", "Barreiras à mobilidade (pergunta 52)*", { order: SN }],
    ["53_Se_sim_qual", "Barreiras à mobilidade, quais (pergunta 53)*", { type: "multi" }],
    ["54_Adaptes_no_domicl", "Adaptações no domicílio", { order: SN }],
    ["55_Se_sim_quais_e_qu", "Adaptações no domicílio, quais (texto)", { type: "text" }],
    ["56_Meio_de_transport", "Meio de transporte"],
  ]);
  add("Avaliação motora e funcional", [
    ["57_Tnus_muscular__MM", "Tônus muscular — MMSS*"],
    ["58_Tnus_muscular__Tr", "Tônus muscular — tronco"],
    ["59_Tnus_muscular__MM", "Tônus muscular — MMII*"],
    ["60_Supino__Cabea_na_", "Supino: cabeça na linha média", { order: SIM_AJUDA, motor: 2 }],
    ["61_Supino__mo_na_lin", "Supino: mãos na linha média", { order: SIM_AJUDA, motor: 2 }],
    ["62_Supino__levanta_c", "Supino: levanta a cabeça*", { order: SIM_AJUDA, motor: 2 }],
    ["63_Supino__Flexo_de_", "Supino: flexão (pergunta 63)*", { order: ["Sem resistência", "Resistência superável", "Resistência não superável"] }],
    ["64_Supino__Flexo_de_", "Supino: flexão (pergunta 64)*", { order: ["Sem resistência", "Resistência superável", "Resistência não superável"] }],
    ["65_Supino__Alcana_ob", "Supino: alcança objetos", { order: SIM_AJUDA, motor: 2 }],
    ["66_Supino__Rola_de_s", "Supino: rola de supino*", { order: SIM_AJUDA, motor: 2 }],
    ["67_Prono__Levanta_a_", "Prono: levanta a cabeça*", { order: SIM_AJUDA, motor: 2 }],
    ["68_Prono__Descarga_d", "Prono: descarga de peso", { order: ["Não realiza / se aplica", "Sobre os antebraços", "Cotovelos estendidos", "Braços totalmente estendidos"], motor: 3 }],
    ["69_Sentado__Controle", "Sentado: controle de cabeça*", { order: SUPORTE, motor: 3 }],
    ["70_Sentado__Controle", "Sentado: controle de tronco*", { order: SUPORTE, motor: 3 }],
    ["71_Sentado__Pegar_br", "Sentado: pega brinquedo", { order: AJUDA, motor: 3 }],
    ["72_Sentado__Passa_pa", "Sentado: passa para outra posição*", { order: AJUDA, motor: 3 }],
    ["73_Sentado__Atinge_q", "Sentado: atinge quatro apoios*", { order: AJUDA, motor: 3 }],
    ["74_Sentado_sobre_o_b", "Sentado sobre o banco*", { order: AJUDA, motor: 3 }],
    ["75_Em_p__Atinge_a_po", "Em pé: atinge a posição*", { order: AJUDA, motor: 3 }],
    ["76_Comunicao_e_cogni", "Comunicação e cognição"],
    ["77_Qual_comunico_alt", "Comunicação alternativa usada (texto)", { type: "text" }],
    ["78_Faz_uso_de_rtese", "Faz uso de órtese", { order: SN }],
    ["79_Faz_uso_de_tala_e", "Faz uso de tala extensora*", { order: SN }],
    ["80_Medida__Circunfer", "Medida: circunferência (pergunta 80)*", { type: "num", unit: "cm" }],
    ["81_Medida__Circunfer", "Medida: circunferência (pergunta 81)*", { type: "num", unit: "cm" }],
    ["82_Medida__Circunfer", "Medida: circunferência (pergunta 82)*", { type: "num", unit: "cm" }],
    ["83_Medida__Circunfer", "Medida: circunferência (pergunta 83)*", { type: "num", unit: "cm" }],
    ["84_Medida__Circunfer", "Medida: circunferência (pergunta 84)*", { type: "num", unit: "cm" }],
    ["85_Medida__Altura_da", "Medida: altura (pergunta 85)*", { type: "num", unit: "cm" }],
    ["86_Dispositivo", "Dispositivo indicado (texto)", { type: "text" }],
    ["87_Acessrios", "Acessórios (texto)", { type: "text" }],
    ["88_Observaes", "Observações (texto)", { type: "text" }],
  ]);
  // ---------------- B-IPQ (percepção da doença pelo responsável)
  add("B-IPQ", [
    ["89_Data_da_avaliao", "B-IPQ: data", { type: "date", hide: true }],
    ["90_Avaliadores", "B-IPQ: avaliadores", { pii: true }],
    ["91_Quanto_voc_acha_q", "B-IPQ: responsabilidade pela saúde do filho (item adicional)", { type: "num" }],
    ["92_Quanto_a_doena_do", "B-IPQ 1 · Consequências", { type: "num" }],
    ["93_Quanto_tempo_voc_", "B-IPQ 2 · Duração", { type: "num" }],
    ["94_Quanto_controle_v", "B-IPQ 3 · Controle pessoal", { type: "num" }],
    ["95_Quanto_voc_pensa_", "B-IPQ 4 · Controle pelo tratamento", { type: "num" }],
    ["96_Quanto_voc_perceb", "B-IPQ 5 · Identidade (sintomas)", { type: "num" }],
    ["97_At_que_ponto_voc_", "B-IPQ 7 · Compreensão", { type: "num" }],
    ["98_Quanto_voc_est_pr", "B-IPQ 6 · Preocupação", { type: "num" }],
    ["99_Quanto_a_doena_do", "B-IPQ 8 · Resposta emocional", { type: "num" }],
    ["100_Por_favor_liste_", "B-IPQ 9 · Causas citadas (texto)", { type: "text" }],
  ]);
  // ---------------- SF-36 (respondido pelo responsável)
  const sfQ3 = ["1- Sim, dificulta muito", "2- Sim, dificulta pouco", "3- Não, não dificulta de modo algum"];
  add("SF-36", [
    ["101_Data_de_Avaliao", "SF-36: data", { type: "date", hide: true }],
    ["102_Avaliadores", "SF-36: avaliadores", { pii: true }],
    ["103_Em_geral_voc_dir", "SF-36 1 · Saúde em geral", { type: "num" }],
    ["104_Comparada_h_um_a", "SF-36 2 · Saúde comparada a um ano atrás", { type: "num" }],
    ["105_Os_seguintes_ite", "SF-36 3 · (enunciado)", { type: "text", hide: true }],
    ["106_a_Atividades_Rig", "SF-36 3a · Atividades rigorosas", { type: "num" }],
    ["107_a_Dificuldade_de", "SF-36 3c · Levantar/carregar mantimentos*", { type: "num" }],
    ["108_b_Atividades_mod", "SF-36 3b · Atividades moderadas", { type: "num" }],
    ["109_d_Subir_vrios_la", "SF-36 3d · Subir vários lances de escada", { type: "num" }],
    ["110_e_Subir_um_lance", "SF-36 3e · Subir um lance de escada", { type: "num" }],
    ["111_f_Curvarse_ajoel", "SF-36 3f · Curvar-se, ajoelhar-se", { type: "num" }],
    ["112_g_Andar_mais_de_", "SF-36 3g · Andar mais de 1 km", { type: "num" }],
    ["113_h_Andar_vrios_qu", "SF-36 3h · Andar vários quarteirões", { type: "num" }],
    ["114_i_Andar_um_quart", "SF-36 3i · Andar um quarteirão", { type: "num" }],
    ["115_j_Tomar_banho_ou", "SF-36 3j · Tomar banho ou vestir-se", { type: "num" }],
    ["116_Durante_as_ltima", "SF-36 4 · (enunciado)", { type: "text", hide: true }],
    ["117_a_Durante_as_lti", "SF-36 4a · Diminuiu o tempo no trabalho (físico)", { type: "num" }],
    ["118_b_Durante_as_lti", "SF-36 4b · Realizou menos (físico)", { type: "num" }],
    ["119_c_Durante_as_lti", "SF-36 4c · Limitado no tipo de trabalho (físico)", { type: "num" }],
    ["120_d_Durante_as_lti", "SF-36 4d · Dificuldade no trabalho (físico)", { type: "num" }],
    ["121_Durante_as_ltima", "SF-36 5 · (enunciado)", { type: "text", hide: true }],
    ["122_a_Voc_diminuiu_a", "SF-36 5a · Diminuiu o tempo no trabalho (emocional)", { type: "num" }],
    ["123_b_Realizou_menos", "SF-36 5b · Realizou menos (emocional)", { type: "num" }],
    ["124_c_No_realizou_ou", "SF-36 5c · Não trabalhou com cuidado (emocional)", { type: "num", map: { "Sim": 1, "Não": 2 } }],
    ["125_Durante_as_ltima", "SF-36 6 · Interferência nas atividades sociais", { type: "num" }],
    ["126_Quanta_dor_no_co", "SF-36 7 · Intensidade da dor", { type: "num" }],
    ["127_Durante_as_ltima", "SF-36 8 · Dor interferiu no trabalho", { type: "num" }],
    ["128_9_Estas_queste_s", "SF-36 9 · (enunciado)", { type: "text", hide: true }],
    ["129_a_Quanto_tempo_v", "SF-36 9a · Cheio de vigor", { type: "num" }],
    ["130_b_Quanto_tempo_v", "SF-36 9b · Muito nervoso", { type: "num" }],
    ["131_c_Quanto_tempo_v", "SF-36 9c · Deprimido, nada anima", { type: "num" }],
    ["132_d_Quanto_tempo_v", "SF-36 9d · Calmo ou tranquilo", { type: "num" }],
    ["133_e_Quanto_tempo_v", "SF-36 9e · Com muita energia", { type: "num" }],
    ["134_f_Quanto_tempo_v", "SF-36 9f · Desanimado e abatido", { type: "num" }],
    ["135_g_Quanto_tempo_v", "SF-36 9g · Esgotado", { type: "num" }],
    ["136_h_Quanto_tempo_v", "SF-36 9h · Feliz", { type: "num" }],
    ["137_i_Quanto_tempo_v", "SF-36 9i · Cansado", { type: "num" }],
    ["138_10__Durante_as_l", "SF-36 10 · Saúde interferiu nas atividades sociais (tempo)", { type: "num",
      map: { "Todo tempo": 1, "A maior parte do tempo": 2, "Alguma parte do tempo": 3, "Uma pequena parte do tempo": 4, "Nenhuma parte do tempo": 5 } }],
    ["139_11__O_quanto_ver", "SF-36 11 · (enunciado)", { type: "text", hide: true }],
    ["140_a_Eu_costumo_obe", "SF-36 11a · Adoeço mais facilmente", { type: "num" }],
    ["141_b_Eu_sou_to_saud", "SF-36 11b · Sou tão saudável quanto qualquer pessoa", { type: "num" }],
    ["142_c_Eu_acho_que_a_", "SF-36 11c · Acho que minha saúde vai piorar", { type: "num" }],
    ["143_d_Minha_sade__ex", "SF-36 11d · Minha saúde é excelente", { type: "num" }],
  ]);
  // ---------------- B-QUEST 2.0 (satisfação com o dispositivo)
  const qItens = ["Dimensões", "Peso", "Ajustes", "Segurança", "Durabilidade", "Facilidade de uso", "Conforto", "Eficácia",
    "Entrega", "Reparos/assistência técnica", "Serviços profissionais", "Serviços de acompanhamento"];
  add("B-QUEST", [
    ["144_Data_de_Avaliao", "B-QUEST: data", { type: "date", hide: true }],
    ["145_Avaliadores", "B-QUEST: avaliadores", { pii: true }],
    ["146_Qual_o_dispositi", "Dispositivo avaliado", { recode: { "Órtese MMSS": "Órtese de MMSS", "Girafinha": "Girafinha", "Suporte de cabeça": "Suporte de cabeça" } }],
    ["147_BQuest__Avaliao_", "B-QUEST: nome do usuário", { pii: true }],
    ...qItens.map((t, i) => [`${148 + i}_${i + 1}_Qual__o_seu_g${i < 9 ? "r" : ""}`, `B-QUEST ${i + 1} · ${t}`, { type: "num", range: [1, 5] }]),
    ["160_A_seguir_consta_", "B-QUEST: 3 itens mais importantes", { type: "multi" }],
  ]);

  // ---------------- detecção dos formulários (pelo nome do arquivo exportado)
  const FORMS = [
    { re: /anamnese/i, nome: "Ficha de anamnese" },
    { re: /bipq|ipq/i, nome: "B-IPQ (percepção da doença)" },
    { re: /sf-?36/i, nome: "SF-36 (qualidade de vida)" },
    { re: /quest/i, nome: "B-QUEST (satisfação com o dispositivo)", unidade: "avaliações de dispositivo" },
  ];

  root.EInstr = { F, FORMS, qItens };
})(typeof window !== "undefined" ? window : globalThis);
