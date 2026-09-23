import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { createDesigner } from '../src/lib/designer/useDesigner'
import { createEmptyTemplate, type Template } from '../src/lib/spec/template'
import { effectiveStyle, getStyle } from '../src/lib/document/styles'

function setup(data: unknown = { itens: [{ nome: 'a', valor: 1, quando: '2026-09-07' }], cliente: 'X' }) {
  const template = ref<Template>(createEmptyTemplate())
  const d = ref<unknown>(data)
  const designer = effectScope().run(() => createDesigner(template, d))!
  const field = (path: string) => {
    const find = (list: ReturnType<typeof designer.fields.value.slice>): (typeof list)[number] | undefined => {
      for (const f of list) {
        if (f.path === path) return f
        const deeper = find(f.children)
        if (deeper) return deeper
      }
      return undefined
    }
    return find(designer.fields.value)!
  }
  return { template, designer, field }
}

describe('montar a partir dos dados', () => {
  it('lista vira tabela com estilos padrão, número à direita e data formatada', () => {
    const { template, designer, field } = setup()
    designer.fieldAction(field('itens'))!.run()
    const table = (template.value.sections.content!.components[0] as { table: Record<string, unknown> }).table
    expect(table.header).toEqual({ styleRef: 'cabecalho-tabela' })
    expect(table.columns).toEqual([
      { key: 'nome', title: 'Nome', weight: 1, styleRef: 'celula' },
      { key: 'valor', title: 'Valor', weight: 1, styleRef: 'celula direita' },
      { key: 'quando', title: 'Quando', weight: 1, styleRef: 'celula', format: { type: 'date' } },
    ])
  })

  it('variável do sistema entra como está', () => {
    const { template, designer } = setup()
    designer.fieldAction(designer.systemFields.value.find((f) => f.path === '@page.number')!)!.run()
    expect(template.value.sections.content!.components[0]).toMatchObject({ bind: '@page.number', styleRef: 'texto' })
  })

  it('bloco de rodapé entra no rodapé, criando a seção', () => {
    const { template, designer } = setup()
    designer.insertBlock('footer')
    expect(JSON.stringify(template.value.sections.pageFooter)).toContain('@page.total')
  })
})

describe('clicar campo após campo', () => {
  it('texto já ligado e selecionado: o clique insere outro; Alt troca o campo', () => {
    const { template, designer, field } = setup({ a: 'x', b: 'y', c: 'z' })
    designer.fieldAction(field('a'))!.run()
    designer.fieldAction(field('b'))!.run()
    expect(template.value.sections.content!.components.map((c) => c.bind)).toEqual(['a', 'b'])
    designer.fieldAction(field('c'))!.alt!.run()
    expect(template.value.sections.content!.components.map((c) => c.bind)).toEqual(['a', 'c'])
  })

  it('texto fixo ou composto terminando em texto espera o campo', () => {
    const { template, designer, field } = setup({ a: 'x', b: 'y' })
    designer.insertKind('text')
    designer.fieldAction(field('a'))!.run()
    const uid = designer.selectedUid.value!
    designer.setProps(uid, [[['bind'], undefined], [['text', 'parts'], [{ value: 'Rótulo: ' }]]])
    designer.fieldAction(field('b'))!.run()
    expect(template.value.sections.content!.components).toHaveLength(1)
    expect(template.value.sections.content!.components[0]).toMatchObject({ text: { parts: [{ value: 'Rótulo: ' }, { bind: 'b' }] } })
  })

  it('coluna ligada e selecionada: o clique acrescenta a coluna ao lado', () => {
    const { template, designer, field } = setup()
    designer.insertField(field('itens'))
    const table = designer.selectedUid.value!
    designer.select(designer.doc.value.root.slots.content![0]!.slots.columns![0]!.uid)
    designer.fieldAction(field('itens[].valor'))!.run()
    const cols = (template.value.sections.content!.components[0] as { table: { columns: { key: string }[] } }).table.columns
    expect(cols.map((c) => c.key)).toEqual(['nome', 'valor', 'valor', 'quando'])
    expect(table).toBeTruthy()
  })
})

