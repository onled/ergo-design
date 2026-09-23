/*
 * Operações sobre o documento do editor. Todas puras: recebem um documento e
 * devolvem outro, sem tocar no de entrada — é o que deixa o histórico guardar
 * snapshots sem cópia defensiva do lado de quem edita.
 *
 * O que nasce aqui nasce na forma do §4 do plano: tabela curta com `header: {}`,
 * coluna com `weight`, texto ligado por `bind`.
 */

import type { SectionName } from '../spec/template'
import {
  newUid,
  SECTION_NAMES,
  slotsOf,
  type ComponentKind,
  type EditorDocument,
  type EditorNode,
  type JsonObject,
  type JsonValue,
  type SlotName,
} from './document'

export interface Located {
  node: EditorNode
  parent: EditorNode | null
  slot: SlotName | null
  index: number
}

export function findNode(doc: EditorDocument, uid: string): Located | undefined {
  if (doc.root.uid === uid) return { node: doc.root, parent: null, slot: null, index: -1 }
  return search(doc.root, uid)
}

function search(parent: EditorNode, uid: string): Located | undefined {
  for (const [slot, children] of Object.entries(parent.slots) as [SlotName, EditorNode[]][]) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!
      if (child.uid === uid) return { node: child, parent, slot, index: i }
      const deeper = search(child, uid)
      if (deeper) return deeper
    }
  }
  return undefined
}

/** Cadeia da raiz até o nó, inclusive. */
export function ancestry(doc: EditorDocument, uid: string): EditorNode[] {
  const chain: EditorNode[] = []
  let current = findNode(doc, uid)
  while (current) {
    chain.unshift(current.node)
    current = current.parent ? findNode(doc, current.parent.uid) : undefined
  }
  return chain
}

function edit(doc: EditorDocument, fn: (draft: EditorDocument) => void): EditorDocument {
  const draft = structuredClone(doc)
  fn(draft)
  return draft
}

function mustFind(doc: EditorDocument, uid: string): Located {
  const found = findNode(doc, uid)
  if (!found) throw new Error(`[ergo-design] nó ${uid} não existe`)
  return found
}

/** Filhos que cada slot aceita. */
export function accepts(parent: EditorNode, slot: SlotName, child: EditorNode): boolean {
  if (!(slot in slotsOf(parent.kind))) return false
  if (parent.kind === 'row') return child.kind === 'rowColumn'
  if (parent.kind === 'table' && slot === 'columns') return child.kind === 'tableColumn'
  return child.kind !== 'rowColumn' && child.kind !== 'tableColumn' && child.kind !== 'template'
}

export function insertNode(doc: EditorDocument, parentUid: string, slot: SlotName, index: number, node: EditorNode): EditorDocument {
  return edit(doc, (draft) => {
    const { node: parent } = mustFind(draft, parentUid)
    if (!accepts(parent, slot, node)) throw new Error(`[ergo-design] ${parent.kind}.${slot} não aceita ${node.kind}`)
    const list = (parent.slots[slot] ??= [])
    list.splice(clamp(index, 0, list.length), 0, structuredClone(node))
  })
}

export function removeNode(doc: EditorDocument, uid: string): EditorDocument {
  return edit(doc, (draft) => {
    const found = mustFind(draft, uid)
    if (!found.parent || !found.slot) throw new Error('[ergo-design] a raiz não sai do documento')
    found.parent.slots[found.slot]!.splice(found.index, 1)
  })
}

/**
 * Move para `index` na lista de destino, contado como se o nó já tivesse saído
 * dela — dentro da mesma lista, `index` é a posição final.
 */
export function moveNode(doc: EditorDocument, uid: string, parentUid: string, slot: SlotName, index: number): EditorDocument {
  return edit(doc, (draft) => {
    const found = mustFind(draft, uid)
    if (!found.parent || !found.slot) throw new Error('[ergo-design] a raiz não se move')
    if (ancestry(draft, parentUid).some((n) => n.uid === uid)) {
      throw new Error('[ergo-design] um nó não entra dentro de si mesmo')
    }
    const { node: target } = mustFind(draft, parentUid)
    if (!accepts(target, slot, found.node)) throw new Error(`[ergo-design] ${target.kind}.${slot} não aceita ${found.node.kind}`)
    found.parent.slots[found.slot]!.splice(found.index, 1)
    const list = (target.slots[slot] ??= [])
    list.splice(clamp(index, 0, list.length), 0, found.node)
  })
}

