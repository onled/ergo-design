/*
 * Estilos nomeados: o único jeito de dar aparência a algo no ergo.
 *
 * O autor não gerencia uma folha de estilos antes de começar: formata o
 * componente, e o editor cria, reaproveita ou altera o estilo por trás. Tudo
 * aqui é puro sobre o documento, como `ops.ts`.
 *
 * Um estilo é referenciado por lista (`"celula direita"`), em vários lugares:
 * no componente, na coluna de linha, na coluna de tabela, no cabeçalho e na
 * linha da tabela, e em células explícitas.
 */

import type { Style } from '../spec/template'
import type { EditorDocument, EditorNode, JsonObject, JsonValue } from './document'
import { findNode } from './ops'

/** Onde, dentro de `props` de um nó, pode haver um `styleRef`. */
export type RefPath = readonly string[]

export interface StyleUse {
  uid: string
  path: RefPath
}

export function styleNames(doc: EditorDocument): string[] {
  return Object.keys(stylesObject(doc) ?? {})
}

export function getStyle(doc: EditorDocument, name: string): JsonObject | undefined {
  const s = stylesObject(doc)?.[name]
  return isObject(s) ? s : undefined
}

export function refTokens(ref: JsonValue | undefined): string[] {
  return typeof ref === 'string' ? ref.split(/\s+/).filter(Boolean) : []
}

/** Todo `styleRef` do documento, com o nó e o caminho onde está. */
export function styleRefs(doc: EditorDocument): (StyleUse & { tokens: string[] })[] {
  const out: (StyleUse & { tokens: string[] })[] = []
  const visit = (node: EditorNode) => {
    for (const path of refPathsOf(node)) {
      const tokens = refTokens(getIn(node.props, path))
      if (tokens.length) out.push({ uid: node.uid, path, tokens })
    }
    for (const list of Object.values(node.slots)) list?.forEach(visit)
  }
  visit(doc.root)
  return out
}

/** Caminhos de `styleRef` que existem de fato no nó (células explícitas incluídas). */
export function refPathsOf(node: EditorNode): RefPath[] {
  switch (node.kind) {
    case 'template':
    case 'opaque':
      return []
    case 'rowColumn':
    case 'tableColumn':
      return [['styleRef']]
    case 'table': {
      const paths: RefPath[] = [
        ['styleRef'],
        ['table', 'header', 'styleRef'],
        ['table', 'row', 'styleRef'],
        ['table', 'detail', 'styleRef'],
      ]
      for (const band of ['header', 'row']) {
        const cells = getIn(node.props, ['table', band, 'cells'])
        if (Array.isArray(cells)) cells.forEach((_, i) => paths.push(['table', band, 'cells', String(i), 'styleRef']))
      }
      return paths
    }
    default:
      return [['styleRef']]
  }
}

export function styleUsage(doc: EditorDocument): Map<string, StyleUse[]> {
  const usage = new Map<string, StyleUse[]>(styleNames(doc).map((n) => [n, []]))
  for (const ref of styleRefs(doc)) {
    for (const token of new Set(ref.tokens)) {
      const list = usage.get(token) ?? []
      list.push({ uid: ref.uid, path: ref.path })
      usage.set(token, list)
    }
  }
  return usage
}

export function isValidStyleName(name: string): boolean {
  return /^[^\s]+$/.test(name)
}

export function uniqueStyleName(doc: EditorDocument, base: string): string {
  const names = new Set(styleNames(doc))
  const clean = base.replace(/\s+/g, '-') || 'estilo'
  if (!names.has(clean)) return clean
  for (let i = 2; ; i++) if (!names.has(`${clean}-${i}`)) return `${clean}-${i}`
}

function edit(doc: EditorDocument, fn: (draft: EditorDocument, styles: JsonObject) => void): EditorDocument {
  const draft = structuredClone(doc)
  let styles = draft.root.props.styles
  if (!isObject(styles)) {
    styles = {}
    draft.root.props.styles = styles
  }
  fn(draft, styles)
  return draft
}

export function createStyle(doc: EditorDocument, name: string, style: Style | JsonObject = {}): EditorDocument {
  if (!isValidStyleName(name)) throw new Error(`[ergo-design] nome de estilo inválido: "${name}"`)
  return edit(doc, (_, styles) => {
    if (name in styles) throw new Error(`[ergo-design] o estilo ${name} já existe`)
    styles[name] = structuredClone(style) as JsonObject
  })
}

