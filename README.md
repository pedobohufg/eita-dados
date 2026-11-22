# EITA! DADOS

Painel de dados e análises do **Lab.EITA/UFG** (Laboratório de Estudos Inventivos em Tecnologias Assistivas da Universidade Federal de Goiás) para os questionários aplicados no Epicollect5 (ficha de anamnese, B-IPQ, SF-36 e B-QUEST).

**Abrir:** https://pedobohufg.github.io/eita-dados/

- Carregue a exportação do Epicollect (o .zip em JSON) na tela **Dados**. Os arquivos são lidos **só no seu navegador**: nada é enviado a servidores. Este repositório não contém dados de participantes.
- Painel com filtros, mapas (estados do Brasil e municípios de Goiás), estatística (descritiva, comparação de grupos, associação, correlação, regressões linear e logística, antes e depois, SF-36 × normas brasileiras, dados ausentes, confiabilidade), Tabela 1, fluxograma STROBE, relatório reprodutível, exportação (CSV/Excel + dicionário) e guia de estatística.
- Também existe como app Android.

### No Google Sites
Inserir › Incorporar › Por URL › `https://pedobohufg.github.io/eita-dados/` (de preferência em página inteira). Ponha também um botão "Abrir em tela cheia" com o mesmo endereço: dentro de outro site, o navegador pode não guardar a base nem permitir baixar arquivos.

### Origem
Cópia publicada de `modulos/dados/` do repositório da Plataforma EITA, onde a ferramenta é mantida e testada. Atualizações são feitas lá e copiadas para cá.

Bibliotecas incluídas em `lib/`: JSZip (MIT ou GPLv3) e SheetJS Community Edition (Apache 2.0). Malhas dos mapas: IBGE, via tbrugz/geodata-br e click_that_hood.

© 2026 Lab.EITA/UFG. Autor: Pedro Henrique Gonçalves. Todos os direitos reservados. O código está visível para uso da ferramenta; cópia, modificação ou redistribuição dependem de autorização por escrito do Lab.EITA/UFG.
