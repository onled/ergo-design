import { describe, expect, it } from 'vitest'
import { fromTemplate, toTemplate, type EditorDocument } from '../src/lib/document/document'
import * as ops from '../src/lib/document/ops'
import * as st from '../src/lib/document/styles'
import { createEmptyTemplate } from '../src/lib/spec/template'

function withTable(): { doc: EditorDocument; table: string; column: string; text: string } {
  let doc = fromTemplate(createEmptyTemplate())
  const table = ops.createNode('table', { dataPath: 'data', columns: [{ key: 'a', title: 'A' }] })
  const text = ops.createNode('text')
  doc = ops.insertNode(doc, doc.root.uid, 'content', 0, table)
  doc = ops.insertNode(doc, doc.root.uid, 'content', 1, text)
  const column = table.slots.columns![0]!.uid
  doc = ops.setProp(doc, table.uid, ['table', 'header', 'styleRef'], 'cabecalho-tabela')
  doc = ops.setProp(doc, column, ['styleRef'], 'celula direita')
  doc = ops.setProp(doc, text.uid, ['styleRef'], 'texto')
  return { doc, table: table.uid, column, text: text.uid }
}

describe('estilos', () => {
  it('um impresso novo nasce com o conjunto inicial', () => {
    expect(Object.keys(createEmptyTemplate().styles!)).toContain('cabecalho-tabela')
  })

  it('conta os usos em todo lugar que aceita styleRef', () => {
    const { doc, table, column, text } = withTable()
    const usage = st.styleUsage(doc)
    expect(usage.get('cabecalho-tabela')).toEqual([{ uid: table, path: ['table', 'header', 'styleRef'] }])
    expect(usage.get('direita')).toEqual([{ uid: column, path: ['styleRef'] }])
    expect(usage.get('texto')).toEqual([{ uid: text, path: ['styleRef'] }])
    expect(usage.get('rodape')).toEqual([])
  })

  it('renomeia na mesma posição e atualiza as referências compostas', () => {
    const { doc } = withTable()
    const out = toTemplate(st.renameStyle(doc, 'celula', 'td'))
    expect(Object.keys(out.styles!).indexOf('td')).toBe(Object.keys(doc.root.props.styles as object).indexOf('celula'))
    const column = (out.sections.content!.components[0] as { table: { columns: { styleRef: string }[] } }).table.columns[0]!
    expect(column.styleRef).toBe('td direita')
    expect(() => st.renameStyle(doc, 'td', 'texto')).toThrow()
    expect(() => st.renameStyle(doc, 'celula', 'com espaco')).toThrow()
  })

  it('renomeia dentro de células explícitas', () => {
    let doc = fromTemplate(createEmptyTemplate())
    const table = ops.createNode('table', { dataPath: 'd', columns: [{ key: 'a', title: 'A' }] })
    doc = ops.insertNode(doc, doc.root.uid, 'content', 0, table)
    doc = ops.setProp(doc, table.uid, ['table', 'row'], { cells: [{ bind: 'a', styleRef: 'celula' }] })
    const out = toTemplate(st.renameStyle(doc, 'celula', 'td'))
    expect(JSON.stringify(out)).toContain('"cells":[{"bind":"a","styleRef":"td"}]')
  })

  it('não apaga estilo em uso', () => {
    const { doc } = withTable()
    expect(() => st.deleteStyle(doc, 'texto')).toThrow()
    expect(st.styleNames(st.deleteStyle(doc, 'rodape'))).not.toContain('rodape')
  })

  it('apagar a última propriedade de um grupo tira o grupo', () => {
    let doc = fromTemplate(createEmptyTemplate())
    doc = st.setStyleProp(doc, 'rodape', ['border', 'widthMm'], 0.2)
    doc = st.setStyleProp(doc, 'rodape', ['border', 'widthMm'], undefined)
    expect(st.getStyle(doc, 'rodape')).toEqual({ fontSizePt: 7, color: '#555555' })
  })

  it('troca um nome na composição sem mudar a ordem', () => {
    const { doc, column } = withTable()
    const { doc: dup, name } = st.duplicateStyle(doc, 'celula')
    expect(name).toBe('celula-2')
    const out = st.replaceToken(dup, column, ['styleRef'], 'celula', name)
    expect(ops.findNode(out, column)!.node.props.styleRef).toBe('celula-2 direita')
  })

  it('acha estilo equivalente independente da ordem das chaves', () => {
    let doc = fromTemplate(createEmptyTemplate())
    doc = st.createStyle(doc, 'outro', { align: 'right' })
    expect(st.findEquivalentStyle(doc, 'outro')).toBe('direita')
  })

  it('compõe como o ergo', () => {
    const { doc } = withTable()
    const style = st.effectiveStyle(doc, ['cabecalho-tabela', 'direita'])
    expect(style).toMatchObject({ fontSizePt: 8, fontWeight: 'bold', align: 'right', border: { widthMm: 0.3, sides: 'b' } })
  })
})
