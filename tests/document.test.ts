import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fromTemplate, resolveIssuePath, serialize, toTemplate, type EditorNode } from '../src/lib/document/document'
import type { Template } from '../src/lib/spec/template'

const dir = new URL('./fixtures/templates/', import.meta.url)
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.json'))

function load(name: string): Template {
  return JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as Template
}

function walk(node: EditorNode, visit: (n: EditorNode) => void): void {
  visit(node)
  for (const children of Object.values(node.slots)) children?.forEach((c) => walk(c, visit))
}

describe('ida e volta', () => {
  it.each(fixtures)('%s sai byte a byte igual', (name) => {
    const original = load(name)
    const expected = JSON.stringify(original, null, 2)
    const doc = fromTemplate(original)

    expect(JSON.stringify(toTemplate(doc), null, 2)).toBe(expected)
    // Serializar não consome o documento, e abrir não mexe no que foi aberto.
    expect(JSON.stringify(toTemplate(doc), null, 2)).toBe(expected)
    expect(JSON.stringify(original, null, 2)).toBe(expected)
  })

  it.each(fixtures)('%s abre de novo igual ao que salvou', (name) => {
    const once = toTemplate(fromTemplate(load(name)))
    expect(toTemplate(fromTemplate(once))).toEqual(once)
  })
})

describe('árvore', () => {
  const doc = fromTemplate(load('sintetico-todos-os-tipos.json'))
  const content = doc.root.slots.content!

  it('dá uid único a cada nó', () => {
    const uids: string[] = []
    walk(doc.root, (n) => uids.push(n.uid))
    expect(new Set(uids).size).toBe(uids.length)
  })

  it('decompõe os containers conhecidos', () => {
    expect(content.map((n) => n.kind)).toEqual([
      'text', 'box', 'box', 'row', 'table', 'table', 'opaque', 'opaque', 'opaque', 'opaque', 'opaque', 'spacer',
    ])
    const row = content[3]!
    expect(row.slots.columns!.map((n) => n.kind)).toEqual(['rowColumn', 'opaque', 'opaque'])
    const table = content[4]!
    expect(table.slots.columns!.map((n) => n.kind)).toEqual(['tableColumn', 'tableColumn'])
    expect(table.slots.detail![0]!.kind).toBe('repeat')
    expect(table.slots.detail![0]!.slots.components![0]!.kind).toBe('text')
  })

  it('não cria slot para detail sem lista, nem para seção sem lista', () => {
    expect(content[5]!.slots.detail).toBeUndefined()
    expect(doc.root.slots.pageFooter).toBeUndefined()
  })

  it('serializa filhos movidos e apagados', () => {
    const moved = fromTemplate(load('ergo-simple.json'))
    const list = moved.root.slots.content!
    const first = list.shift()!
    list.push(first)
    const out = toTemplate(moved)
    const original = load('ergo-simple.json').sections.content!.components
    expect(out.sections.content!.components).toEqual([...original.slice(1), original[0]])
  })

  it('cria o caminho de um slot novo', () => {
    const fresh = fromTemplate({ version: 'v1', unit: 'mm', page: { widthMm: 10, heightMm: 10, margin: { topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0 } }, sections: {} })
    fresh.root.slots.pageHeader = []
    expect(toTemplate(fresh).sections).toEqual({ pageHeader: { components: [] } })
  })
})

describe('issues do ergo', () => {
  const doc = fromTemplate(load('sintetico-todos-os-tipos.json'))
  const { paths } = serialize(doc)
  const table = doc.root.slots.content![4]!

  it('leva o path ao nó mais específico', () => {
    const col = table.slots.columns![1]!
    expect(resolveIssuePath(paths, 'template.sections.content.components[4].table.columns[1].key')).toBe(col.uid)
    expect(resolveIssuePath(paths, 'template.sections.content.components[4].table.header.cells[1].value')).toBe(table.uid)
    const repeatText = table.slots.detail![0]!.slots.components![0]!
    expect(
      resolveIssuePath(paths, 'template.sections.content.components[4].table.detail.components[0].repeat.components[0].bind'),
    ).toBe(repeatText.uid)
  })

  it('cai na raiz quando o path não é de componente', () => {
    expect(resolveIssuePath(paths, 'template.page.widthMm')).toBe(doc.root.uid)
  })
})