describe('aparência', () => {
  it('componente sem estilo ganha um novo na primeira mudança', () => {
    const { template, designer } = setup()
    designer.insertKind('box')
    const uid = designer.selectedUid.value!
    designer.editAppearance(uid, ['styleRef'], null, ['backgroundColor'], '#eeeeee')
    expect(template.value.sections.content!.components[0]!.styleRef).toBe('caixa')
    expect(template.value.styles!.caixa).toEqual({ backgroundColor: '#eeeeee' })
  })

  it('reaproveita um estilo igual em vez de criar outro', () => {
    const { template, designer } = setup()
    designer.insertKind('line')
    const uid = designer.selectedUid.value!
    designer.editAppearance(uid, ['styleRef'], null, ['align'], 'right')
    expect(template.value.sections.content!.components[0]!.styleRef).toBe('direita')
    expect(Object.keys(template.value.styles!)).not.toContain('linha')
  })

  it('mudança em estilo compartilhado vale para todos; desfazer volta de uma vez', () => {
    const { template, designer, field } = setup()
    designer.insertField(field('cliente'))
    designer.insertField(field('cliente'))
    const second = designer.selectedUid.value!
    designer.editAppearance(second, ['styleRef'], 'texto', ['fontWeight'], 'bold')
    expect(template.value.styles!.texto).toEqual({ fontSizePt: 9, fontWeight: 'bold' })
    expect(template.value.sections.content!.components.map((c) => c.styleRef)).toEqual(['texto', 'texto'])
    designer.undo()
    expect(template.value.styles!.texto).toEqual({ fontSizePt: 9 })
  })

  it('"só aqui" cria uma variação composta, e o original continua valendo no resto', () => {
    const { template, designer, field } = setup()
    designer.insertField(field('cliente'))
    designer.insertField(field('cliente'))
    const second = designer.selectedUid.value!

    const variacao = designer.editAppearance(second, ['styleRef'], 'texto', ['fontSizePt'], 7, { variant: true })
    expect(variacao).toBe('texto-variacao')
    expect(template.value.sections.content!.components.map((c) => c.styleRef)).toEqual(['texto', 'texto texto-variacao'])
    // a variação só declara o que mudou; o resto segue vindo de `texto`
    expect(getStyle(designer.doc.value, 'texto-variacao')).toEqual({ fontSizePt: 7 })
    expect(getStyle(designer.doc.value, 'texto')).toEqual({ fontSizePt: 9 })

    // mudar o original alcança os dois, menos o que a variação sobrescreve
    designer.editAppearance(second, ['styleRef'], 'texto', ['color'], '#333333')
    expect(getStyle(designer.doc.value, 'texto')).toEqual({ fontSizePt: 9, color: '#333333' })
    expect(effectiveStyle(designer.doc.value, ['texto', 'texto-variacao'])).toMatchObject({ fontSizePt: 7, color: '#333333' })
  })

  it('variação igual a um estilo que já existe reaproveita aquele estilo', () => {
    const { template, designer, field } = setup()
    designer.insertField(field('cliente'))
    const uid = designer.selectedUid.value!
    const usado = designer.editAppearance(uid, ['styleRef'], 'texto', ['align'], 'right', { variant: true })
    expect(usado).toBe('direita')
    expect(template.value.sections.content!.components[0]!.styleRef).toBe('texto direita')
  })

  it('renomear pelo painel atualiza as referências e o JSON emitido', () => {
    const { template, designer, field } = setup()
    designer.insertField(field('itens'))
    designer.renameStyle('celula', 'td')
    const cols = (template.value.sections.content!.components[0] as { table: { columns: { styleRef: string }[] } }).table.columns
    expect(cols.map((c) => c.styleRef)).toEqual(['td', 'td direita', 'td'])
  })
})

