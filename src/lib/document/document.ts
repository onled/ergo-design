/*
 * Documento do editor: a árvore que seleção, arrastar e desfazer manipulam.
 *
 * O template JSON não serve para isso direto: `id` é rótulo livre e não
 * identidade, e os filhos moram em lugares diferentes conforme o pai
 * (`box.components`, `row.columns[].components`, `table.detail.components`).
 * Aqui todo nó tem `uid` e os filhos ficam em `slots`, com nome fixo por tipo.
 *
 * A regra que sustenta o resto é a ida e volta sem perda:
 * `toTemplate(fromTemplate(t))` serializa igual a `t`, byte a byte. Para isso
 * `props` guarda o JSON do nó como veio — chaves desconhecidas e ordem de
 * chaves incluídas — com `null` no lugar de cada lista de filhos, marcando a
 * posição onde ela volta. O que não tem a forma esperada vira nó opaco: fica
 * na árvore, pode ser movido ou apagado, e seu JSON sai intacto.
 */

import type { SectionName, Template } from '../spec/template'

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject
export interface JsonObject {
  [key: string]: JsonValue
}

export type ComponentKind =
  | 'text'
  | 'spacer'
  | 'line'
  | 'box'
  | 'row'
  | 'table'
  | 'repeat'
  | 'image'
  | 'pageBreak'

export type NodeKind =
  /** A raiz: página, estilos e as seções como slots. */
  | 'template'
  | ComponentKind
  /** Coluna de `row`: tem componentes. */
  | 'rowColumn'
  /** Coluna de `table`: folha. */
  | 'tableColumn'
  /** O que o editor não decompõe. `props.value` é o JSON inteiro, como veio. */
  | 'opaque'

export type SlotName = SectionName | 'components' | 'columns' | 'detail'

export interface EditorNode {
  uid: string
  kind: NodeKind
  props: JsonObject
  slots: Partial<Record<SlotName, EditorNode[]>>
}

export interface EditorDocument {
  root: EditorNode
}

export const SECTION_NAMES: readonly SectionName[] = ['reportHeader', 'pageHeader', 'content', 'summary', 'pageFooter']

interface SlotSpec {
  path: readonly string[]
  child: (value: JsonValue) => EditorNode
  /**
   * Opcional: sem lista no JSON, o slot não existe e o valor fica em `props`
   * como veio. Obrigatório e sem lista, o nó é opaco.
   */
  optional?: boolean
}

/** Onde cada tipo guarda seus filhos, e o que cada filho é. */
const SLOTS: Record<NodeKind, Partial<Record<SlotName, SlotSpec>>> = {
  template: Object.fromEntries(
    SECTION_NAMES.map((name) => [name, { path: ['sections', name, 'components'], child: componentNode, optional: true }]),
  ),
  text: {},
  spacer: {},
  line: {},
  image: {},
  pageBreak: {},
  box: { components: { path: ['box', 'components'], child: componentNode } },
  repeat: { components: { path: ['repeat', 'components'], child: componentNode } },
  row: { columns: { path: ['row', 'columns'], child: (v) => childNode('rowColumn', v) } },
  rowColumn: { components: { path: ['components'], child: componentNode } },
  table: {
    columns: { path: ['table', 'columns'], child: (v) => childNode('tableColumn', v) },
    detail: { path: ['table', 'detail', 'components'], child: componentNode, optional: true },
  },
  tableColumn: {},
  opaque: {},
}

/** Nomes dos slots que o tipo tem, com o caminho de cada um no JSON. */
export function slotsOf(kind: NodeKind): Partial<Record<SlotName, { path: readonly string[] }>> {
  return SLOTS[kind]
}

const COMPONENT_KINDS = new Set<string>(['text', 'spacer', 'line', 'box', 'row', 'table', 'repeat', 'image', 'pageBreak'])

let uidSeq = 0

/** Único dentro da página, que é o escopo em que uids se encontram. */
export function newUid(): string {
  uidSeq += 1
  return `n${uidSeq.toString(36)}`
}

