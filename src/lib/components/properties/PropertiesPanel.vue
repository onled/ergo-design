<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import type { JsonObject, JsonValue } from '../../document/document'
import { createNode, describeNode, getProp } from '../../document/ops'
import { getStyle, refTokens } from '../../document/styles'
import { useDesigner } from '../../designer/useDesigner'
import AppearanceSection from '../appearance/AppearanceSection.vue'
import FormatEditor from './FormatEditor.vue'
import NumberInput from './NumberInput.vue'
import TextContent from './TextContent.vue'
import WidthField from './WidthField.vue'

const designer = useDesigner()

const found = computed(() => designer.selected.value)
const node = computed(() => found.value?.node ?? designer.doc.value.root)
const title = computed(() => describeNode(node.value).title)


function str(path: string[]): string {
  const v = getProp(node.value, path)
  return typeof v === 'string' ? v : ''
}
function num(path: string[]): number | undefined {
  const v = getProp(node.value, path)
  return typeof v === 'number' ? v : undefined
}
function set(path: string[], value: JsonValue | undefined, coalesce = true) {
  designer.setProp(node.value.uid, path, value, coalesce)
}
function setMany(changes: [string, number | undefined][], prefix: string[] = []) {
  designer.setProps(node.value.uid, changes.map(([k, v]) => [[...prefix, k], v]))
}
function formatOf(path: string[]): JsonObject | undefined {
  const v = getProp(node.value, path)
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : undefined
}
function inputValue(event: Event) {
  return (event.target as HTMLInputElement).value
}
function orUndefined(v: string) {
  return v === '' ? undefined : v
}

/* Página */
const PAGE_PRESETS = [
  { label: 'A4 retrato', w: 210, h: 297 },
  { label: 'A4 paisagem', w: 297, h: 210 },
  { label: 'Carta', w: 215.9, h: 279.4 },
  { label: 'Ofício', w: 215.9, h: 355.6 },
]
const preset = computed(() => {
  const w = num(['page', 'widthMm'])
  const h = num(['page', 'heightMm'])
  return PAGE_PRESETS.find((p) => p.w === w && p.h === h)?.label ?? ''
})
function applyPreset(event: Event) {
  const p = PAGE_PRESETS.find((x) => x.label === inputValue(event))
  if (p) designer.setProps(node.value.uid, [[['page', 'widthMm'], p.w], [['page', 'heightMm'], p.h]])
}
function setPage(path: string[], v: number | undefined) {
  if (v !== undefined) set(['page', ...path], v, false)
}

/* Tabela */
const explicitTable = computed(() => {
  const cells = (k: string) => getProp(node.value, ['table', k, 'cells'])
  return Array.isArray(cells('header')) || Array.isArray(cells('row'))
})
const hasHeader = computed(() => getProp(node.value, ['table', 'header']) !== undefined)
function toggleHeader(on: boolean) {
  if (on) set(['table', 'header'], {}, false)
  else designer.setProps(node.value.uid, [[['table', 'header'], undefined], [['table', 'repeatHeader'], undefined]])
}
function addTableColumn() {
  const table = node.value
  designer.insert(createNode('tableColumn'), { parent: table.uid, slot: 'columns', index: table.slots.columns?.length ?? 0 })
}
function addRowColumn() {
  const row = node.value
  designer.insert(createNode('rowColumn'), { parent: row.uid, slot: 'columns', index: row.slots.columns?.length ?? 0 })
}

/* Faixa de detalhe: uma banda sob cada linha, no escopo do item da tabela. */
const hasDetail = computed(() => node.value.slots.detail !== undefined)

/** Com repetição dentro, a faixa já se resolve sozinha: lista vazia não imprime nada. */
const detailRepeats = computed(() => (node.value.slots.detail ?? []).some((c) => c.kind === 'repeat'))

/** Campo ligado dentro da faixa, sem o índice: é o que decide se ela aparece. */
const detailField = computed(() => {
  for (const child of node.value.slots.detail ?? []) {
    const bind = getProp(child, ['bind'])
    if (typeof bind === 'string' && bind !== '') return bind.replace(/\[\d+\]$/, '')
  }
  return undefined
})
/** Colunas com borda: o traço que hoje separa as linhas. */
const columnsHaveBorder = computed(() =>
  (node.value.slots.columns ?? []).some((c) =>
    refTokens(getProp(c, ['styleRef'])).some((t) => Number((getStyle(designer.doc.value, t)?.border as { widthMm?: number })?.widthMm ?? 0) > 0),
  ),
)
const bandHasStyle = computed(() => refTokens(getProp(node.value, ['table', 'detail', 'styleRef'])).length > 0)