describe('tabela inserida pelo menu', () => {
  it('escolher a coleção preenche as colunas em branco', () => {
    const { template, designer, field } = setup()
    designer.insertKind('table')
    const before = template.value.sections.content!.components[0] as { table: { columns: { key: string }[] } }
    expect(before.table.columns).toEqual([{ key: '', title: 'Coluna', weight: 1, styleRef: 'celula' }])

    designer.fieldAction(field('itens'))!.run()
    const after = template.value.sections.content!.components[0] as { table: { dataPath: string; columns: { key: string }[] } }
    expect(after.table.dataPath).toBe('itens')
    expect(after.table.columns.map((c) => c.key)).toEqual(['nome', 'valor', 'quando'])
  })

  it('tabela com colunas já ligadas só troca a coleção', () => {
    const { template, designer, field } = setup({ a: [{ x: 1 }], b: [{ y: 2 }] })
    designer.insertField(field('a'))
    designer.fieldAction(field('b'))!.alt!.run()
    const table = template.value.sections.content!.components[0] as { table: { dataPath: string; columns: { key: string }[] } }
    expect(table.table.dataPath).toBe('b')
    expect(table.table.columns.map((c) => c.key)).toEqual(['x'])
  })
})

describe('bloco de quadro fixo', () => {
  it('insere N fileiras de M células numa entrada de desfazer', () => {
    const { template, designer } = setup()
    designer.insertBlock('grid', { rows: 3, cols: 2 })
    const rows = template.value.sections.content!.components
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.type === 'row')).toBe(true)
    const first = rows[0] as { row: { columns: { widthMm?: number; weight?: number; styleRef?: string; components: unknown[] }[] } }
    expect(first.row.columns.map((c) => [c.widthMm, c.weight, c.styleRef])).toEqual([
      [40, undefined, 'celula'],
      [undefined, 1, 'celula'],
    ])
    expect(first.row.columns[0]!.components).toHaveLength(1)
    designer.undo()
    expect(template.value.sections.content!.components).toHaveLength(0)
  })

  it('respeita os limites de linhas e colunas', () => {
    const { template, designer } = setup()
    designer.insertBlock('grid', { rows: 99, cols: 0 })
    const rows = template.value.sections.content!.components
    expect(rows).toHaveLength(20)
    expect((rows[0] as { row: { columns: unknown[] } }).row.columns).toHaveLength(1)
  })
})

describe('faixa de detalhe', () => {
  it('entra na tabela, liga a um campo do item e some quando ele está vazio', () => {
    const { template, designer, field } = setup({ itens: [{ nome: 'a', obs: ['x'] }, { nome: 'b', obs: [] }] })
    designer.insertField(field('itens'))
    const table = designer.selectedUid.value!

    designer.addDetail(table)
    // A faixa nasce sem a borda da tabela: separação é opcional.
    expect(template.value.sections.content!.components[0]).toMatchObject({
      table: { detail: { components: [{ styleRef: 'texto' }] } },
    })
    designer.fieldAction(field('itens[].obs[]'))!.run()
    const detail = (template.value.sections.content!.components[0] as { table: { detail: { components: { bind: string }[]; when?: unknown } } }).table.detail
    expect(detail.components[0]!.bind).toBe('obs[0]')

    designer.setDetailWhen(table, 'obs')
    expect((template.value.sections.content!.components[0] as { table: { detail: { when: unknown } } }).table.detail.when).toEqual({ path: 'obs', op: 'notEmpty' })

    designer.removeDetail(table)
    expect((template.value.sections.content!.components[0] as { table: { detail?: unknown } }).table.detail).toBeUndefined()
  })
})