export function duplicateNode(doc: EditorDocument, uid: string): { doc: EditorDocument; uid: string } {
  const found = mustFind(doc, uid)
  if (!found.parent || !found.slot) throw new Error('[ergo-design] a raiz não se duplica')
  const copy = reUid(structuredClone(found.node))
  return { doc: insertNode(doc, found.parent.uid, found.slot, found.index + 1, copy), uid: copy.uid }
}

function reUid(node: EditorNode): EditorNode {
  node.uid = newUid()
  for (const children of Object.values(node.slots)) children?.forEach(reUid)
  return node
}

/** `undefined` apaga a chave; objetos vazios que sobram no caminho ficam (`text: {}` é válido). */
export function setProp(doc: EditorDocument, uid: string, path: readonly string[], value: JsonValue | undefined): EditorDocument {
  return edit(doc, (draft) => {
    const { node } = mustFind(draft, uid)
    let cur: JsonObject = node.props
    for (const key of path.slice(0, -1)) {
      const next = cur[key]
      if (typeof next !== 'object' || next === null || Array.isArray(next)) {
        if (value === undefined) return
        cur[key] = {}
      }
      cur = cur[key] as JsonObject
    }
    const last = path[path.length - 1]!
    if (value === undefined) delete cur[last]
    else cur[last] = value
  })
}

export function getProp(node: EditorNode, path: readonly string[]): JsonValue | undefined {
  let cur: JsonValue | undefined = node.props
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null || Array.isArray(cur)) return undefined
    cur = cur[key]
  }
  return cur
}

/**
 * Faixa de detalhe da tabela: uma banda sob cada linha, no escopo do item. Vive
 * em `table.detail.components`, que é um slot como qualquer outro — mas, ao
 * contrário dos demais, pode não existir.
 */
export function addDetail(doc: EditorDocument, uid: string, first: EditorNode): EditorDocument {
  return edit(doc, (draft) => {
    const { node } = mustFind(draft, uid)
    if (node.kind !== 'table') throw new Error('[ergo-design] detalhe só existe em tabela')
    node.slots.detail ??= []
    node.slots.detail.push(structuredClone(first))
  })
}

export function removeDetail(doc: EditorDocument, uid: string): EditorDocument {
  return edit(doc, (draft) => {
    const { node } = mustFind(draft, uid)
    delete node.slots.detail
    const table = node.props.table
    if (table && typeof table === 'object' && !Array.isArray(table)) delete table.detail
  })
}

export function addSection(doc: EditorDocument, name: SectionName): EditorDocument {
  return edit(doc, (draft) => {
    draft.root.slots[name] ??= []
  })
}

/** Tira a seção inteira, com o que tiver dentro. */
export function removeSection(doc: EditorDocument, name: SectionName): EditorDocument {
  return edit(doc, (draft) => {
    delete draft.root.slots[name]
    const sections = draft.root.props.sections
    if (typeof sections === 'object' && sections !== null && !Array.isArray(sections)) delete sections[name]
  })
}

export function presentSections(doc: EditorDocument): SectionName[] {
  return SECTION_NAMES.filter((name) => doc.root.slots[name] !== undefined)
}

export type InsertableKind = Exclude<ComponentKind, 'image' | 'pageBreak'> | 'rowColumn' | 'tableColumn'

export interface NodeSeed {
  bind?: string
  dataPath?: string
  /** Colunas de tabela: chave (bind relativo ao item), título e estilo. */
  columns?: { key: string; title: string; styleRef?: string; format?: JsonObject }[]
  title?: string
  styleRef?: string
  /** Tabela: estilo do cabeçalho. */
  headerStyleRef?: string
  format?: JsonObject
}