const detailWhen = computed(() => {
  const when = getProp(node.value, ['table', 'detail', 'when'])
  return typeof when === 'object' && when !== null && !Array.isArray(when) ? (when.path as string) : undefined
})

const scopeLabel = computed(() => {
  if (!found.value) return ''
  const scope = designer.scopeOf(node.value.uid)
  return scope ? scope.replace(/\[\]$/, '').replace(/\[\]/g, '[ ]') : ''
})

/*
 * Trocar de componente volta o painel ao topo. Sem isso a rolagem do anterior
 * fica, e o primeiro campo do novo — que é o mais provável de se querer — passa
 * despercebido acima da dobra, com o cabeçalho fixo disfarçando.
 */
const body = shallowRef<HTMLElement>()
watch(
  () => designer.selectedUid.value,
  () => body.value?.scrollTo({ top: 0 }),
)

const isComponent = computed(() => !['template', 'rowColumn', 'tableColumn', 'opaque'].includes(node.value.kind))
const opaqueJson = computed(() => JSON.stringify(node.value.kind === 'opaque' ? node.value.props.value : node.value.props, null, 2))
</script>

<template>
  <aside class="ergo-properties e-col e-shrink-0 e-bg-surface e-border-l" aria-label="Propriedades">
    <div class="ergo-properties__head e-row e-items-center e-gap-1 e-px-4 e-border-b">
      <span class="e-eyebrow e-truncate">{{ found ? title : 'Página' }}</span>
      <template v-if="found">
        <button type="button" class="ergo-btn ergo-btn--ghost ergo-btn--sm e-ml-auto" title="Duplicar (Ctrl+D)" @click="designer.duplicate(node.uid)">Duplicar</button>
        <button type="button" class="ergo-btn ergo-btn--ghost ergo-btn--sm" title="Apagar (Delete)" @click="designer.remove(node.uid)">Apagar</button>
      </template>
    </div>

    <div ref="body" class="e-grow e-scroll-y e-p-4 e-stack-4">
      <p v-if="scopeLabel" class="ergo-properties__scope e-text-caption">
        Campos relativos a cada item de <span class="e-mono">{{ scopeLabel }}</span>
      </p>

      <!-- Página -->
      <template v-if="node.kind === 'template'">
        <label class="ergo-field">
          <span class="ergo-field__label">Tamanho</span>
          <select class="ergo-input" :value="preset" @change="applyPreset">
            <option value="" disabled>Personalizado</option>
            <option v-for="p in PAGE_PRESETS" :key="p.label" :value="p.label">{{ p.label }}</option>
          </select>
        </label>
        <div class="ergo-properties__grid">
          <NumberInput label="Largura" unit="mm" :min="1" :value="num(['page', 'widthMm'])" @commit="(v) => setPage(['widthMm'], v)" />
          <NumberInput label="Altura" unit="mm" :min="1" :value="num(['page', 'heightMm'])" @commit="(v) => setPage(['heightMm'], v)" />
        </div>
        <div class="ergo-field">
          <span class="ergo-section-title">Margens (mm)</span>
          <div class="ergo-properties__grid">
            <NumberInput label="Topo" :min="0" :value="num(['page', 'margin', 'topMm'])" @commit="(v) => setPage(['margin', 'topMm'], v ?? 0)" />
            <NumberInput label="Base" :min="0" :value="num(['page', 'margin', 'bottomMm'])" @commit="(v) => setPage(['margin', 'bottomMm'], v ?? 0)" />
            <NumberInput label="Esquerda" :min="0" :value="num(['page', 'margin', 'leftMm'])" @commit="(v) => setPage(['margin', 'leftMm'], v ?? 0)" />
            <NumberInput label="Direita" :min="0" :value="num(['page', 'margin', 'rightMm'])" @commit="(v) => setPage(['margin', 'rightMm'], v ?? 0)" />
          </div>
        </div>
        <p class="e-text-caption e-text-muted">Selecione um componente na estrutura para editá-lo.</p>
      </template>

      <!-- Texto -->
      <template v-else-if="node.kind === 'text'">
        <TextContent :node="node" />
        <FormatEditor v-if="typeof node.props.bind === 'string'" :format="formatOf(['format'])" @commit="(v) => set(['format'], v, false)" />
        <AppearanceSection :node="node" :ref-path="['styleRef']" :groups="['text', 'box', 'margin']" />
      </template>

      <!-- Tabela -->
      <template v-else-if="node.kind === 'table'">
        <p v-if="explicitTable" class="ergo-properties__note e-text-caption">
          Tabela com células explícitas: as colunas abrem como estão e o JSON sai intacto. A conversão para a forma curta chega na F4.
        </p>
        <label class="ergo-field">
          <span class="ergo-field__label">Coleção</span>
          <input class="ergo-input ergo-input--mono" :value="str(['table', 'dataPath'])" placeholder="clique numa lista dos dados" @input="set(['table', 'dataPath'], inputValue($event))" @blur="designer.seal()" />
        </label>
        <label class="ergo-check">
          <input type="checkbox" :checked="hasHeader" :disabled="explicitTable" @change="toggleHeader(($event.target as HTMLInputElement).checked)" />
          Cabeçalho com os títulos
        </label>
        <label class="ergo-check">
          <input type="checkbox" :checked="getProp(node, ['table', 'repeatHeader']) === true" :disabled="!hasHeader" @change="set(['table', 'repeatHeader'], ($event.target as HTMLInputElement).checked || undefined, false)" />
          Repetir o cabeçalho em cada página
        </label>
        <label class="ergo-field">
          <span class="ergo-field__label">Mensagem quando vazia</span>
          <input class="ergo-input" :value="str(['table', 'emptyMessage'])" @input="set(['table', 'emptyMessage'], orUndefined(inputValue($event)))" @blur="designer.seal()" />
        </label>
        <div class="ergo-field">
          <span class="ergo-field__label">Colunas: {{ node.slots.columns?.length ?? 0 }}</span>
          <button type="button" class="ergo-btn" :disabled="explicitTable" @click="addTableColumn">+ Coluna</button>
          <span class="ergo-field__hint">Com a tabela selecionada, clicar num campo do item acrescenta a coluna já ligada.</span>
        </div>
        <div class="ergo-field">
          <span class="ergo-field__label">Faixa sob cada linha</span>
          <template v-if="hasDetail">
            <span class="ergo-field__hint">
              Selecione o que está em <strong>Detalhe de cada linha</strong>, na estrutura, e ligue ao campo — a observação da linha, por exemplo.
            </span>
            <template v-if="detailRepeats">
              <span class="ergo-field__hint">A repetição já não imprime nada quando a lista da linha está vazia.</span>
            </template>
            <template v-else>
              <label class="ergo-check">
                <input
                  type="checkbox"
                  :checked="detailWhen !== undefined"
                  :disabled="!detailField"
                  @change="designer.setDetailWhen(node.uid, ($event.target as HTMLInputElement).checked ? detailField : undefined)"
                />
                Esconder quando <span class="e-mono">{{ detailField ?? 'o campo' }}</span> estiver vazio
              </label>
              <span v-if="!detailField" class="ergo-field__hint">Ligue a faixa a um campo para poder escondê-la nas linhas sem conteúdo.</span>
            </template>
            <button
              v-if="columnsHaveBorder && !bandHasStyle"
              type="button"
              class="ergo-btn"
              @click="designer.moveSeparatorToDetail(node.uid)"
            >
              Traço depois do detalhe
            </button>
            <span v-if="columnsHaveBorder && !bandHasStyle" class="ergo-field__hint">
              Hoje o traço das linhas cai entre a linha e o detalhe dela, e o detalhe parece pertencer à linha seguinte.
              Isto passa o traço para o fim da faixa, fechando o grupo.
            </span>
            <button type="button" class="ergo-btn" @click="designer.removeDetail(node.uid)">Tirar a faixa</button>
          </template>
          <template v-else>
            <button type="button" class="ergo-btn" @click="designer.addDetail(node.uid)">+ Faixa de detalhe</button>
            <span class="ergo-field__hint">Uma faixa sob cada linha, na largura toda, com os campos do item.</span>
          </template>
        </div>
        <AppearanceSection
          v-if="!explicitTable"
          title="Aparência das linhas"
          :node="node"
          :ref-path="['table', 'row', 'styleRef']"
          :groups="['text', 'box', 'cell']"
        />
        <span v-if="!explicitTable" class="ergo-field__hint">
          Vale para as células de todas as linhas, por cima do estilo de cada coluna: é aqui que se define o
          espaço interno e a altura das linhas.
        </span>
        <AppearanceSection
          v-if="hasDetail"
          title="Aparência da faixa"
          :node="node"
          :ref-path="['table', 'detail', 'styleRef']"
          :groups="['box']"
        />
        <AppearanceSection
          v-if="hasHeader && !explicitTable"
          title="Aparência do cabeçalho"
          :node="node"
          :ref-path="['table', 'header', 'styleRef']"
          :groups="['text', 'box', 'cell']"
        />
        <AppearanceSection title="Margem da tabela" :node="node" :ref-path="['styleRef']" :groups="['margin']" />
      </template>

      <!-- Coluna de tabela -->
      <template v-else-if="node.kind === 'tableColumn'">
        <label class="ergo-field">
          <span class="ergo-field__label">Título</span>
          <input class="ergo-input" :value="str(['title'])" @input="set(['title'], orUndefined(inputValue($event)))" @blur="designer.seal()" />
        </label>
        <label class="ergo-field">
          <span class="ergo-field__label">Campo</span>
          <input class="ergo-input ergo-input--mono" :value="str(['key'])" placeholder="clique num campo dos dados" @input="set(['key'], inputValue($event))" @blur="designer.seal()" />
        </label>
        <WidthField :weight="num(['weight'])" :width-mm="num(['widthMm'])" @commit="setMany" />
        <FormatEditor :format="formatOf(['format'])" @commit="(v) => set(['format'], v, false)" />
        <AppearanceSection title="Aparência da coluna" :node="node" :ref-path="['styleRef']" :groups="['text', 'box', 'cell']" />
        <span class="ergo-field__hint">Vale para as células e, por baixo do estilo do cabeçalho, para o título.</span>
      </template>

      <!-- Linha de colunas -->
      <template v-else-if="node.kind === 'row'">
        <NumberInput label="Espaço entre colunas" unit="mm" :min="0" :value="num(['row', 'gapMm'])" placeholder="0" @commit="(v) => set(['row', 'gapMm'], v || undefined, false)" />
        <div class="ergo-field">
          <span class="ergo-field__label">Colunas: {{ node.slots.columns?.length ?? 0 }}</span>
          <button type="button" class="ergo-btn" @click="addRowColumn">+ Coluna</button>
        </div>
        <AppearanceSection title="Margem" :node="node" :ref-path="['styleRef']" :groups="['margin']" />
      </template>

      <!-- Coluna de linha -->
      <template v-else-if="node.kind === 'rowColumn'">
        <WidthField :weight="num(['weight'])" :width-mm="num(['widthMm'])" @commit="setMany" />
        <AppearanceSection title="Aparência da célula" :node="node" :ref-path="['styleRef']" :groups="['box', 'cell']" />
        <span class="ergo-field__hint">Fundo e borda cobrem a altura da linha inteira.</span>
      </template>

      <!-- Caixa -->
      <template v-else-if="node.kind === 'box'">
        <NumberInput label="Espaço interno" unit="mm" :min="0" :value="num(['box', 'paddingMm'])" placeholder="0" @commit="(v) => set(['box', 'paddingMm'], v || undefined, false)" />
        <AppearanceSection :node="node" :ref-path="['styleRef']" :groups="['box', 'margin']" />
      </template>

      <!-- Espaço -->
      <template v-else-if="node.kind === 'spacer'">
        <NumberInput label="Altura" unit="mm" :min="0" :value="num(['spacer', 'heightMm'])" @commit="(v) => set(['spacer', 'heightMm'], v ?? 0, false)" />
        <span class="ergo-field__hint">Para espaço entre blocos, prefira a margem no estilo.</span>
      </template>

      <!-- Linha horizontal -->
      <template v-else-if="node.kind === 'line'">
        <NumberInput label="Espessura" unit="mm" :min="0" :step="0.1" :value="num(['line', 'thicknessMm'])" @commit="(v) => set(['line', 'thicknessMm'], v ?? 0.2, false)" />
        <NumberInput label="Comprimento" unit="mm" :min="0" :value="num(['line', 'widthMm'])" placeholder="largura toda" @commit="(v) => set(['line', 'widthMm'], v || undefined, false)" />
        <label class="ergo-field">
          <span class="ergo-field__label">Cor</span>
          <div class="e-row e-gap-2 e-items-center">
            <input type="color" class="ergo-properties__color" :value="/^#[0-9a-f]{6}$/i.test(str(['line', 'color'])) ? str(['line', 'color']) : '#000000'" @change="set(['line', 'color'], inputValue($event), false)" />
            <input class="ergo-input ergo-input--mono" :value="str(['line', 'color'])" placeholder="#000000" @change="set(['line', 'color'], orUndefined(inputValue($event)), false)" />
          </div>
        </label>
        <AppearanceSection title="Margem" :node="node" :ref-path="['styleRef']" :groups="['margin']" />
      </template>

      <!-- Repetição -->
      <template v-else-if="node.kind === 'repeat'">
        <label class="ergo-field">
          <span class="ergo-field__label">Coleção</span>
          <input class="ergo-input ergo-input--mono" :value="str(['repeat', 'dataPath'])" placeholder="clique numa lista dos dados" @input="set(['repeat', 'dataPath'], inputValue($event))" @blur="designer.seal()" />
        </label>
        <NumberInput label="Espaço entre itens" unit="mm" :min="0" placeholder="0" :value="num(['repeat', 'separatorMm'])" @commit="(v) => set(['repeat', 'separatorMm'], v || undefined, false)" />
        <label class="ergo-field">
          <span class="ergo-field__label">Mensagem quando vazia</span>
          <input class="ergo-input" :value="str(['repeat', 'emptyMessage'])" @input="set(['repeat', 'emptyMessage'], orUndefined(inputValue($event)))" @blur="designer.seal()" />
        </label>
        <span class="ergo-field__hint">
          Os componentes de dentro repetem uma vez por item. Numa lista de textos, o bind do item é
          <span class="e-mono">@item</span>.
        </span>
        <AppearanceSection title="Margem" :node="node" :ref-path="['styleRef']" :groups="['margin']" />
      </template>

      <!-- Ainda não editável -->
      <template v-else>
        <p class="ergo-properties__note e-text-caption">
          {{ node.kind === 'opaque' ? 'O editor não reconhece este trecho.' : 'Este tipo ainda não tem formulário (chega na F4).' }}
          Ele pode ser movido, duplicado ou apagado, e o JSON sai intacto.
        </p>
        <pre class="ergo-properties__json e-mono e-text-caption">{{ opaqueJson }}</pre>
      </template>

      <!-- Comum aos componentes -->
      <template v-if="isComponent">
        <label class="ergo-field">
          <span class="ergo-field__label">Identificador</span>
          <input class="ergo-input" :value="str(['id'])" placeholder="opcional, só para quem lê o JSON" @input="set(['id'], orUndefined(inputValue($event)))" @blur="designer.seal()" />
        </label>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.ergo-properties {
  width: var(--ergo-panel-width);
}

.ergo-properties__head {
  height: 44px;
  flex-shrink: 0;
}

.ergo-properties__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ergo-space-2);
}

.ergo-properties__scope {
  padding: var(--ergo-space-1) var(--ergo-space-2);
  color: var(--ergo-color-accent-text);
  background: var(--ergo-color-accent-soft);
  border-radius: var(--ergo-radius-sm);
}

.ergo-properties__note {
  padding: var(--ergo-space-2);
  color: var(--ergo-color-warning);
  background: var(--ergo-color-warning-soft);
  border-radius: var(--ergo-radius-sm);
}

.ergo-properties__json {
  max-height: 320px;
  overflow: auto;
  padding: var(--ergo-space-2);
  white-space: pre;
  background: var(--ergo-color-surface-sunken);
  border-radius: var(--ergo-radius-sm);
}

.ergo-properties__color {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--ergo-color-border);
  border-radius: var(--ergo-radius-sm);
  background: none;
}
</style>