/** Renomeia mantendo a posição no objeto e atualiza toda referência. */
export function renameStyle(doc: EditorDocument, from: string, to: string): EditorDocument {
  if (from === to) return doc
  if (!isValidStyleName(to)) throw new Error(`[ergo-design] nome de estilo inválido: "${to}"`)
  if (styleNames(doc).includes(to)) throw new Error(`[ergo-design] o estilo ${to} já existe`)
  const refs = styleRefs(doc).filter((r) => r.tokens.includes(from))
  return edit(doc, (draft, styles) => {
    const entries = Object.entries(styles).map(([k, v]) => [k === from ? to : k, v] as const)
    for (const key of Object.keys(styles)) delete styles[key]
    for (const [k, v] of entries) styles[k] = v
    for (const ref of refs) {
      const node = findNode(draft, ref.uid)!.node
      setIn(node.props, ref.path, ref.tokens.map((t) => (t === from ? to : t)).join(' '))
    }
  })
}

export function duplicateStyle(doc: EditorDocument, name: string, newName = uniqueStyleName(doc, name)): { doc: EditorDocument; name: string } {
  const style = getStyle(doc, name) ?? {}
  return { doc: createStyle(doc, newName, style), name: newName }
}

/** Só apaga o que ninguém usa: apagar um estilo em uso é erro de validação no ergo. */
export function deleteStyle(doc: EditorDocument, name: string): EditorDocument {
  if ((styleUsage(doc).get(name)?.length ?? 0) > 0) throw new Error(`[ergo-design] o estilo ${name} está em uso`)
  return edit(doc, (_, styles) => {
    delete styles[name]
  })
}

/**
 * Altera uma propriedade do estilo; `undefined` apaga. Objetos que ficam vazios
 * (`padding`, `border`, `margin`) saem junto, para o JSON não acumular `{}`.
 */
export function setStyleProp(doc: EditorDocument, name: string, path: readonly string[], value: JsonValue | undefined): EditorDocument {
  return edit(doc, (_, styles) => {
    const style = isObject(styles[name]) ? (styles[name] as JsonObject) : (styles[name] = {})
    if (value === undefined) {
      deleteIn(style, path)
    } else {
      setIn(style, path, value)
    }
  })
}

/** Troca `from` por `to` numa referência, mantendo a ordem da composição. */
export function replaceToken(doc: EditorDocument, uid: string, path: RefPath, from: string | null, to: string): EditorDocument {
  const draft = structuredClone(doc)
  const node = findNode(draft, uid)?.node
  if (!node) throw new Error(`[ergo-design] nó ${uid} não existe`)
  const tokens = refTokens(getIn(node.props, path))
  const next = from === null ? [...tokens, to] : tokens.map((t) => (t === from ? to : t))
  setIn(node.props, path, [...new Set(next)].join(' '))
  return draft
}

/** Outro estilo com exatamente o mesmo conteúdo, se houver. */
export function findEquivalentStyle(doc: EditorDocument, name: string): string | undefined {
  const target = canonical(getStyle(doc, name) ?? {})
  return styleNames(doc).find((other) => other !== name && canonical(getStyle(doc, other) ?? {}) === target)
}

function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k]!)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/* Composição, espelho de mergeStyle no builder do ergo, para mostrar o valor em vigor. */

export const DEFAULT_STYLE: Style = { fontSizePt: 10, color: '#000000', align: 'left', overflow: 'wrap' }

export function effectiveStyle(doc: EditorDocument, tokens: string[]): Style {
  let out: Style = structuredClone(DEFAULT_STYLE)
  for (const t of tokens) {
    const s = getStyle(doc, t)
    if (s) out = mergeStyle(out, s as Style)
  }
  return out
}

export function mergeStyle(base: Style, over: Style): Style {
  const out: Style = { ...base }
  const scalar = [
    'fontFamily',
    'fontWeight',
    'fontStyle',
    'textDecoration',
    'color',
    'backgroundColor',
    'align',
    'verticalAlign',
    'overflow',
  ] as const
  for (const k of scalar) if (over[k]) (out as Record<string, unknown>)[k] = over[k]
  const positive = ['fontSizePt', 'lineHeightMm', 'minHeightMm', 'maxLines', 'hangingIndentMm'] as const
  for (const k of positive) if ((over[k] ?? 0) > 0) (out as Record<string, unknown>)[k] = over[k]
  out.padding = mergeSpacing(base.padding, over.padding)
  out.border = { ...base.border }
  for (const k of ['widthMm', 'radiusMm'] as const) if ((over.border?.[k] ?? 0) > 0) out.border[k] = over.border![k]
  for (const k of ['color', 'sides'] as const) if (over.border?.[k]) out.border[k] = over.border[k]
  if (over.margin) out.margin = mergeSpacing(base.margin, over.margin)
  return out
}

