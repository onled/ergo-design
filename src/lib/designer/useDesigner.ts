/*
 * Estado de uma instância do editor: documento, seleção, histórico e dados.
 * Criado por `ErgoDesigner` e distribuído por provide/inject — duas instâncias
 * na mesma página não se enxergam, e o host não herda store nenhuma.
 *
 * O documento é imutável: toda edição produz um novo, que entra no histórico e
 * é serializado para o v-model. O template que chega de fora (abrir arquivo,
 * host trocando o modelo) reabre o documento e zera o histórico.
 */

import { computed, inject, provide, shallowRef, toRaw, watch, type InjectionKey, type Ref } from 'vue'
import type { SectionName, Template } from '../spec/template'
import { fromTemplate, serialize, slotsOf, type EditorDocument, type EditorNode, type JsonObject, type JsonValue, type SlotName } from '../document/document'
import { createHistory } from '../document/history'
import * as ops from '../document/ops'
import { bindFor, childScopeOf, dataTree, isBindableKey, isValueList, scopeOf, systemFields, titleFromKey, type DataField } from '../document/scope'
import * as st from '../document/styles'
import { BLOCKS, type BlockSize } from './blocks'

const KEY: InjectionKey<Designer> = Symbol('ergo-designer')

export type Designer = ReturnType<typeof createDesigner>

export interface InsertAt {
  parent: string
  slot: SlotName
  index: number
}

export interface FieldAction {
  label: string
  run: () => void
  /** Alt+clique: a alternativa, quando o clique não liga ao selecionado. */
  alt?: { label: string; run: () => void }
}

/** Colunas de tabela sugeridas a partir dos campos simples do item. */
const MAX_SUGGESTED_COLUMNS = 6