export function createNode(kind: InsertableKind, seed: NodeSeed = {}): EditorNode {
  const node = (props: JsonObject, slots: EditorNode['slots'] = {}): EditorNode => ({ uid: newUid(), kind, props, slots })
  switch (kind) {
    case 'text':
      return node({
        type: 'text',
        ...(seed.styleRef ? { styleRef: seed.styleRef } : {}),
        ...(seed.bind ? { bind: seed.bind } : {}),
        ...(seed.format ? { format: seed.format } : {}),
        text: seed.bind ? {} : { value: seed.title ?? 'Texto' },
      })
    case 'spacer':
      return node({ type: 'spacer', spacer: { heightMm: 4 } })
    case 'line':
      return node({ type: 'line', line: { thicknessMm: 0.2 } })
    case 'box':
      return node({ type: 'box', box: { components: null } }, { components: [] })
    case 'repeat':
      return node({ type: 'repeat', repeat: { dataPath: seed.dataPath ?? '', components: null } }, {
        components: [createNode('text', { bind: seed.bind ?? '@item', styleRef: seed.styleRef, format: seed.format })],
      })
    case 'row':
      return node({ type: 'row', row: { columns: null } }, {
        columns: [createNode('rowColumn'), createNode('rowColumn')],
      })
    case 'rowColumn':
      return node({ weight: 1, components: null }, { components: [] })
    case 'table':
      return node(
        {
          type: 'table',
          table: { dataPath: seed.dataPath ?? '', header: seed.headerStyleRef ? { styleRef: seed.headerStyleRef } : {}, columns: null },
        },
        {
          columns: (seed.columns ?? [{ key: '', title: 'Coluna', styleRef: seed.styleRef }]).map((c) =>
            createNode('tableColumn', { bind: c.key, title: c.title, styleRef: c.styleRef, format: c.format }),
          ),
        },
      )
    case 'tableColumn':
      return node({
        key: seed.bind ?? '',
        title: seed.title ?? 'Coluna',
        weight: 1,
        ...(seed.styleRef ? { styleRef: seed.styleRef } : {}),
        ...(seed.format ? { format: seed.format } : {}),
      })
  }
}

/** Rótulo curto para a árvore. */
export function describeNode(node: EditorNode): { title: string; detail: string } {
  const p = node.props
  const str = (v: JsonValue | undefined) => (typeof v === 'string' ? v : '')
  switch (node.kind) {
    case 'template':
      return { title: 'Impresso', detail: '' }
    case 'text': {
      const text = (p.text ?? {}) as JsonObject
      const parts = Array.isArray(text.parts) ? (text.parts as JsonObject[]) : null
      if (parts) return { title: 'Texto', detail: parts.map((x) => (x.bind ? `{${str(x.bind)}}` : str(x.value))).join('') }
      if (p.bind) return { title: 'Texto', detail: `{${str(p.bind)}}` }
      return { title: 'Texto', detail: str(text.value) }
    }
    case 'spacer':
      return { title: 'Espaço', detail: `${str(String(getProp(node, ['spacer', 'heightMm']) ?? ''))} mm` }
    case 'line':
      return { title: 'Linha horizontal', detail: '' }
    case 'box':
      return { title: 'Caixa', detail: '' }
    case 'row':
      return { title: 'Linha de colunas', detail: `${node.slots.columns?.length ?? 0} colunas` }
    case 'rowColumn':
      return { title: 'Coluna', detail: widthLabel(p) }
    case 'table':
      return { title: 'Tabela', detail: str(getProp(node, ['table', 'dataPath'])) }
    case 'tableColumn':
      return { title: str(p.title) || 'Coluna', detail: str(p.key) || str(getProp(node, ['cell', 'bind'])) }
    case 'repeat':
      return { title: 'Repetição', detail: str(getProp(node, ['repeat', 'dataPath'])) }
    case 'image':
      return { title: 'Imagem', detail: str(getProp(node, ['image', 'asset'])) }
    case 'pageBreak':
      return { title: 'Quebra de página', detail: '' }
    case 'opaque': {
      const v = p.value
      const type = typeof v === 'object' && v !== null && !Array.isArray(v) ? str(v.type) : ''
      return { title: 'Não editável', detail: type }
    }
  }
}

function widthLabel(p: JsonObject): string {
  if (typeof p.widthMm === 'number' && p.widthMm > 0) return `${p.widthMm} mm`
  if (typeof p.weight === 'number') return `peso ${p.weight}`
  return ''
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}
