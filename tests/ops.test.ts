import { describe, expect, it } from 'vitest'
import { fromTemplate, toTemplate } from '../src/lib/document/document'
import * as ops from '../src/lib/document/ops'
import { bindFor, dataTree, scopeOf } from '../src/lib/document/scope'
import { createEmptyTemplate } from '../src/lib/spec/template'

function blank() {
  return fromTemplate(createEmptyTemplate())
}

describe('operações', () => {
  it('insere na forma do §4: tabela curta, colunas com weight', () => {
    let doc = blank()
    const table = ops.createNode('table', { dataPath: 'data', columns: [{ key: 'nome', title: 'Nome' }] })
    doc = ops.insertNode(doc, doc.root.uid, 'content', 0, table)
    expect(toTemplate(doc).sections.content!.components).toEqual([
      { type: 'table', table: { dataPath: 'data', header: {}, columns: [{ key: 'nome', title: 'Nome', weight: 1 }] } },
    ])
  })

  it('não altera o documento de entrada', () => {
    const doc = blank()
    const before = JSON.stringify(doc)
    ops.insertNode(doc, doc.root.uid, 'content', 0, ops.createNode('text'))
    expect(JSON.stringify(doc)).toBe(before)
  })

  it('move entre containers e recusa entrar em si mesmo', () => {
    let doc = blank()
    const box = ops.createNode('box')
    const text = ops.createNode('text', { title: 'a' })
    doc = ops.insertNode(doc, doc.root.uid, 'content', 0, box)
    doc = ops.insertNode(doc, doc.root.uid, 'content', 1, text)
    doc = ops.moveNode(doc, text.uid, box.uid, 'components', 0)
    expect(toTemplate(doc).sections.content!.components).toEqual([
      { type: 'box', box: { components: [{ type: 'text', text: { value: 'a' } }] } },
    ])
    expect(() => ops.moveNode(doc, box.uid, box.uid, 'components', 0)).toThrow()
  })

  it('recusa filho que o slot não aceita', () => {
    const doc = blank()
    expect(() => ops.insertNode(doc, doc.root.uid, 'content', 0, ops.createNode('rowColumn'))).toThrow()
  })

  it('reordena na mesma lista pela posição final', () => {
    let doc = blank()
    const [a, b, c] = ['a', 'b', 'c'].map((t) => ops.createNode('text', { title: t }))
    for (const [i, n] of [a!, b!, c!].entries()) doc = ops.insertNode(doc, doc.root.uid, 'content', i, n)
    doc = ops.moveNode(doc, a!.uid, doc.root.uid, 'content', 2)
    expect(toTemplate(doc).sections.content!.components.map((x) => (x as { text: { value: string } }).text.value)).toEqual(['b', 'c', 'a'])
  })

  it('edita e apaga propriedade; duplica com uid novo', () => {
    let doc = blank()
    const text = ops.createNode('text')
    doc = ops.insertNode(doc, doc.root.uid, 'content', 0, text)
    doc = ops.setProp(doc, text.uid, ['bind'], 'nome')
    doc = ops.setProp(doc, text.uid, ['text', 'value'], undefined)
    const dup = ops.duplicateNode(doc, text.uid)
    expect(dup.uid).not.toBe(text.uid)
    expect(toTemplate(dup.doc).sections.content!.components).toEqual([
      { type: 'text', text: {}, bind: 'nome' },
      { type: 'text', text: {}, bind: 'nome' },
    ])
  })

  it('seção nova e removida', () => {
    let doc = ops.addSection(blank(), 'pageFooter')
    expect(toTemplate(doc).sections.pageFooter).toEqual({ components: [] })
    doc = ops.removeSection(doc, 'pageFooter')
    expect(toTemplate(doc).sections.pageFooter).toBeUndefined()
  })
})

describe('escopo de dados', () => {
  const data = {
    header: { cliente_nome: 'X' },
    data: [
      { nome: 'a', cns: null, obs: ['o'] },
      { nome: 'b', cns: '70', extra: 1 },
    ],
  }

  it('monta a árvore juntando as chaves dos itens', () => {
    const tree = dataTree(data)
    const list = tree.find((f) => f.key === 'data')!
    expect(list.kind).toBe('list')
    expect(list.children.map((c) => `${c.path}:${c.kind}`)).toEqual([
      'data[].nome:text',
      'data[].cns:text',
      'data[].obs:list',
      'data[].extra:number',
    ])
    expect(list.children[2]!.children[0]!.path).toBe('data[].obs[]')
  })

  it('escreve caminho relativo dentro da tabela e $. para a raiz', () => {
    let doc = blank()
    const table = ops.createNode('table', { dataPath: 'data' })
    doc = ops.insertNode(doc, doc.root.uid, 'content', 0, table)
    const column = table.slots.columns![0]!
    const scope = scopeOf(doc, column.uid)
    expect(scope).toBe('data[]')
    expect(scopeOf(doc, table.uid)).toBe('')
    expect(bindFor('data[].nome', scope)).toBe('nome')
    expect(bindFor('data[].obs[]', scope)).toBe('obs[0]')
    expect(bindFor('header.cliente_nome', scope)).toBe('$.header.cliente_nome')
    expect(bindFor('data[].nome', '')).toBe('data[0].nome')
  })
})