describe('lista de textos', () => {
  const dados = { itens: [{ nome: 'a', obs: ['uma', 'outra'] }] }

  it('vira repetição com bind no próprio item, não tabela', () => {
    const { template, designer, field } = setup(dados)
    designer.fieldAction(field('itens[].obs'))!.run()
    expect(template.value.sections.content![0 as never]).toBeUndefined()
    const comp = template.value.sections.content!.components[0] as { type: string; repeat: { dataPath: string; components: { bind: string }[] } }
    expect(comp.type).toBe('repeat')
    expect(comp.repeat.dataPath).toBe('itens[0].obs')
    expect(comp.repeat.components[0]!.bind).toBe('@item')
  })

  it('dentro da faixa de detalhe, a repetição imprime todas as observações', () => {
    const { template, designer, field } = setup(dados)
    designer.insertField(field('itens'))
    const table = designer.selectedUid.value!
    designer.addDetail(table)
    const text = designer.selectedUid.value!
    designer.remove(text)
    designer.select(table)
    designer.insertField(field('itens[].obs'), { parent: table, slot: 'detail', index: 0 })
    const detail = (template.value.sections.content!.components[0] as { table: { detail: { components: { type: string; repeat: { dataPath: string } }[] } } }).table.detail
    expect(detail.components[0]!.type).toBe('repeat')
    expect(detail.components[0]!.repeat.dataPath).toBe('obs')
  })

  it('o campo (item) dentro da própria coleção vira @item', () => {
    const { designer, field } = setup(dados)
    designer.insertField(field('itens[].obs'))
    const repeatUid = designer.selectedUid.value!
    expect(designer.scopeOf(designer.doc.value.root.slots.content![0]!.slots.components![0]!.uid)).toBe('itens[].obs[]')
    expect(repeatUid).toBeTruthy()
  })
})

describe('traço do grupo linha + detalhe', () => {
  it('criar a faixa já tira o traço das colunas e põe no fim dela', () => {
    const { template, designer, field } = setup()
    designer.insertField(field('itens'))
    const table = designer.selectedUid.value!
    designer.addDetail(table)

    const t = (template.value.sections.content!.components[0] as { table: { detail: { styleRef: string } } }).table
    expect(t.detail.styleRef).toBe('separador-detalhe')
    expect(template.value.styles!['separador-detalhe']).toEqual({ border: { widthMm: 0.2, color: '#cccccc', sides: 'b' } })
    // `celula` é só destas colunas: perde a borda no lugar, sem cópia.
    expect(template.value.styles!.celula!.border).toBeUndefined()
    expect(Object.keys(template.value.styles!).filter((n) => n.includes('sem-traco'))).toEqual([])
    // e é uma entrada de desfazer só
    designer.undo()
    expect(template.value.styles!.celula!.border).toEqual({ widthMm: 0.2, color: '#cccccc', sides: 'b' })
  })

  it('estilo usado fora da tabela vira cópia, e o resto do impresso não muda', () => {
    const { template, designer, field } = setup()
    designer.insertField(field('itens'))
    const table = designer.selectedUid.value!
    // um texto qualquer, fora da tabela, passa a usar `celula` também
    designer.selectSection('content')
    designer.insertKind('text')
    designer.setRef(designer.selectedUid.value!, ['styleRef'], 'celula')

    designer.addDetail(table)
    expect(template.value.styles!.celula!.border).toEqual({ widthMm: 0.2, color: '#cccccc', sides: 'b' })
    expect(template.value.styles!['celula-sem-traco']!.border).toBeUndefined()
    const cols = (template.value.sections.content!.components[0] as { table: { columns: { styleRef: string }[] } }).table.columns
    expect(cols.every((c) => c.styleRef.includes('celula-sem-traco'))).toBe(true)
    expect((template.value.sections.content!.components[1] as { styleRef: string }).styleRef).toBe('celula')
  })

  it('campo solto direto na faixa também move o traço', () => {
    const { template, designer, field } = setup({ itens: [{ nome: 'a', obs: ['x'] }] })
    designer.insertField(field('itens'))
    const table = designer.selectedUid.value!
    designer.insertField(field('itens[].obs'), { parent: table, slot: 'detail', index: 0 })
    const t = (template.value.sections.content!.components[0] as { table: { detail: { styleRef?: string } } }).table
    expect(t.detail.styleRef).toBe('separador-detalhe')
  })
})

