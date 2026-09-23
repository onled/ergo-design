/*
 * Dados de exemplo como árvore de campos, e o caminho que um campo vira
 * conforme onde o nó selecionado está.
 *
 * O ergo resolve `bind` a partir da raiz no nível de seção, e a partir do item
 * corrente dentro de tabela, banda de detalhe ou `repeat` (com `$.` para voltar
 * à raiz). O autor clica no campo; o editor escreve o caminho.
 *
 * Caminhos aqui são "abstratos": `data[].cidadao_nome` é o campo de qualquer item
 * da lista `data`. Viram caminho do ergo em `bindFor`.
 */

import type { EditorDocument, EditorNode, JsonValue } from './document'
import { ancestry, getProp } from './ops'

export type FieldKind = 'object' | 'list' | 'text' | 'number' | 'boolean' | 'null'

export interface DataField {
  /** Caminho abstrato: `header.cliente_nome`, `data[].observacoes[]`. */
  path: string
  key: string
  kind: FieldKind
  /** Itens, numa lista; exemplo, num valor. */
  sample: string
  children: DataField[]
  /** Texto que o ergo lê como data: sugere o formato ao ligar. */
  hint?: 'date' | 'datetime'
  /** Rótulo legível, para as variáveis do sistema. */
  label?: string
}

/** Variáveis do ergo, oferecidas como campos. As de página só valem em cabeçalho e rodapé de página. */
export function systemFields(inRow: boolean): DataField[] {
  const f = (path: string, label: string, kind: FieldKind, hint?: DataField['hint']): DataField => ({
    path,
    key: path,
    label,
    kind,
    sample: '',
    children: [],
    hint,
  })
  return [
    ...(inRow ? [f('@item', 'O item em si', 'text')] : []),
    f('@page.number', 'Página atual', 'number'),
    f('@page.total', 'Total de páginas', 'number'),
    f('@report.generatedAt', 'Data de emissão', 'text', 'datetime'),
    ...(inRow ? [f('@row.number', 'Número da linha', 'number'), f('@row.count', 'Total de linhas', 'number')] : []),
  ]
}

/** Quantos itens de uma lista são lidos para descobrir os campos. */
const SAMPLE_ITEMS = 20

export function dataTree(data: unknown): DataField[] {
  if (data === undefined) return []
  return childrenOf(data, '')
}

function childrenOf(value: unknown, base: string): DataField[] {
  if (Array.isArray(value)) {
    const merged = mergeItems(value.slice(0, SAMPLE_ITEMS))
    if (merged === undefined) return []
    const itemPath = `${base}[]`
    if (isPlainObject(merged)) return childrenOf(merged, itemPath)
    return [field('(item)', itemPath, merged)]
  }
  if (!isPlainObject(value)) return []
  return Object.entries(value).map(([key, v]) => field(key, base ? `${base}.${key}` : key, v))
}

function field(key: string, path: string, value: unknown): DataField {
  const kind = kindOf(value)
  const out: DataField = { path, key, kind, sample: sampleOf(value), children: childrenOf(value, path) }
  const hint = dateHint(value)
  if (hint) out.hint = hint
  return out
}

/** Só as formas que o ergo aceita como data (ISO). `15/09/2026` é texto para ele. */
function dateHint(value: unknown): DataField['hint'] {
  if (typeof value !== 'string') return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date'
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return 'datetime'
  return undefined
}

/** Itens de lista nem sempre têm as mesmas chaves, nem valor não nulo na primeira. */
function mergeItems(items: unknown[]): unknown {
  const objects = items.filter(isPlainObject)
  if (objects.length === 0) return items.find((i) => i !== null) ?? items[0]
  const out: Record<string, unknown> = {}
  for (const obj of objects) {
    for (const [k, v] of Object.entries(obj)) {
      if (out[k] === undefined || out[k] === null) out[k] = v
    }
  }
  return out
}

function kindOf(value: unknown): FieldKind {
  if (Array.isArray(value)) return 'list'
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'text'
}

function sampleOf(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'itens'}`
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return ''
  const s = String(value)
  return s.length > 40 ? `${s.slice(0, 39)}…` : s
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Identificador que o ergo aceita num caminho: letra ou `_`, depois letras, dígitos ou `_`. */
/** Lista cujos itens são valores, não objetos: só dá para imprimir com `@item`. */
export function isValueList(field: DataField): boolean {
  return field.kind === 'list' && field.children.length === 1 && field.children[0]!.key === '(item)'
}

export function isBindableKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
}

/**
 * Escopo em que os binds de um nó resolvem, como caminho abstrato de item
 * (`data[]`), ou `''` na raiz. A tabela é escopo para as colunas e o detalhe,
 * não para o próprio `dataPath`.
 */
export function scopeOf(doc: EditorDocument, uid: string): string {
  const chain = ancestry(doc, uid)
  let scope = ''
  for (let i = 0; i < chain.length - 1; i++) {
    const node = chain[i]!
    const collection = collectionPath(node)
    if (!collection) continue
    scope = resolveCollection(scope, collection)
  }
  return scope
}

/** Escopo de quem fica dentro de `uid`: o do nó, mais a coleção dele, se tiver. */
export function childScopeOf(doc: EditorDocument, uid: string): string {
  const chain = ancestry(doc, uid)
  const node = chain[chain.length - 1]
  const scope = scopeOf(doc, uid)
  const collection = node ? collectionPath(node) : undefined
  return collection ? resolveCollection(scope, collection) : scope
}

function collectionPath(node: EditorNode): string | undefined {
  if (node.kind === 'table') return stringProp(getProp(node, ['table', 'dataPath']))
  if (node.kind === 'repeat') return stringProp(getProp(node, ['repeat', 'dataPath']))
  return undefined
}

function stringProp(v: JsonValue | undefined): string {
  return typeof v === 'string' ? v : ''
}

/** `dataPath` escrito dentro de um escopo → caminho abstrato do item. */
function resolveCollection(scope: string, dataPath: string): string {
  const abstract = dataPath.replace(/\[\d+\]/g, '[]')
  if (abstract === '$') return '[]'
  if (abstract.startsWith('$.')) return `${abstract.slice(2)}[]`
  return scope ? `${scope}.${abstract}[]` : `${abstract}[]`
}

/**
 * Caminho do ergo para o campo, visto de dentro de `scope`. Um item de lista
 * que não é o do escopo não tem como ser endereçado sem índice: vira `[0]`.
 */
export function bindFor(fieldPath: string, scope: string): string {
  if (fieldPath.startsWith('@')) return fieldPath
  // O próprio item do escopo: uma lista de textos não tem campo a endereçar.
  if (scope !== '' && fieldPath === scope) return '@item'
  if (scope && fieldPath.startsWith(`${scope}.`)) return concrete(fieldPath.slice(scope.length + 1))
  if (!scope) return concrete(fieldPath)
  return `$.${concrete(fieldPath)}`
}

function concrete(path: string): string {
  return path.replace(/\[\]/g, '[0]')
}

/** Título legível a partir de uma chave: `cidadao_nome` → `Cidadao nome`. */
export function titleFromKey(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
