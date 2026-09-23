/*
 * Blocos prontos: estruturas que quase todo impresso tem, já com os estilos
 * do conjunto inicial. Entram com os campos por ligar — um clique num campo dos
 * dados completa.
 */

import type { SectionName } from '../spec/template'
import type { EditorDocument, EditorNode } from '../document/document'
import { createNode } from '../document/ops'
import { defaultStyleFor } from '../document/styles'

/** Tamanho pedido no menu, para os blocos que têm tamanho. */
export interface BlockSize {
  rows: number
  cols: number
}

export interface BlockSpec {
  id: string
  label: string
  hint: string
  /** Seção em que o bloco sempre entra; ausente, entra onde estiver a seleção. */
  section?: SectionName
  /** Presente, o menu pede linhas e colunas antes de inserir. */
  size?: BlockSize
  /** Mais de um nó entra numa única entrada de desfazer. */
  build: (doc: EditorDocument, size: BlockSize) => EditorNode | EditorNode[]
}

export const MAX_BLOCK_ROWS = 20
export const MAX_BLOCK_COLS = 6

const DATETIME_LONG = "EEEE, dd 'de' MMMM 'de' yyyy HH:mm"

export const BLOCKS: BlockSpec[] = [
  {
    id: 'title',
    label: 'Título',
    hint: 'Texto grande, em negrito',
    build: (doc) => createNode('text', { title: 'Título do impresso', styleRef: defaultStyleFor(doc, 'title') }),
  },
  {
    id: 'label-value',
    label: 'Rótulo e valor',
    hint: 'Duas colunas: o rótulo fixo e o campo ao lado',
    build: (doc) => {
      const row = createNode('row')
      const [label, value] = row.slots.columns!
      label!.props = { widthMm: 32, components: null }
      label!.slots.components = [createNode('text', { title: 'Rótulo:', styleRef: defaultStyleFor(doc, 'label') })]
      value!.slots.components = [createNode('text', { title: '—', styleRef: defaultStyleFor(doc, 'text') })]
      return row
    },
  },
  {
    id: 'issued-at',
    label: 'Data de emissão',
    hint: 'No topo de toda página, à direita',
    section: 'pageHeader',
    build: (doc) =>
      createNode('text', {
        bind: '@report.generatedAt',
        format: { type: 'datetime', pattern: DATETIME_LONG },
        styleRef: [defaultStyleFor(doc, 'footer'), styleIfExists(doc, 'direita')].filter(Boolean).join(' ') || undefined,
      }),
  },
  {
    id: 'footer',
    label: 'Rodapé: impresso por e página',
    hint: 'No pé de toda página; clique no campo do usuário para completar',
    section: 'pageFooter',
    build: (doc) => {
      const footer = defaultStyleFor(doc, 'footer')
      const right = [footer, styleIfExists(doc, 'direita')].filter(Boolean).join(' ') || undefined
      const row = createNode('row')
      const [left, pages] = row.slots.columns!
      const who = createNode('text', { styleRef: footer })
      who.props.text = { parts: [{ value: 'Impresso por: ' }] }
      left!.slots.components = [who]
      const pageText = createNode('text', { styleRef: right })
      pageText.props.text = {
        parts: [{ value: 'Página ' }, { bind: '@page.number' }, { value: ' de ' }, { bind: '@page.total' }],
      }
      pages!.slots.components = [pageText]
      return row
    },
  },
  {
    id: 'grid',
    label: 'Quadro de N × 2',
    hint: 'Linhas fixas, você escolhe o conteúdo de cada célula',
    size: { rows: 4, cols: 2 },
    build: (doc, size) => {
      // Um quadro fixo não é `table`: `table` é uma linha por item de uma lista.
      // Aqui cada fileira é um `row`, e cada célula é uma coluna dele.
      const label = defaultStyleFor(doc, 'label')
      const text = defaultStyleFor(doc, 'text')
      const cell = defaultStyleFor(doc, 'cell')
      const rows = clamp(size.rows, 1, MAX_BLOCK_ROWS)
      const cols = clamp(size.cols, 1, MAX_BLOCK_COLS)
      return Array.from({ length: rows }, () => {
        const row = createNode('row')
        row.slots.columns = Array.from({ length: cols }, (_, c) => {
          const column = createNode('rowColumn')
          // A primeira coluna é a do rótulo: estreita e fixa, para as fileiras
          // ficarem alinhadas entre si; as outras dividem o que sobra.
          column.props = c === 0 ? { widthMm: 40, components: null } : { weight: 1, components: null }
          if (cell) column.props.styleRef = cell
          column.slots.components = [createNode('text', { title: c === 0 ? 'Rótulo' : '—', styleRef: c === 0 ? label : text })]
          return column
        })
        return row
      })
    },
  },
  {
    id: 'separator',
    label: 'Linha separadora',
    hint: 'Traço fino na largura toda',
    build: () => {
      const line = createNode('line')
      line.props.line = { thicknessMm: 0.3, color: '#999999' }
      return line
    },
  },
]

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n) || min))
}

function styleIfExists(doc: EditorDocument, name: string): string | undefined {
  const styles = doc.root.props.styles
  return typeof styles === 'object' && styles !== null && !Array.isArray(styles) && name in styles ? name : undefined
}