describe('aparência das linhas da tabela', () => {
  it('o estilo da linha compõe por cima do da coluna, sem tocar nas colunas', () => {
    const { template, designer, field } = setup()
    designer.insertField(field('itens'))
    const table = designer.selectedUid.value!
    designer.editAppearance(table, ['table', 'row', 'styleRef'], null, ['padding', 'topMm'], 3)
    designer.editAppearance(table, ['table', 'row', 'styleRef'], 'linha-tabela', ['minHeightMm'], 9)

    const t = (template.value.sections.content!.components[0] as { table: { row: { styleRef: string }; columns: { styleRef: string }[] } }).table
    expect(t.row.styleRef).toBe('linha-tabela')
    expect(template.value.styles!['linha-tabela']).toEqual({ padding: { topMm: 3 }, minHeightMm: 9 })
    expect(t.columns.every((c) => c.styleRef.startsWith('celula'))).toBe(true)
    // a forma curta continua: sem `cells`, as células saem das colunas
    expect((t.row as { cells?: unknown }).cells).toBeUndefined()
  })
})

describe('marcador do texto', () => {
  it('bullet vira prefixo e sai do jeito que entrou', () => {
    const { template, designer, field } = setup({ nome: 'x' })
    designer.insertField(field('nome'))
    const uid = designer.selectedUid.value!
    designer.setProp(uid, ['text', 'prefix'], '• ', false)
    expect(template.value.sections.content!.components[0]).toMatchObject({ bind: 'nome', text: { prefix: '• ' } })
    designer.setProp(uid, ['text', 'prefix'], undefined, false)
    expect((template.value.sections.content!.components[0] as { text: { prefix?: string } }).text.prefix).toBeUndefined()
  })

  it('numerado usa a posição do item da coleção', () => {
    const { template, designer, field } = setup({ obs: ['uma', 'outra'] })
    designer.insertField(field('obs'))
    const texto = designer.doc.value.root.slots.content![0]!.slots.components![0]!
    designer.setProps(texto.uid, [
      [['text', 'parts'], [{ bind: '@row.number' }, { value: '. ' }, { bind: '@item' }]],
      [['bind'], undefined],
    ])
    const repeat = template.value.sections.content!.components[0] as { repeat: { components: { text: { parts: unknown[] } }[] } }
    expect(repeat.repeat.components[0]!.text.parts).toEqual([{ bind: '@row.number' }, { value: '. ' }, { bind: '@item' }])
  })
})

describe('recuo da quebra', () => {
  it('vai para uma variação quando o estilo é compartilhado', () => {
    const { template, designer, field } = setup({ a: 'x', b: 'y' })
    designer.insertField(field('a'))
    designer.insertField(field('b'))
    const uid = designer.selectedUid.value!
    designer.editAppearance(uid, ['styleRef'], 'texto', ['hangingIndentMm'], 3, { variant: true })
    expect(template.value.styles!['texto-variacao']).toEqual({ hangingIndentMm: 3 })
    expect(template.value.styles!.texto).toEqual({ fontSizePt: 9 })
    expect(template.value.sections.content!.components.map((c) => c.styleRef)).toEqual(['texto', 'texto texto-variacao'])
  })
})

describe('decoração do texto', () => {
  it('sublinhado e tachado entram e saem do estilo', () => {
    const { template, designer, field } = setup({ a: 'x' })
    designer.insertField(field('a'))
    const uid = designer.selectedUid.value!
    designer.editAppearance(uid, ['styleRef'], 'texto', ['textDecoration'], 'underline')
    expect(template.value.styles!.texto).toEqual({ fontSizePt: 9, textDecoration: 'underline' })
    designer.editAppearance(uid, ['styleRef'], 'texto', ['textDecoration'], 'lineThrough')
    expect(template.value.styles!.texto!.textDecoration).toBe('lineThrough')
    designer.editAppearance(uid, ['styleRef'], 'texto', ['textDecoration'], undefined)
    expect(template.value.styles!.texto!.textDecoration).toBeUndefined()
  })

  it('a composição respeita o estilo mais próximo', () => {
    const { designer } = setup()
    const doc = designer.doc.value
    expect(effectiveStyle(doc, ['texto']).textDecoration).toBeUndefined()
  })
})
