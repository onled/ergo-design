/*
 * Contrato do template, espelho de ergo/internal/template/model/types.go.
 *
 * O ergo é a fonte de verdade: este arquivo acompanha o Go, nunca o contrário.
 * A validação continua sendo a do serviço (/v1/templates/validate); os tipos
 * aqui só impedem que o editor monte um objeto com forma errada.
 *
 * Onde o Go usa um struct com um ponteiro por tipo de componente, aqui vira
 * união discriminada por `type`, para que `component.text` só exista quando
 * `type === 'text'`.
 */

import { starterStyles } from '../document/styles'

export const TEMPLATE_VERSION = 'v1'
export const UNIT_MM = 'mm'

export type SystemVariable =
  /** O item corrente, ele próprio: coleção de valores não tem nome a endereçar. */
  | '@item'
  | '@page.number'
  | '@page.total'
  | '@page.label'
  | '@report.generatedAt'
  | '@row.index'
  | '@row.number'
  | '@row.first'
  | '@row.last'
  | '@row.count'

export interface ReportRequest {
  template: Template
  data: unknown
  assets?: Record<string, Asset>
  options?: RenderOptions
}

export interface RenderOptions {
  locale?: string
  timezone?: string
  fileName?: string
  /** Padrão `true`: um bind que não resolve falha o render. */
  strictBindings?: boolean
  maxPages?: number
  maxPayloadBytes?: number
  maxAssets?: number
  maxAssetBytes?: number
  maxTotalAssetBytes?: number
}

export type AssetKind = 'image'

/** Sempre inline: o ergo não lê arquivo do servidor. */
export interface Asset {
  kind: AssetKind
  base64: string
  mediaType?: string
}

export interface Template {
  version: typeof TEMPLATE_VERSION
  unit: typeof UNIT_MM
  page: PageSpec
  styles?: Record<string, Style>
  sections: Sections
}

export interface PageSpec {
  widthMm: number
  heightMm: number
  margin: PageMargin
}

export interface PageMargin {
  topMm: number
  rightMm: number
  bottomMm: number
  leftMm: number
}

export type SectionName = 'reportHeader' | 'pageHeader' | 'content' | 'summary' | 'pageFooter'

export type Sections = Partial<Record<SectionName, Section>>

export interface Section {
  components: Component[]
}

interface ComponentBase {
  id?: string
  /** Um ou mais nomes de `styles`, separados por espaço, compostos da esquerda para a direita. */
  styleRef?: string
  bind?: string
  format?: Format
  aggregate?: Aggregate
  when?: Condition
}

export type TextNode = ComponentBase & { type: 'text'; text: TextComponent }
export type SpacerNode = ComponentBase & { type: 'spacer'; spacer: SpacerComponent }
export type LineNode = ComponentBase & { type: 'line'; line: LineComponent }
export type BoxNode = ComponentBase & { type: 'box'; box: BoxComponent }
export type RowNode = ComponentBase & { type: 'row'; row: RowComponent }
export type TableNode = ComponentBase & { type: 'table'; table: TableComponent }
export type RepeatNode = ComponentBase & { type: 'repeat'; repeat: RepeatComponent }
export type ImageNode = ComponentBase & { type: 'image'; image: ImageComponent }
export type PageBreakNode = ComponentBase & { type: 'pageBreak'; pageBreak?: PageBreakComponent }

export type Component =
  | TextNode
  | SpacerNode
  | LineNode
  | BoxNode
  | RowNode
  | TableNode
  | RepeatNode
  | ImageNode
  | PageBreakNode

export type ComponentType = Component['type']

export interface TextComponent {
  value?: string
  prefix?: string
  suffix?: string
  parts?: TextPart[]
}

export interface TextPart {
  value?: string
  bind?: string
  format?: Format
  aggregate?: Aggregate
}

export type AggregateOp = 'sum' | 'count' | 'avg' | 'min' | 'max'

export interface Aggregate {
  op: AggregateOp
  field?: string
}

export interface SpacerComponent {
  heightMm: number
}

export interface LineComponent {
  thicknessMm: number
  widthMm?: number
  color?: string
}

export interface BoxComponent {
  paddingMm?: number
  components: Component[]
}

export interface RowComponent {
  gapMm?: number
  columns: RowColumn[]
}

export interface RowColumn {
  widthMm?: number
  weight?: number
  styleRef?: string
  components: Component[]
}

