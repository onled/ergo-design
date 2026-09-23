# Plano — ergo design

Documento de estratégia. Diz o que o editor é, as decisões de arquitetura que não
podem mudar depois, e em que ordem construir. O estado atual está no fim.

## 1. O que é

Um editor de **estrutura** com preview real, não uma tela livre de caixas. O
usuário monta a árvore do impresso (seções, linhas, tabelas, textos), liga cada
campo a um dado de exemplo, e vê o PDF que o ergo gera. Nada é posicionado em
`x,y`: a posição é resultado do layout, como no motor.

Duas entregas do mesmo código:

| | quem usa | de onde vem o dado | onde o impresso é gravado |
|---|---|---|---|
| **`@onled/ergo-design`** no admin do Covalente | implantação e suporte | registro real, via servidor do Covalente | `registro_modelo_impresso`, pelo `GerirImpressoService` |
| **ergo.onled.cloud** | qualquer empresa | JSON que a pessoa sobe | no navegador (MVP); conta depois |

A saída é sempre a mesma: o template JSON do ergo (a "spec"), na forma que o
contrato chama de curta sempre que ela bastar.

## 2. Decisões que sustentam o resto

### 2.1 O preview é o PDF do ergo

Medição de fonte, quebra de linha e paginação moram em Go. Reimplementar em
HTML/CSS daria um preview que diverge do papel justamente onde o autor mais
precisa confiar. Cada edição gera um render real; o render leva dezenas de
milissegundos.

### 2.2 O pacote não conhece a URL do ergo

O ergo não tem autenticação e escuta só na rede interna. No Covalente quem fala
com ele é o PHP (`ErgoClient.php`); o navegador do admin nunca o alcança. No
ergo.onled.cloud, expor o serviço cru na internet é entregar CPU de graça.

Por isso a configuração troca `engineUrl` por um **adaptador**:

```ts
interface ErgoEngine {
  render(req: RenderRequest, signal: AbortSignal): Promise<RenderResult> // PDF ou issues
  validate(template: Template, signal: AbortSignal): Promise<ValidateResult> // issues ou warnings
}
```

- o pacote traz `createHttpEngine(baseUrl)` para o caso simples;
- o **Covalente** implementa o adaptador chamando o próprio servidor, que
  autentica, resolve o tenant e repassa ao ergo;
- o **ergo.onled.cloud** usa `createHttpEngine('/api')`, atrás de um proxy no
  mesmo domínio (§6).

Consequência: **não é preciso CORS no ergo**. Nos dois casos o navegador fala com
a própria origem.

### 2.3 O editor tem um modelo próprio, e a spec é serializada dele

O template JSON não tem identidade estável de nó (`id` é rótulo livre) e aninha
componentes em lugares diferentes (`box.components`, `row.columns[].components`,
`detail.components`). Editar direto nele torna seleção, arrastar e desfazer
frágeis.

- **Documento do editor:** árvore de nós com `uid`, tipo e propriedades.
- **`fromTemplate(template)` / `toTemplate(doc)`:** funções puras. `toTemplate`
  é a única fonte do JSON gravado.
- **Ida e volta sem perda.** Todo template válido abre e salva igual. O que o
  editor ainda não sabe editar vira um **nó opaco**: aparece na árvore, pode ser
  movido ou apagado, e seu JSON sai intacto. Nunca descartar o que não se entende.
- **Tabela explícita** (`header.cells`/`row.cells`) abre como está, com uma ação
  "converter para forma curta" que só é oferecida quando a conversão é exata.

### 2.4 Histórico por snapshot

Um template tem kilobytes. Desfazer/refazer guarda cópias do documento
(`structuredClone`) em vez de comandos invertíveis, com coalescência de digitação
(uma entrada por campo editado, não por tecla). Simples e sem classe de bug.

### 2.5 Estado por instância, sem Pinia

O admin já usa Pinia. O editor guarda o estado num composable criado por
instância e distribuído por `provide/inject`: duas instâncias na mesma página não
se enxergam, e o pacote não arrasta dependência de store para o host.

### 2.6 Dependências

- **CSS:** nenhuma biblioteca (já decidido; tokens em `src/lib/styles`).
- **PDF:** `pdfjs-dist` para desenhar as páginas em canvas. Um `<iframe>` com o
  blob seria zero dependência, mas pisca a cada render, não controla zoom e não
  deixa sobrepor seleção (§5, F3).