function mergeSpacing(base: Style['padding'], over: Style['padding']): Style['padding'] {
  const out = { ...base }
  for (const k of ['topMm', 'rightMm', 'bottomMm', 'leftMm'] as const) if ((over?.[k] ?? 0) > 0) out[k] = over![k]
  return out
}

/* Conjunto inicial */

/**
 * Estilos com que um impresso novo nasce: o padrão Onled, sóbrio, que já sai
 * apresentável antes de o autor formatar qualquer coisa.
 */
export function starterStyles(): Record<string, Style> {
  const cellPadding = { topMm: 1, rightMm: 1.2, bottomMm: 1, leftMm: 1.2 }
  return {
    texto: { fontSizePt: 9 },
    titulo: { fontSizePt: 16, fontWeight: 'bold', margin: { bottomMm: 1 } },
    subtitulo: { fontSizePt: 11, color: '#333333', margin: { bottomMm: 3 } },
    rotulo: { fontSizePt: 8, fontWeight: 'bold' },
    'cabecalho-tabela': {
      fontSizePt: 8,
      fontWeight: 'bold',
      verticalAlign: 'bottom',
      padding: cellPadding,
      border: { widthMm: 0.3, color: '#999999', sides: 'b' },
    },
    celula: {
      fontSizePt: 8,
      verticalAlign: 'middle',
      padding: cellPadding,
      border: { widthMm: 0.2, color: '#cccccc', sides: 'b' },
    },
    direita: { align: 'right' },
    centro: { align: 'center' },
    rodape: { fontSizePt: 7, color: '#555555' },
  }
}

/** Estilo que um componente novo recebe, se o impresso tiver o nome. */
export function defaultStyleFor(doc: EditorDocument, role: 'text' | 'title' | 'label' | 'tableHeader' | 'cell' | 'numericCell' | 'footer'): string | undefined {
  const names = new Set(styleNames(doc))
  const pick = (...tokens: string[]) => (tokens.every((t) => names.has(t)) ? tokens.join(' ') : tokens.find((t) => names.has(t)))
  switch (role) {
    case 'text':
      return pick('texto')
    case 'title':
      return pick('titulo')
    case 'label':
      return pick('rotulo')
    case 'tableHeader':
      return pick('cabecalho-tabela')
    case 'cell':
      return pick('celula')
    case 'numericCell':
      return pick('celula', 'direita')
    case 'footer':
      return pick('rodape')
  }
}

function stylesObject(doc: EditorDocument): JsonObject | undefined {
  const s = doc.root.props.styles
  return isObject(s) ? s : undefined
}

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function getIn(obj: JsonValue, path: readonly string[]): JsonValue | undefined {
  let cur: JsonValue | undefined = obj
  for (const key of path) {
    if (Array.isArray(cur)) cur = cur[Number(key)]
    else if (isObject(cur)) cur = cur[key]
    else return undefined
  }
  return cur
}

function setIn(obj: JsonObject, path: readonly string[], value: JsonValue): void {
  let cur: JsonValue = obj
  for (const key of path.slice(0, -1)) {
    const container: JsonObject | JsonValue[] = cur as JsonObject | JsonValue[]
    const next: JsonValue | undefined = Array.isArray(container) ? container[Number(key)] : container[key]
    if (typeof next !== 'object' || next === null) {
      if (Array.isArray(container)) container[Number(key)] = {}
      else container[key] = {}
    }
    cur = (Array.isArray(container) ? container[Number(key)] : container[key]) as JsonValue
  }
  const last = path[path.length - 1]!
  if (Array.isArray(cur)) cur[Number(last)] = value
  else (cur as JsonObject)[last] = value
}

function deleteIn(obj: JsonObject, path: readonly string[]): void {
  const parents: JsonObject[] = [obj]
  let cur: JsonObject = obj
  for (const key of path.slice(0, -1)) {
    const next = cur[key]
    if (!isObject(next)) return
    cur = next
    parents.push(cur)
  }
  delete cur[path[path.length - 1]!]
  for (let i = parents.length - 1; i > 0; i--) {
    if (Object.keys(parents[i]!).length > 0) break
    delete parents[i - 1]![path[i - 1]!]
  }
}