export function createDesigner(template: Ref<Template>, data: Ref<unknown>) {
  // O host guarda o template num ref, e o Vue devolve um proxy reativo: nem
  // structuredClone o aceita, nem ele é === ao objeto que o editor emitiu.
  const doc = shallowRef<EditorDocument>(fromTemplate(toRaw(template.value)))
  const history = createHistory(doc.value)
  const version = shallowRef(0)
  const selectedUid = shallowRef<string | null>(null)
  /** Seção em que entra o que for inserido sem nada selecionado. */
  const activeSection = shallowRef<SectionName>('content')
  /** Arrasto em curso na árvore: um nó ou um campo dos dados. */
  const dragging = shallowRef<{ uid: string } | { field: DataField } | null>(null)
  /** Estilo cujos usos estão destacados na árvore. */
  const highlightedStyle = shallowRef<string | null>(null)

  const serialized = computed(() => serialize(doc.value))
  let emitted: Template | undefined = toRaw(template.value)

  watch(template, (value) => {
    const next = toRaw(value)
    if (next === emitted) return
    doc.value = fromTemplate(next)
    history.reset(doc.value)
    selectedUid.value = null
    highlightedStyle.value = null
    emitted = next
    version.value++
  })

  function commit(next: EditorDocument, coalesceKey?: string) {
    history.commit(next, coalesceKey)
    apply(next)
  }

  function apply(next: EditorDocument) {
    doc.value = next
    emitted = serialized.value.template
    template.value = emitted
    version.value++
    if (selectedUid.value && !ops.findNode(next, selectedUid.value)) selectedUid.value = null
  }

  const selected = computed(() => (selectedUid.value ? ops.findNode(doc.value, selectedUid.value) : undefined))
  const styleUsage = computed(() => st.styleUsage(doc.value))

  /** Campos dos dados, mais as variáveis do sistema num grupo à parte. */
  const fields = computed(() => dataTree(data.value))
  const systemFieldList = computed(() => {
    const node = selected.value?.node
    return systemFields(node ? scopeOf(doc.value, node.uid) !== '' || childScopeOf(doc.value, node.uid) !== '' : false)
  })

  /* Inserção */

  /**
   * Onde um componente novo entra: dentro do container selecionado; senão logo
   * depois do selecionado, subindo até achar uma lista que o aceite (coluna de
   * tabela selecionada → depois da tabela). Sem seleção, no fim da seção ativa.
   */
  function insertionPoint(kind: EditorNode['kind']): InsertAt {
    const child = { kind } as EditorNode
    const found = selected.value
    if (found && found.node.kind !== 'template') {
      for (const slot of Object.keys(slotsOf(found.node.kind)) as SlotName[]) {
        if (ops.accepts(found.node, slot, child)) {
          return { parent: found.node.uid, slot, index: found.node.slots[slot]?.length ?? 0 }
        }
      }
      let at: ops.Located | undefined = found
      while (at?.parent && at.slot) {
        if (ops.accepts(at.parent, at.slot, child)) return { parent: at.parent.uid, slot: at.slot, index: at.index + 1 }
        at = ops.findNode(doc.value, at.parent.uid)
      }
    }
    return endOfSection(activeSection.value)
  }

  function endOfSection(section: SectionName): InsertAt {
    return { parent: doc.value.root.uid, slot: section, index: doc.value.root.slots[section]?.length ?? 0 }
  }

  function commitInsert(node: EditorNode, at = insertionPoint(node.kind)) {
    let next = doc.value
    if (at.parent === next.root.uid && !next.root.slots[at.slot]) next = ops.addSection(next, at.slot as SectionName)
    const firstInBand = at.slot === 'detail' && (ops.findNode(next, at.parent)?.node.slots.detail?.length ?? 0) === 0
    next = ops.insertNode(next, at.parent, at.slot, at.index, node)
    // Faixa de detalhe recém-criada: o traço da linha vai para o fim dela.
    commit(firstInBand ? withGroupSeparator(next, at.parent) : next)
    selectedUid.value = node.uid
  }

  /** Componente novo do menu Inserir, com o estilo padrão do seu papel. */
  function insertKind(kind: ops.InsertableKind) {
    const d = doc.value
    switch (kind) {
      case 'text':
        return commitInsert(ops.createNode('text', { styleRef: st.defaultStyleFor(d, 'text') }))
      case 'table':
        return commitInsert(
          ops.createNode('table', { headerStyleRef: st.defaultStyleFor(d, 'tableHeader'), styleRef: st.defaultStyleFor(d, 'cell') }),
        )
      default:
        return commitInsert(ops.createNode(kind))
    }
  }

  function insertBlock(id: string, size?: BlockSize) {
    const block = BLOCKS.find((b) => b.id === id)
    if (!block) return
    const built = block.build(doc.value, size ?? block.size ?? { rows: 1, cols: 2 })
    const nodes = Array.isArray(built) ? built : [built]
    if (nodes.length === 0) return
    const at = block.section ? endOfSection(block.section) : insertionPoint(nodes[0]!.kind)
    let next = doc.value
    if (at.parent === next.root.uid && !next.root.slots[at.slot]) next = ops.addSection(next, at.slot as SectionName)
    nodes.forEach((node, i) => {
      next = ops.insertNode(next, at.parent, at.slot, at.index + i, node)
    })
    commit(next)
    selectedUid.value = nodes[0]!.uid
    if (block.section) activeSection.value = block.section
  }

  function suggestedFormat(field: DataField): JsonObject | undefined {
    if (field.hint === 'date') return { type: 'date' }
    if (field.hint === 'datetime') return { type: 'datetime' }
    return undefined
  }

  /** Colunas sugeridas para uma lista: os campos simples do item, na ordem. */
  function suggestedColumns(field: DataField) {
    const d = doc.value
    return field.children
      .filter((c) => c.kind !== 'list' && c.kind !== 'object')
      .slice(0, MAX_SUGGESTED_COLUMNS)
      .map((c) => ({
        key: c.key === '(item)' ? '' : c.key,
        title: titleFromKey(c.key),
        styleRef: st.defaultStyleFor(d, c.kind === 'number' ? 'numericCell' : 'cell'),
        format: suggestedFormat(c),
      }))
  }

  /** Coluna que ainda não foi ligada a nada: a que uma tabela nova traz. */
  function isPlaceholderColumn(column: EditorNode): boolean {
    return column.props.key === '' && column.props.cell === undefined
  }

  /**
   * Componente novo feito de um campo: tabela para lista de objetos, repetição
   * para lista de valores (que não tem coluna a nomear) e texto para valor.
   */
  function insertField(field: DataField, at?: InsertAt) {
    if (field.kind === 'object') return
    const kind = field.kind === 'list' ? (isValueList(field) ? 'repeat' : 'table') : 'text'
    const point = at ?? insertionPoint(kind)
    const scope = childScopeOf(doc.value, point.parent)
    const d = doc.value
    if (field.kind === 'list' && isValueList(field)) {
      commitInsert(
        ops.createNode('repeat', { dataPath: bindFor(field.path, scope), bind: '@item', styleRef: st.defaultStyleFor(d, 'text') }),
        point,
      )
      return
    }
    if (field.kind !== 'list') {
      commitInsert(
        ops.createNode('text', { bind: bindFor(field.path, scope), styleRef: st.defaultStyleFor(d, 'text'), format: suggestedFormat(field) }),
        point,
      )
      return
    }
    commitInsert(
      ops.createNode('table', {
        dataPath: bindFor(field.path, scope),
        columns: suggestedColumns(field),
        headerStyleRef: st.defaultStyleFor(d, 'tableHeader'),
      }),
      point,
    )
  }

  /**
   * O que clicar num campo dos dados faz, dado o que está selecionado.
   *
   * Montar é clicar campo após campo, e o que acabou de entrar fica selecionado:
   * por isso o clique só liga ao selecionado quando ele ainda espera um campo
   * (texto fixo, coluna sem campo, composto terminando em texto). Já ligado, o
   * clique insere outro ao lado, e `alt` — Alt+clique — troca o campo dele.
   */
  function fieldAction(field: DataField): FieldAction | null {
    const node = selected.value?.node
    const system = field.path.startsWith('@')
    const bindable = system || field.path.split(/\.|\[\]/).filter(Boolean).every(isBindableKey)
    if (!bindable) return null

    if (field.kind === 'list') {
      const insert = {
        label: isValueList(field) ? 'Inserir repetição com esta lista' : 'Inserir tabela com esta lista',
        run: () => insertField(field),
      }
      if (node && (node.kind === 'table' || node.kind === 'repeat')) {
        const scope = scopeOf(doc.value, node.uid)
        // Tabela recém-inserida tem uma coluna em branco, que o ergo recusa
        // (`columns[0].key is required`). Escolher a coleção também preenche as
        // colunas, como faz inserir a tabela pela lista.
        const placeholders = node.kind === 'table' && (node.slots.columns ?? []).every(isPlaceholderColumn)
        const use = {
          label:
            placeholders && node.kind === 'table'
              ? 'Usar como coleção e sugerir as colunas'
              : `Usar como coleção da ${node.kind === 'table' ? 'tabela' : 'repetição'}`,
          run: () => {
            let next = ops.setProp(doc.value, node.uid, [node.kind, 'dataPath'], bindFor(field.path, scope))
            if (placeholders) {
              const columns = suggestedColumns(field)
              if (columns.length) {
                for (const column of node.slots.columns ?? []) next = ops.removeNode(next, column.uid)
                columns.forEach((c, i) => {
                  const column = ops.createNode('tableColumn', { bind: c.key, title: c.title, styleRef: c.styleRef, format: c.format })
                  next = ops.insertNode(next, node.uid, 'columns', i, column)
                })
              }
            }
            commit(next)
          },
        }
        const empty = ops.getProp(node, [node.kind, 'dataPath']) === ''
        return empty ? use : { ...insert, alt: use }
      }
      return insert
    }
    if (field.kind === 'object') return null

    const format = suggestedFormat(field)
    const insertText = { label: 'Inserir texto com este campo', run: () => insertField(field) }

    if (node?.kind === 'tableColumn') {
      const scope = scopeOf(doc.value, node.uid)
      const bind = bindFor(field.path, scope)
      // Título gerado segue o campo; título que o autor escreveu fica.
      const title = node.props.title
      const oldKey = typeof node.props.key === 'string' ? node.props.key : ''
      const retitle = title === undefined || title === '' || title === 'Coluna' || title === titleFromKey(oldKey.split('.').pop() ?? '')
      const bindColumn = {
        label: 'Ligar à coluna',
        run: () => {
          let next = ops.setProp(doc.value, node.uid, ['key'], bind)
          if (retitle) next = ops.setProp(next, node.uid, ['title'], field.label ?? titleFromKey(field.key))
          if (format && node.props.format === undefined) next = ops.setProp(next, node.uid, ['format'], format)
          commit(next)
        },
      }
      if (oldKey === '') return bindColumn
      const found = selected.value!
      const inItem = scope !== '' && field.path.startsWith(`${scope}.`)
      if (inItem && found.parent) return { ...addColumn(found.parent, field, scope, found.index + 1), alt: bindColumn }
      return { ...insertText, alt: bindColumn }
    }
    if (node?.kind === 'table') {
      const scope = childScopeOf(doc.value, node.uid)
      if (scope && field.path.startsWith(`${scope}.`)) return addColumn(node, field, scope, node.slots.columns?.length ?? 0)
    }
    if (node?.kind === 'text') {
      const bind = bindFor(field.path, scopeOf(doc.value, node.uid))
      const parts = ops.getProp(node, ['text', 'parts'])
      if (Array.isArray(parts)) {
        const append = {
          label: 'Acrescentar ao texto composto',
          run: () => commit(ops.setProp(doc.value, node.uid, ['text', 'parts'], [...parts, format ? { bind, format } : { bind }])),
        }
        const last = parts[parts.length - 1] as JsonObject | undefined
        const waiting = !last || typeof last.bind !== 'string'
        return waiting ? append : { ...insertText, alt: append }
      }
      const bindText = {
        label: 'Ligar ao texto',
        run: () => {
          let next = ops.setProp(doc.value, node.uid, ['bind'], bind)
          next = ops.setProp(next, node.uid, ['text', 'value'], undefined)
          if (format && node.props.format === undefined) next = ops.setProp(next, node.uid, ['format'], format)
          commit(next)
        },
      }
      return typeof node.props.bind === 'string' && node.props.bind !== '' ? { ...insertText, alt: bindText } : bindText
    }
    return insertText
  }

  function addColumn(table: EditorNode, field: DataField, scope: string, index: number): FieldAction {
    return {
      label: 'Adicionar coluna à tabela',
      run: () => {
        const column = ops.createNode('tableColumn', {
          bind: bindFor(field.path, scope),
          title: titleFromKey(field.key),
          styleRef: st.defaultStyleFor(doc.value, field.kind === 'number' ? 'numericCell' : 'cell'),
          format: suggestedFormat(field),
        })
        commitInsert(column, { parent: table.uid, slot: 'columns', index })
      },
    }
  }

  /**
   * O traço que separa as linhas passa para o fim da faixa de detalhe. Uma
   * borda no estilo das colunas cai entre a linha e o detalhe dela, e o detalhe
   * parece pertencer à linha seguinte; na banda, o traço fecha o grupo. Se o
   * estilo das colunas for usado em outro lugar, a mudança sai numa cópia, para
   * não mexer no resto do impresso.
   */
  function withGroupSeparator(from: EditorDocument, uid: string): EditorDocument {
    const table = ops.findNode(from, uid)?.node
    if (!table || table.kind !== 'table') return from
    if (st.refTokens(ops.getProp(table, ['table', 'detail', 'styleRef'])).length > 0) return from
    const columns = table.slots.columns ?? []

    let source: { name: string; border: JsonObject } | undefined
    for (const column of columns) {
      for (const token of st.refTokens(ops.getProp(column, ['styleRef']))) {
        const border = st.getStyle(from, token)?.border
        if (border && typeof border === 'object' && !Array.isArray(border) && Number(border.widthMm ?? 0) > 0) {
          source ??= { name: token, border: structuredClone(border) }
        }
      }
    }
    if (!source) return from

    let next = from
    const mine = new Set(columns.map((c) => c.uid))
    const usage = st.styleUsage(from)
    const usedElsewhere = (usage.get(source.name) ?? []).some((u) => !mine.has(u.uid) || u.path.join('.') !== 'styleRef')
    if (usedElsewhere) {
      const copy = st.duplicateStyle(next, source.name, st.uniqueStyleName(next, `${source.name}-sem-traco`))
      next = st.setStyleProp(copy.doc, copy.name, ['border'], undefined)
      for (const column of columns) {
        if (st.refTokens(ops.getProp(column, ['styleRef'])).includes(source.name)) {
          next = st.replaceToken(next, column.uid, ['styleRef'], source.name, copy.name)
        }
      }
    } else {
      next = st.setStyleProp(next, source.name, ['border'], undefined)
    }

    // A banda fecha o grupo: mesma espessura e cor, só na base.
    const band = { border: { ...source.border, sides: 'b' } }
    const existing = st.styleNames(next).find((n) => JSON.stringify(st.getStyle(next, n)) === JSON.stringify(band))
    const name = existing ?? st.uniqueStyleName(next, 'separador-detalhe')
    if (!existing) next = st.createStyle(next, name, band)
    return ops.setProp(next, uid, ['table', 'detail', 'styleRef'], name)
  }

  /* Aparência e estilos */

  /** Nome-base de um estilo criado pela aparência, pelo papel de quem o recebe. */
  function styleBaseName(node: EditorNode, path: st.RefPath): string {
    if (node.kind === 'table') return path[1] === 'header' ? 'cabecalho' : path[1] === 'row' ? 'linha-tabela' : 'tabela'
    const byKind: Partial<Record<EditorNode['kind'], string>> = {
      text: 'texto',
      tableColumn: 'coluna',
      rowColumn: 'celula-linha',
      box: 'caixa',
      line: 'linha',
    }
    return byKind[node.kind] ?? 'estilo'
  }

  /**
   * Muda a aparência de um nó. Sem estilo, cria um — ou reaproveita um igual
   * que já exista. Com estilo, altera `target`, e a mudança vale para todos os
   * que usam aquele estilo.
   *
   * Com `variant`, a mudança não vai para o estilo compartilhado: nasce um
   * estilo pequeno com só aquela propriedade, composto **depois** do original.
   * O nó continua seguindo o original em tudo o mais — mudar o tamanho de
   * `texto` ainda alcança quem tem `texto observacao`, porque só o que a
   * variação declara é sobrescrito. Devolve o estilo que recebeu a mudança.
   */
  function editAppearance(
    uid: string,
    refPath: st.RefPath,
    target: string | null,
    stylePath: readonly string[],
    value: JsonValue | undefined,
    options: { variant?: boolean } = {},
  ): string | undefined {
    let next = doc.value
    if (target && !options.variant) {
      commit(st.setStyleProp(next, target, stylePath, value))
      return target
    }
    if (value === undefined) return target ?? undefined

    const node = ops.findNode(next, uid)!.node
    const base = target ? `${target}-variacao` : styleBaseName(node, refPath)
    const name = st.uniqueStyleName(next, base)
    next = st.createStyle(next, name)
    next = st.setStyleProp(next, name, stylePath, value)
    // Uma variação igual a um estilo que já existe é aquele estilo.
    const twin = st.findEquivalentStyle(next, name)
    const chosen = twin ?? name
    if (twin) next = st.deleteStyle(next, name)
    next = st.replaceToken(next, uid, refPath, null, chosen)
    commit(next)
    return chosen
  }

  function setRef(uid: string, refPath: st.RefPath, value: string | undefined) {
    commit(ops.setProp(doc.value, uid, refPath, value))
  }

  return {
    doc,
    version,
    selectedUid,
    selected,
    activeSection,
    dragging,
    highlightedStyle,
    fields,
    systemFields: systemFieldList,
    styleUsage,
    paths: computed(() => serialized.value.paths),
    canUndo: computed(() => (version.value, history.canUndo)),
    canRedo: computed(() => (version.value, history.canRedo)),

    select(uid: string | null) {
      history.seal()
      selectedUid.value = uid
      const top = uid ? ops.ancestry(doc.value, uid)[1] : undefined
      const section = top && ops.findNode(doc.value, top.uid)?.slot
      if (section) activeSection.value = section as SectionName
    },
    selectSection(name: SectionName) {
      history.seal()
      selectedUid.value = null
      activeSection.value = name
    },

    undo() {
      const prev = history.undo()
      if (prev) apply(prev)
    },
    redo() {
      const next = history.redo()
      if (next) apply(next)
    },
    /** Fecha a coalescência da digitação: ao sair de um campo. */
    seal: () => history.seal(),

    insert: commitInsert,
    insertKind,
    insertBlock,
    insertField,
    insertionPoint,
    fieldAction,

    remove(uid: string) {
      const found = ops.findNode(doc.value, uid)
      commit(ops.removeNode(doc.value, uid))
      if (found?.parent && selectedUid.value === null) {
        const siblings = found.parent.slots[found.slot!]!
        selectedUid.value = siblings[found.index + 1]?.uid ?? siblings[found.index - 1]?.uid ?? found.parent.uid
      }
    },
    move(uid: string, parent: string, slot: SlotName, index: number) {
      commit(ops.moveNode(doc.value, uid, parent, slot, index))
    },
    duplicate(uid: string) {
      const out = ops.duplicateNode(doc.value, uid)
      commit(out.doc)
      selectedUid.value = out.uid
    },
    /** A digitação num mesmo campo vira uma entrada de desfazer. */
    setProp(uid: string, path: readonly string[], value: JsonValue | undefined, coalesce = true) {
      commit(ops.setProp(doc.value, uid, path, value), coalesce ? `${uid}:${path.join('.')}` : undefined)
    },
    /** Várias mudanças num nó, uma entrada de desfazer. */
    setProps(uid: string, changes: [readonly string[], JsonValue | undefined][]) {
      let next = doc.value
      for (const [path, value] of changes) next = ops.setProp(next, uid, path, value)
      commit(next)
    },
    moveSeparatorToDetail: (uid: string) => commit(withGroupSeparator(doc.value, uid)),

    /** Faixa sob cada linha da tabela, no escopo do item: a observação da linha. */
    addDetail(uid: string) {
      // Sem `celula`: aquele estilo traz a borda da tabela, e separar cada
      // detalhe com um traço é escolha do autor, não padrão.
      const text = ops.createNode('text', { title: 'Detalhe da linha', styleRef: st.defaultStyleFor(doc.value, 'text') })
      commit(withGroupSeparator(ops.addDetail(doc.value, uid, text), uid))
      selectedUid.value = text.uid
    },
    removeDetail(uid: string) {
      commit(ops.removeDetail(doc.value, uid))
      selectedUid.value = uid
    },
    /**
     * Esconde a faixa quando o campo dela está vazio. Sem isso, uma linha sem
     * observação falha o render: o caminho `observacoes[0]` não resolve.
     */
    setDetailWhen(uid: string, path: string | undefined) {
      commit(ops.setProp(doc.value, uid, ['table', 'detail', 'when'], path ? { path, op: 'notEmpty' } : undefined))
    },
    addSection(name: SectionName) {
      commit(ops.addSection(doc.value, name))
      activeSection.value = name
      selectedUid.value = null
    },
    removeSection(name: SectionName) {
      commit(ops.removeSection(doc.value, name))
      if (activeSection.value === name) activeSection.value = 'content'
    },
    scopeOf: (uid: string) => scopeOf(doc.value, uid),

    editAppearance,
    setRef,
    editStyle(name: string, path: readonly string[], value: JsonValue | undefined) {
      commit(st.setStyleProp(doc.value, name, path, value))
    },
    createStyle(base = 'estilo'): string {
      const name = st.uniqueStyleName(doc.value, base)
      commit(st.createStyle(doc.value, name, { fontSizePt: 9 }))
      return name
    },
    renameStyle(from: string, to: string) {
      commit(st.renameStyle(doc.value, from, to))
      if (highlightedStyle.value === from) highlightedStyle.value = to
    },
    duplicateStyle(name: string): string {
      const out = st.duplicateStyle(doc.value, name)
      commit(out.doc)
      return out.name
    },
    deleteStyle(name: string) {
      commit(st.deleteStyle(doc.value, name))
      if (highlightedStyle.value === name) highlightedStyle.value = null
    },
  }
}

export function provideDesigner(designer: Designer) {
  provide(KEY, designer)
}

export function useDesigner(): Designer {
  const designer = inject(KEY, null)
  if (!designer) throw new Error('[ergo-design] componente fora de um ErgoDesigner')
  return designer
}
