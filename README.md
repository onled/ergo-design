# ergo design

Editor visual de impressos para o motor de relatórios [ergo](../ergo). Um projeto,
duas entregas:

| entrega | o que é | build |
|---|---|---|
| **`@onled/ergo-design`** | pacote Vue instalável — é o que o admin do Covalente usa | `bun run build:lib` → `dist/` |
| **ergo.onled.cloud** | site onde qualquer um sobe um JSON de dados, desenha, vê o preview e exporta a spec | `bun run build:app` → `dist-app/` |

O site consome o pacote pelo nome (`@onled/ergo-design`, via alias), então nunca
usa nada que não seja API pública.

Proprietário, não publicado em registry público (`"private": true`,
`UNLICENSED`).

O plano de construção, com as fases e as decisões em aberto, está em
[`docs/plano.md`](docs/plano.md).

## Regras de arquitetura

- **O layout é do ergo.** O preview é o PDF que o serviço devolve. O editor não
  reimplementa medição, quebra de linha ou paginação em JS.
- **A validação é do ergo.** `/v1/templates/validate` decide o que é válido; o
  editor não mantém uma segunda cópia das regras.
- **A spec é espelho.** `src/lib/spec/template.ts` acompanha
  `ergo/internal/template/model/types.go`. Mudou lá, muda aqui.
- **Fluxo, não coordenada.** O usuário organiza a árvore de componentes (reordenar,
  aninhar); posição na página é resultado do layout.

## Estrutura

```
src/
  lib/                      pacote (tudo que é publicado)
    index.ts                API pública
    config/config.ts        createErgoDesign(), useErgoConfig()
    engine/engine.ts        ErgoEngine e createHttpEngine()
    spec/template.ts        tipos do template ergo v1
    document/               documento do editor (fromTemplate/toTemplate), operações,
                            estilos, escopo dos dados e histórico
    designer/               estado de uma instância (provide/inject) e blocos prontos
    preview/                render com debounce/cancelamento e páginas em pdf.js
    files/                  abrir, exportar e carregar JSON
    components/             ErgoDesigner.vue e os painéis: structure, properties,
                            appearance, styles, data
    styles/
      index.css             ordem da cascata
      tokens/primitives.css valores crus: paleta, escala, tipografia
      tokens/semantic.css   papéis consumidos pelos componentes + temas
      base.css              reset restrito a .ergo
      utilities/            layout, spacing, typography, surface (prefixo e-)
      controls/             botão, campo e rótulo compartilhados (prefixo ergo-)
  app/                      site ergo.onled.cloud
    exemplos/               template e carga da captação
tests/                      vitest, sem DOM
  fixtures/templates/       templates reais da ida e volta
```

## Estilos

Sem biblioteca CSS. Três camadas, cada uma só conversa com a de baixo:

1. **Primitivos** (`--ergo-blue-500`, `--ergo-space-4`) — ninguém usa direto.
2. **Semânticos** (`--ergo-color-surface`, `--ergo-text-label`) — o que
   componentes e utilitários consomem, e o que o host pode sobrescrever.
3. **Utilitários** (`e-row`, `e-gap-2`, `e-text-muted`) — composição de tela. Visual
   de componente fica no `<style scoped>` dele.

Isolamento, porque o host usa Tailwind + PrimeVue:

- tokens declarados em `.ergo`, nunca em `:root`;
- utilitários com prefixo `e-` e restritos a `:where(.ergo, .ergo *)`;
- nenhum `@layer`: o preflight do Tailwind vive em camada, e estilo em camada
  perde para estilo fora dela;
- medidas em `px`, para o editor não escalar com o `font-size` do `<html>` do host.

## Desenvolvimento

```bash
bun install
bun run dev          # site em http://localhost:5173
bun run test         # vitest: ida e volta, operações, escopo, histórico, adaptador
bun run type-check
bun run build        # pacote + site
```

O preview precisa do serviço ergo rodando (`../ergo/dev.sh`, porta 8099). O site
chama `/api` e o Vite repassa ao ergo; outra URL:
`VITE_ERGO_ENGINE_URL=http://… bun run dev`.

O site abre em branco. Para montar um impresso: **Carregar dados** (ou solte o
JSON no editor) e clique nos campos do painel Dados — uma lista vira tabela, um
valor vira texto. O clique liga ao componente selecionado enquanto ele espera um
campo; depois disso insere ao lado, e **Alt+clique** troca o campo do que está
selecionado.

Uma lista de textos (`["nota", "outra"]`) vira **repetição**, ligada a `@item` —
o próprio item, já que não há campo a nomear. Dentro da **faixa de detalhe** de
uma tabela, é assim que sai a observação de cada linha.

Tabela no ergo é sempre dirigida por dados — uma linha por item de uma lista.
Para um quadro fixo, em que se escolhe cada célula, use o bloco **Quadro de N × 2**
do menu Inserir (fileiras de `row`, uma coluna por célula).

No texto, **Marcador** põe ponto, traço ou numeração antes do conteúdo, e
**Recuar a quebra** alinha as linhas seguintes sob o texto.

**Exportar** salva a spec (JSON) e **Baixar PDF** salva o impresso que está no
preview — é o mesmo PDF que o ergo gera em produção.

A aparência se edita no componente: o editor cria e reaproveita os estilos
nomeados que o ergo exige, e a aba **Estilos** mostra todos, com quantos usos cada
um tem. Mudar um estilo vale para todos os componentes que o usam; **Só aqui** cria uma
variação, com só a propriedade alterada, composta sobre o original — o resto
continua vindo dele. Para experimentar,
`src/app/exemplos/captacao.json` é uma carga anonimizada, e
`captacao.template.json` é um impresso pronto sobre ela (**Abrir template**).

Toda fixture em `tests/fixtures/templates/` passa pelo teste de ida e volta.
Impresso novo publicado no Covalente entra ali.

## Usar no admin do Covalente

```bash
bun add ../ergo-design        # ou o tarball de `npm pack`, ou um git+ssh://
```

```ts
import { createErgoDesign, type ErgoEngine } from '@onled/ergo-design'
import '@onled/ergo-design/style.css'

// O navegador do admin não alcança o ergo: o adaptador passa pelo servidor do
// Covalente, que autentica, resolve o tenant e repassa.
const engine: ErgoEngine = {
  render: (req, signal) => api.renderImpresso(req, signal),
  validate: (template, signal) => api.validarImpresso(template, signal),
}

app.use(createErgoDesign({
  engine,
  theme: 'auto',                                  // light | dark | auto
  tokens: { '--ergo-color-accent': '#0f766e' },   // opcional
}))
```

```vue
<ErgoDesigner v-model="template" v-model:data="registro" />
```