- **Testes:** `vitest` para o modelo e a serialização.
- Nada de lib de drag-and-drop no MVP: reordenar na árvore com ponteiro nativo.

## 3. A tela

```
┌ toolbar: nome · desfazer/refazer · zoom · validação · exportar ───────────┐
├ Estrutura ─────┬ Preview ─────────────────────────────┬ Propriedades ────┤
│ ▸ Página       │                                     │ do nó selecionado │
│ ▾ Cabeçalho    │        páginas do PDF (pdf.js)      │                   │
│   · Texto      │                                     │  campos, bind,    │
│ ▾ Conteúdo     │                                     │  formato, estilo  │
│   ▸ Linha      │                                     │                   │
│   ▸ Tabela     │                                     │                   │
│ ▸ Rodapé       │                                     │                   │
├ Dados ─────────┴─────────────────────────────────────┴───────────────────┤
│ árvore do JSON de exemplo — clicar num campo liga ao nó selecionado       │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Problemas** (issues e warnings) listados na toolbar; clicar leva ao nó. O
  `path` do ergo (`template.sections.content.components[0].table.columns[1].key`)
  é resolvido para `uid` pelo mesmo mapa que `toTemplate` produz.
- **Escolha de campo:** o painel de dados mostra o JSON de exemplo como árvore.
  Dentro de uma tabela, o escopo muda para o item da coleção, e a escolha gera o
  caminho relativo (`nome`) ou com `$` para voltar à raiz. O autor nunca digita
  caminho, mas pode.

## 4. O que o editor escreve

O editor não expõe tudo que o contrato permite; expõe **um jeito** de fazer cada
coisa, e é sempre o jeito que não tem armadilha:

| intenção | o editor escreve |
|---|---|
| tabela | forma curta: colunas com `title`/`key`, `header: {}`, sem `row` |
| célula com duas partes | `columns[].cell.parts` |
| largura de coluna | `weight` por padrão; `widthMm` quando o autor trava |
| "negrito + à direita" | `styleRef` em lista, com estilos nomeados pelo autor |
| espaço entre blocos | `margin` no estilo, não `spacer` |
| texto com rótulo e valor | `text.parts` |

## 5. Fases

| | entrega | fecha quando |
|---|---|---|
| **F0 — fundação** | `ErgoEngine` + `createHttpEngine`; documento do editor com `fromTemplate`/`toTemplate` e nó opaco; histórico; vitest | todo template de `ergo/tests/testdata` e os 4 impressos publicados do Covalente fazem ida e volta **byte a byte** |
| **F1 — ver** | preview com pdf.js, render com debounce e cancelamento (`AbortSignal`), troca de página sem piscar; carregar JSON de dados; abrir/exportar spec; lista de problemas | abrir um impresso real, trocar o JSON de dados e ver o PDF novo em menos de 1s |
| **F2 — editar o essencial** | árvore com seleção, inserir, mover e apagar; propriedades de `text`, `row`, `table` (forma curta), `spacer`, `line`, `box`; página e margens; seções `pageHeader`/`content`/`pageFooter`; painel de dados com escolha de campo | desenhar do zero a Solicitação (o impresso de 818 linhas de JSON) sem tocar em JSON |
| **F3 — clicar no preview** | no ergo: endpoint que devolve o mapa de layout (retângulos por página com o `path` do template, reaproveitando `internal/render/record`); no editor: sobreposição no canvas, clique seleciona o nó, seleção destaca no papel | clicar numa célula do PDF seleciona a coluna na árvore |
| **F4 — completar o contrato** | estilos nomeados (criar, compor, renomear com atualização das referências); `format`; `when`; `repeat`; `detail`; `summary`/`reportHeader`; `image` com assets; `aggregate`; converter tabela explícita | nenhum impresso publicado tem nó opaco |
| **F5 — Covalente** | adaptador no admin chamando o servidor; rota de preview no servidor (template + registro → ergo); tela de modelo com o editor; gravação pelo `GerirImpressoService` | um impresso editado no admin é publicado e impresso por um registro real |
| **F6 — ergo.onled.cloud** | proxy `/api` com limites e rate limit (§6); rascunho em `localStorage`; exportar/importar arquivo; página inicial | alguém de fora sobe um JSON e exporta a spec sem conta |

F0 é a fase que não pode ser pulada: sem ida e volta garantida, o editor corrompe
impresso publicado na primeira gravação. F3 é a primeira que toca o ergo.

## 6. ergo.onled.cloud exposto

O site é estático; o ergo fica atrás de um proxy no mesmo domínio. O que o proxy
faz, porque o ergo não faz e não deve fazer:

- **rate limit por IP** nos dois endpoints;
- **teto de corpo** menor que o do Covalente (o JSON de exemplo de um editor não
  tem por que passar de alguns MB);
- `options.maxPages` apertado no request (o ergo já aceita e só aperta);
- timeout curto: um preview que demora mais que alguns segundos não é preview.

Os limites internos do ergo (payload, assets, páginas, timeout de request)
continuam valendo por baixo. Autenticação fica para quando houver conta (§8).

## 7. Qualidade

- **Ida e volta** (F0) roda em CI com os templates reais como fixture.
- **Modelo e serialização** em vitest, sem DOM.
- **Espelho do contrato:** `src/lib/spec/template.ts` acompanha
  `ergo/internal/template/model/types.go`. Mudou lá, muda aqui, na mesma tarefa.
- **Isolamento de CSS** conferido dentro do admin real (Tailwind + PrimeVue) a
  cada fase que muda a tela.

## 8. Decisões em aberto

1. **Onde o pacote é publicado.** Precisa ser privado: dependência `git+ssh` com
   tags de versão resolve sem infraestrutura; um registry privado (GitHub
   Packages, Verdaccio) resolve melhor quando houver mais de um consumidor.
2. **Conta no ergo.onled.cloud.** O MVP é anônimo e local. Conta traz gravação
   no servidor, limites por cliente e cobrança — e é aí que o proxy passa a
   autenticar.
3. ~~**Fontes.**~~ Decidido em 2026-09-17: usa a família configurada no ergo. O
   editor não expõe escolha de fonte.
4. **Quem edita no admin.** Se for só implantação, F5 pode esconder as partes
   avançadas; se for o cliente final, o editor precisa de modo restrito (modelos
   prontos, travas de largura).

## 9. Estado atual

Atualizado em 2026-09-17.

- Setup: Vite 8, Vue 3.5, TypeScript 6, bun; build de pacote (`dist/`) e de site
  (`dist-app/`); consumidor externo verificado com `npm pack`.
- Camada de estilos: primitivos, semânticos com tema claro/escuro/auto, reset e
  utilitários `e-`, isolados em `.ergo`.
- `src/lib/spec/template.ts` com o contrato atual, incluindo `ReportRequest`,
  `RenderOptions` e `Asset`.

**F0 — feita, falta uma fixture.**

- `ErgoEngine` + `createHttpEngine`; a config recebe `engine`, não mais `engineUrl`.
- `document/document.ts`: árvore com `uid` e slots por tipo; `props` guarda o JSON
  como veio, com a posição dos filhos marcada, então chave desconhecida e ordem
  de chaves sobrevivem. Nó opaco para tipo desconhecido e container malformado.
  `serialize` devolve o mapa caminho → uid, e `resolveIssuePath` leva o `path`
  de um issue ao nó mais específico.
- `document/history.ts`: snapshot com coalescência por chave e `seal()`.
- vitest (`bun run test`): ida e volta byte a byte de toda fixture em
  `tests/fixtures/templates/` — `ergo-simple`, `covalente-avaliacao-carga`,
  `captacao` e uma sintética com todos os tipos e formas malformadas. Um teste
  de mutação (filhos serializados no fim do objeto) quebra as quatro.
- **Pendente:** os 4 impressos publicados estão só em `registro_modelo_impresso`,
  e o banco local não estava no ar. Exportar a versão vigente de cada um para a
  pasta de fixtures fecha a F0.

**F1 — adiantada.**

- Preview com pdf.js em canvas: o documento novo é desenhado fora da tela e troca
  de lugar com o anterior, sem piscar; zoom de 50% a 200%.
- `usePreview`: render e validação em paralelo, `AbortSignal` cancela o render
  velho; debounce só para mudança de template, porque dados chegam de uma vez.
  Sem dados, renderiza o esqueleto com `strictBindings: false`.
- Abrir template, exportar a spec, baixar o PDF do preview, carregar dados (botão
  ou soltar o arquivo no editor), lista de problemas com erros e avisos.
- Site: `/api` repassado ao ergo pelo Vite; abre no template da captação, com a
  carga anonimizada em `src/app/exemplos/`.
- Zoom padrão "ajustar à largura": a página do papel é mais larga que a área
  entre os painéis em janela comum, e rolar na horizontal para ler não serve.
- Medido no Chrome headless: trocar o JSON de dados → PDF novo na tela em
  ~250 ms (o ergo leva ~25 ms). Antes de compartilhar um worker do pdf.js entre
  documentos, eram ~1 s.
- Clicar num problema seleciona o nó (`resolveIssuePath`).
- O site abre em branco; o impresso da captação fica em `src/app/exemplos/` para
  abrir por **Abrir template**.

Corrigido em 2026-09-17, depurando o Chrome do autor: o reset do editor
(`canvas { max-width: 100% }`) espremia a página do PDF na horizontal sem mexer
na altura sempre que ela não coubesse na área de preview — o papel saía achatado.
Só aparecia em janela estreita ou com zoom do navegador, por isso passou pelos
testes headless, que rodavam a 1440px.

**F2 — fechada para o caso real; falta a Solicitação.**

O fluxo é dados primeiro: abrir em branco, carregar o JSON, montar clicando nos
campos.

- `document/ops.ts`: inserir, mover, duplicar, apagar, editar propriedade,
  seções — puras, testadas. O que nasce, nasce na forma do §4.
- `document/scope.ts`: árvore dos dados (juntando as chaves dos primeiros itens de
  cada lista) e o caminho que um campo vira conforme o escopo: relativo dentro de
  tabela, `$.` para a raiz, `[0]` para item de outra lista.
- Clique num campo, conforme a seleção: lista → insere tabela com até 6 colunas
  sugeridas, ou vira a coleção da tabela selecionada; valor → liga ao texto, liga
  à coluna (o título gerado acompanha, o escrito fica), acrescenta coluna à
  tabela, acrescenta parte ao texto composto, ou insere um texto.
- Estrutura: árvore com seleção, arrastar para reordenar ou aninhar (nó ou campo
  dos dados), seções adicionar/remover, menu Inserir.
- Propriedades: página e margens; texto em três formas (fixo, campo com antes e
  depois, composto); tabela curta; coluna com largura proporcional ou fixa; linha
  de colunas; caixa; espaço; linha horizontal; estilos existentes por nome.
- Desfazer/refazer na toolbar e no teclado; Delete, Ctrl+D, Esc. O ouvinte de
  teclado fica na janela: uma ação que apaga o elemento com foco (item de menu,
  componente apagado) devolve o foco ao body, e um ouvinte preso ao editor
  perderia os atalhos até o próximo clique.
- Testado no Chrome headless: montar a partir da captação, reordenar coluna,
  soltar campo na seção, clicar no problema.
- Aparência direta, com estilos nomeados por baixo (trazido da F4 em 2026-09-17):
  formatar um componente altera um estilo; sem estilo, a primeira mudança cria um
  — ou reaproveita um igual que já exista. Estilo compartilhado altera todos os
  usos, com o aviso de quantos são.
- **Exceção sem perder o vínculo** (revisto em 2026-09-18): "Só aqui" não copia
  mais o estilo inteiro — cria uma **variação**, um estilo com só a propriedade
  alterada, composto depois do original (`styleRef: "texto texto-variacao"`).
  Mudar o original continua alcançando o nó em tudo que a variação não declara,
  que é o que a cópia quebrava: baixar o tamanho de uma observação não podia
  desligá-la do tamanho geral. Variação igual a um estilo existente reaproveita
  aquele estilo (`direita`, por exemplo), e nada é criado antes da mudança.
- **Decoração**: sublinhado e tachado, ao lado de negrito e itálico, em
  Aparência → Ênfase e decoração.
- **Marcador** no texto: ponto, traço, quadrado, círculo (viram `text.prefix`) e,
  dentro de uma coleção, numeração pela posição (`@row.number` em `parts`). Com
  marcador, o botão "Recuar a quebra" alinha as linhas seguintes sob o texto —
  numa variação, quando o estilo é de mais alguém. Aba **Estilos**
  com usos por estilo, renomear (atualiza as referências), duplicar e apagar o que
  ninguém usa; o estilo aberto marca seus usos na árvore.
- Impresso novo nasce com o conjunto padrão (`texto`, `titulo`, `subtitulo`,
  `rotulo`, `cabecalho-tabela`, `celula`, `direita`, `centro`, `rodape`), e
  componente novo já nasce com o estilo do seu papel — coluna numérica sai
  alinhada à direita.
- **Formato do valor** por tipo: número, moeda, percentual, data com padrões
  prontos, hora, sim/não, maiúsculas e texto de vazio. Campo com data ISO já
  chega com o formato sugerido.
- **Variáveis do sistema** (`@page.number`, `@page.total`, `@report.generatedAt`,
  `@row.*` dentro de tabela) aparecem como campos, num grupo à parte.
- **Faixa de detalhe** na tabela: botão nas propriedades. Ao criar a faixa, o
  traço que separava as linhas passa para o fim dela — a borda no estilo das
  colunas cai *entre* a linha e o detalhe dela, e o detalhe parece pertencer à
  linha seguinte. Se o estilo das colunas for usado em outro lugar, a mudança
  sai numa cópia. Tem "esconder quando o campo estiver vazio" para as linhas sem conteúdo (desnecessário quando a faixa
  tem repetição, que já não imprime nada em lista vazia).
- **Repetição** com formulário próprio (coleção, espaço entre itens, mensagem
  quando vazia). Lista de textos vira repetição ligada a `@item`.
- **Blocos prontos**: título, rótulo e valor, quadro de N × M (fileiras fixas,
  com as células para preencher), data de emissão, rodapé com "Impresso por /
  Página X de Y", linha separadora. O quadro existe porque `table` no ergo é
  sempre uma linha por item de uma lista: quadro fixo é `row` repetido, e montar
  isso à mão era duplicar fileira por fileira.
- Tabela inserida pelo menu nasce com uma coluna em branco, que o ergo recusa
  (`columns[0].key is required`); escolher a coleção dela também preenche as
  colunas, como faz inserir a tabela pela lista.
- Clicar campo após campo insere; ligar ao selecionado só quando ele ainda espera
  um campo, e Alt+clique força a troca. A regra saiu de um bug que o teste de
  ponta a ponta pegou: o texto recém-criado ficava selecionado e o clique seguinte
  o sobrescrevia.
- **Validado:** a captação foi refeita do zero pela interface, no Chrome headless,
  sem tocar em JSON — margens, cabeçalho, tabela com detalhe, resumo e rodapé. Sai
  igual à referência, agora com os títulos numéricos à direita. O resultado está
  em `tests/fixtures/templates/captacao-refeito.json` e passa na ida e volta.
- **Falta para o critério do plano:** a Solicitação (818 linhas), que usa `when`,
  `repeat` e `detail`. Os dois últimos já têm formulário; falta `when` fora da
  faixa de detalhe.

**Quinta mudança no ergo (2026-09-18):** `textDecoration` no estilo —
`underline`, `lineThrough` ou `none`. Peso e inclinação não expressam um traço
sob ou sobre o texto, e a biblioteca de PDF já trazia os dois.

**Quarta mudança no ergo (2026-09-18):** `hangingIndentMm` no estilo. Recua toda
linha depois da primeira, no texto e na célula de tabela, e é o que faz um item
de lista que quebra alinhar sob o próprio texto em vez de sob o marcador. A
quebra passou a medir a primeira linha pela largura toda e as demais pelo que
sobra do recuo.

**Terceira mudança no ergo (2026-09-18):** `detail.styleRef`. A banda passou a
aceitar estilo e é pintada como um bloco só. Sem isso não havia como fechar o
grupo linha + detalhe: a borda de uma célula termina onde a célula termina, e o
traço caía no meio do grupo. É o irmão que faltava de `header.styleRef` e
`row.styleRef`.

**Achados no motor, pela captação** (`src/app/exemplos/captacao.template.json`,
desenhado a partir do impresso de referência):

1. ~~**Alinhamento de título na forma curta.**~~ Resolvido no ergo em 2026-09-17:
   o estilo de uma célula **compõe** coluna, linha e célula, como uma lista de
   `styleRef`, em vez de o mais próximo vencer inteiro. Um cabeçalho em negrito
   sobre uma coluna alinhada à direita agora é as duas coisas. Os impressos
   publicados não mudam: o tradutor do Covalente põe estilo só nas células, nunca
   na coluna. No golden do ergo mudou uma linha (o título "Valor", que passou a
   sair à direita) — alteração esperada, congelada de novo.
2. ~~**`repeat` de lista escalar.**~~ Resolvido no ergo em 2026-09-18: `@item` é o
   próprio item do escopo corrente (linha de tabela, banda de detalhe ou
   `repeat`), então uma lista de textos se percorre inteira. No editor, lista de
   valores vira **repetição** com `@item`; lista de objetos continua virando
   tabela.