export interface TableComponent {
  dataPath: string
  repeatHeader?: boolean
  columns: TableColumn[]
  /** `{}` sem `cells` imprime os `title` das colunas. Ausente = sem cabeçalho. */
  header?: TableRow
  /** Omitido (ou sem `cells`), as células saem das colunas: `cell`, senão `key` como bind. */
  row?: TableRow
  detail?: DetailBand
  emptyMessage?: string
}

export interface DetailBand {
  when?: Condition
  /** Pinta a banda inteira: é aqui que o traço fecha o grupo linha + detalhe. */
  styleRef?: string
  indentMm?: number
  keepWithRow?: boolean
  components: Component[]
}

export interface RepeatComponent {
  dataPath: string
  components: Component[]
  separatorMm?: number
  emptyMessage?: string
}

/**
 * A coluna inteira num objeto só. É a forma que o editor escreve: com `row`
 * omitido e `header: {}`, título e dado não têm como se desencontrar.
 * Precisa de `widthMm` ou `weight`.
 */
export interface TableColumn {
  /** Com `row` omitido, é o bind da célula. */
  key: string
  /** Com `header: {}`, é o texto do cabeçalho. */
  title?: string
  widthMm?: number
  weight?: number
  styleRef?: string
  format?: Format
  /** Célula do corpo quando precisa de mais que um bind. Só com `row` omitido. */
  cell?: TableCell
}

export interface TableRow {
  /** Estilo de todas as células da linha. A célula compõe coluna, linha e célula, nessa ordem. */
  styleRef?: string
  cells?: TableCell[]
}

export interface TableCell {
  bind?: string
  parts?: TextPart[]
  value?: string
  styleRef?: string
  align?: Align
  format?: Format
  aggregate?: Aggregate
}

/** O render só distingue `contain`; ausente, a imagem estica até o quadro. */
export type ImageFit = 'contain'

export interface ImageComponent {
  asset: string
  widthMm?: number
  heightMm?: number
  fit?: ImageFit
}

export interface PageBreakComponent {
  label?: string
}

export type FormatType =
  | 'text'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'time'
  | 'boolean'

export interface Format {
  type?: FormatType
  pattern?: string
  decimals?: number
  trimZeroDecimals?: boolean
  decimalSep?: string
  thousandsSep?: string
  currency?: string
  currencyDisplay?: string
  trueText?: string
  falseText?: string
  nullText?: string
  transform?: string
  trim?: boolean
}

export type ConditionOp =
  | 'exists'
  | 'notExists'
  | 'empty'
  | 'notEmpty'
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'

export interface Condition {
  path?: string
  op?: ConditionOp
  value?: unknown
  values?: unknown[]
  all?: Condition[]
  any?: Condition[]
  not?: Condition
}

/*
 * O validador também aceita apelidos (l, c, r, start, end, t, b). O editor só
 * escreve a forma longa.
 */
export type Align = 'left' | 'center' | 'right'
export type VerticalAlign = 'top' | 'middle' | 'bottom'

export interface Style {
  fontFamily?: string
  fontSizePt?: number
  fontWeight?: string
  fontStyle?: string
  /** `underline`, `lineThrough` ou `none`. */
  textDecoration?: string
  color?: string
  backgroundColor?: string
  align?: Align
  verticalAlign?: VerticalAlign
  lineHeightMm?: number
  minHeightMm?: number
  overflow?: string
  maxLines?: number
  /** Recua as linhas depois da primeira: item de lista alinha sob o próprio texto. */
  hangingIndentMm?: number
  padding?: Spacing
  border?: Border
  /** Espaço externo. Só vale no styleRef do próprio componente. */
  margin?: Spacing
}

export interface Spacing {
  topMm?: number
  rightMm?: number
  bottomMm?: number
  leftMm?: number
}

/**
 * Problema apontado pelo ergo. `path` é o caminho no JSON enviado
 * (`template.sections.content.components[0].table.columns[1].key`).
 */
export interface ValidationIssue {
  path: string
  message: string
}

export interface Border {
  widthMm?: number
  radiusMm?: number
  color?: string
  /** Combinação de "t", "r", "b", "l", ou "all" (padrão). */
  sides?: string
}

/**
 * A4 retrato com margem de 12mm e o conjunto inicial de estilos, o ponto de
 * partida de um impresso novo.
 */
export function createEmptyTemplate(): Template {
  return {
    version: TEMPLATE_VERSION,
    unit: UNIT_MM,
    page: {
      widthMm: 210,
      heightMm: 297,
      margin: { topMm: 12, rightMm: 12, bottomMm: 12, leftMm: 12 },
    },
    styles: starterStyles(),
    sections: {
      content: { components: [] },
    },
  }
}