export function fromTemplate(template: Template): EditorDocument {
  const root = decompose('template', structuredClone(template) as unknown as JsonValue)
  if (!root) throw new Error('[ergo-design] template não é um objeto')
  return { root }
}

export interface Serialized {
  template: Template
  /**
   * Caminho no JSON gravado → uid, na notação dos issues do ergo
   * (`template.sections.content.components[0]`).
   */
  paths: Map<string, string>
}

export function serialize(doc: EditorDocument): Serialized {
  const paths = new Map<string, string>()
  const template = compose(doc.root, 'template', paths) as unknown as Template
  return { template, paths }
}

/** A única fonte do JSON gravado. */
export function toTemplate(doc: EditorDocument): Template {
  return serialize(doc).template
}

/**
 * Nó a que um issue do ergo se refere: o caminho mais longo do mapa que é
 * prefixo do `path` (`...columns[1].key` cai na coluna 1).
 */
export function resolveIssuePath(paths: Map<string, string>, path: string): string | undefined {
  let current = path
  for (;;) {
    const uid = paths.get(current)
    if (uid) return uid
    const cut = Math.max(current.lastIndexOf('.'), current.lastIndexOf('['))
    if (cut <= 0) return undefined
    current = current.slice(0, cut)
  }
}

function componentNode(value: JsonValue): EditorNode {
  const type = isObject(value) ? value.type : undefined
  if (typeof type === 'string' && COMPONENT_KINDS.has(type)) {
    const node = decompose(type as ComponentKind, value)
    if (node) return node
  }
  return opaqueNode(value)
}

function childNode(kind: 'rowColumn' | 'tableColumn', value: JsonValue): EditorNode {
  return decompose(kind, value) ?? opaqueNode(value)
}

function opaqueNode(value: JsonValue): EditorNode {
  // Um nó opaco pode não ser nem objeto; o valor vai embrulhado.
  return { uid: newUid(), kind: 'opaque', props: { value }, slots: {} }
}

/** `null` quando o valor não tem a forma do tipo; quem chama decide o opaco. */
function decompose(kind: NodeKind, value: JsonValue): EditorNode | null {
  if (!isObject(value)) return null

  const specs = Object.entries(SLOTS[kind]) as [SlotName, SlotSpec][]
  const lists: [SlotName, SlotSpec, JsonValue[]][] = []
  for (const [name, spec] of specs) {
    const list = getIn(value, spec.path)
    if (Array.isArray(list)) lists.push([name, spec, list])
    else if (!spec.optional) return null
  }

  const slots: EditorNode['slots'] = {}
  for (const [name, spec, list] of lists) {
    slots[name] = list.map(spec.child)
    setIn(value, spec.path, null)
  }
  return { uid: newUid(), kind, props: value, slots }
}

function compose(node: EditorNode, path: string, paths: Map<string, string>): JsonValue {
  paths.set(path, node.uid)
  if (node.kind === 'opaque') return structuredClone(node.props.value ?? null)

  const out = structuredClone(node.props)
  const specs = SLOTS[node.kind]
  for (const [name, children] of Object.entries(node.slots) as [SlotName, EditorNode[]][]) {
    const spec = specs[name]
    if (!spec) throw new Error(`[ergo-design] ${node.kind} não tem slot ${name}`)
    const base = `${path}.${spec.path.join('.')}`
    setIn(
      out,
      spec.path,
      children.map((child, i) => compose(child, `${base}[${i}]`, paths)),
    )
  }
  return out
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getIn(obj: JsonObject, path: readonly string[]): JsonValue | undefined {
  let cur: JsonValue | undefined = obj
  for (const key of path) {
    if (!isObject(cur)) return undefined
    cur = cur[key]
  }
  return cur
}

/** Cria os objetos intermediários que faltarem; chave existente mantém a posição. */
function setIn(obj: JsonObject, path: readonly string[], value: JsonValue): void {
  let cur = obj
  for (const key of path.slice(0, -1)) {
    const next = cur[key]
    if (!isObject(next)) cur[key] = {}
    cur = cur[key] as JsonObject
  }
  cur[path[path.length - 1]!] = value
}
