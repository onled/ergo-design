import type { SectionName } from '../../spec/template'
import type { InsertableKind } from '../../document/ops'

export const SECTION_LABELS: Record<SectionName, string> = {
  reportHeader: 'Cabeçalho do relatório',
  pageHeader: 'Cabeçalho de página',
  content: 'Conteúdo',
  summary: 'Resumo',
  pageFooter: 'Rodapé de página',
}

export const SECTION_HINTS: Record<SectionName, string> = {
  reportHeader: 'Só no começo da primeira página',
  pageHeader: 'No topo de toda página',
  content: 'O corpo, que pagina',
  summary: 'Depois do conteúdo, uma vez',
  pageFooter: 'No pé de toda página',
}

export const INSERTABLE: { kind: InsertableKind; label: string }[] = [
  { kind: 'text', label: 'Texto' },
  { kind: 'table', label: 'Tabela' },
  { kind: 'row', label: 'Linha de colunas' },
  { kind: 'box', label: 'Caixa' },
  { kind: 'repeat', label: 'Repetição' },
  { kind: 'spacer', label: 'Espaço' },
  { kind: 'line', label: 'Linha horizontal' },
]
