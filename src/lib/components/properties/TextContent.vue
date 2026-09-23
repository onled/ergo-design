<script setup lang="ts">
import { computed } from 'vue'
import type { EditorNode, JsonObject, JsonValue } from '../../document/document'
import { getProp } from '../../document/ops'
import { effectiveStyle, refTokens } from '../../document/styles'
import { useDesigner } from '../../designer/useDesigner'

/*
 * Conteúdo de um texto, em três formas que o ergo distingue: literal
 * (`text.value`), campo (`bind`, com prefixo e sufixo) e composto (`text.parts`,
 * que vence os outros dois). Trocar de forma converte o que já estava escrito.
 */
const props = defineProps<{ node: EditorNode }>()
const designer = useDesigner()

type Mode = 'value' | 'bind' | 'parts'

const parts = computed(() => {
  const p = getProp(props.node, ['text', 'parts'])
  return Array.isArray(p) ? (p as JsonObject[]) : null
})
const mode = computed<Mode>(() => (parts.value ? 'parts' : typeof props.node.props.bind === 'string' ? 'bind' : 'value'))
const str = (path: string[]) => {
  const v = getProp(props.node, path)
  return typeof v === 'string' ? v : ''
}

function setMode(next: Mode) {
  if (next === mode.value) return
  const uid = props.node.uid
  const value = str(['text', 'value'])
  const bind = str(['bind'])
  const changes: [string[], JsonValue | undefined][] = []
  if (next === 'parts') {
    const seed: JsonObject[] = []
    if (str(['text', 'prefix'])) seed.push({ value: str(['text', 'prefix']) })
    if (mode.value === 'bind' && bind) seed.push({ bind })
    else if (value) seed.push({ value })
    if (str(['text', 'suffix'])) seed.push({ value: str(['text', 'suffix']) })
    changes.push([['text', 'parts'], seed.length ? seed : [{ value: '' }]], [['text', 'value'], undefined], [['bind'], undefined])
    changes.push([['text', 'prefix'], undefined], [['text', 'suffix'], undefined])
  } else if (next === 'bind') {
    const firstBind = parts.value?.find((p) => typeof p.bind === 'string')?.bind
    changes.push([['bind'], typeof firstBind === 'string' ? firstBind : ''], [['text', 'value'], undefined], [['text', 'parts'], undefined])
  } else {
    const literal = parts.value ? parts.value.map((p) => (typeof p.value === 'string' ? p.value : '')).join('') : 'Texto'
    changes.push([['text', 'value'], literal || 'Texto'], [['bind'], undefined], [['text', 'parts'], undefined])
  }
  designer.setProps(uid, changes)
}

function setPart(index: number, part: JsonObject | null) {
  const list = [...(parts.value ?? [])]
  if (part) list[index] = part
  else list.splice(index, 1)
  designer.setProp(props.node.uid, ['text', 'parts'], list, part !== null)
}

function addPart(kind: 'value' | 'bind') {
  designer.setProp(props.node.uid, ['text', 'parts'], [...(parts.value ?? []), kind === 'value' ? { value: ' ' } : { bind: '' }], false)
}

function orUndefined(v: string) {
  return v === '' ? undefined : v
}

/*
 * Marcador: o traço ou ponto antes do texto. Vira `text.prefix`, que o ergo
 * concatena ao valor qualquer que seja a forma do conteúdo. Numerado é outra
 * coisa: precisa da posição do item, que só existe dentro de uma coleção, e por
 * isso vira uma parte ligada a `@row.number`.
 */
const BULLETS = [
  { value: '• ', label: '•  ponto' },
  { value: '– ', label: '–  traço' },
  { value: '▪ ', label: '▪  quadrado' },
  { value: '◦ ', label: '◦  círculo' },
]
const NUMBERED = '@numerado'

const inCollection = computed(() => designer.scopeOf(props.node.uid) !== '')
const numbered = computed(() => {
  const first = parts.value?.[0]
  return first?.bind === '@row.number'
})
const marker = computed(() => (numbered.value ? NUMBERED : str(['text', 'prefix'])))

/** Recuo em vigor para este texto, somando os estilos que ele compõe. */
const tokens = computed(() => refTokens(getProp(props.node, ['styleRef'])))
const indent = computed(() => effectiveStyle(designer.doc.value, tokens.value).hangingIndentMm ?? 0)
const hasMarker = computed(() => marker.value !== '')

/**
 * Recua a quebra sem estragar o estilo compartilhado: se ele é de mais alguém,
 * a mudança vai para uma variação deste texto.
 */
function indentWrapped() {
  const target = tokens.value[tokens.value.length - 1] ?? null
  const shared = target ? (designer.styleUsage.value.get(target)?.length ?? 0) > 1 : false
  designer.editAppearance(props.node.uid, ['styleRef'], target, ['hangingIndentMm'], numbered.value ? 5 : 3, {
    variant: shared,
  })
}

function setMarker(chosen: string) {
  const uid = props.node.uid
  if (chosen === NUMBERED) {
    const rest: JsonObject[] = parts.value
      ? parts.value.filter((p) => p.bind !== '@row.number' && p.value !== '. ')
      : mode.value === 'bind'
        ? [{ bind: str(['bind']) }]
        : [{ value: str(['text', 'value']) }]
    designer.setProps(uid, [
      [['text', 'parts'], [{ bind: '@row.number' }, { value: '. ' }, ...rest]],
      [['text', 'value'], undefined],
      [['bind'], undefined],
      [['text', 'prefix'], undefined],
    ])
    return
  }
  if (numbered.value) {
    // sai da numeração: volta a ser o que sobra, sem a posição
    const rest = (parts.value ?? []).filter((p) => p.bind !== '@row.number' && p.value !== '. ')
    const single = rest.length === 1 ? rest[0]! : undefined
    designer.setProps(uid, [
      [['text', 'parts'], single ? undefined : rest],
      ...(single?.bind ? ([[['bind'], single.bind]] as [string[], JsonValue][]) : []),
      ...(single && !single.bind ? ([[['text', 'value'], single.value ?? '']] as [string[], JsonValue][]) : []),
      [['text', 'prefix'], orUndefined(chosen)],
    ])
    return
  }
  designer.setProp(uid, ['text', 'prefix'], orUndefined(chosen), false)
}
</script>

<template>
  <div class="e-stack-3">
    <label class="ergo-field">
      <span class="ergo-field__label">Marcador</span>
      <select class="ergo-input" :value="marker" @change="setMarker(($event.target as HTMLSelectElement).value)">
        <option value="">Nenhum</option>
        <option v-for="b in BULLETS" :key="b.value" :value="b.value">{{ b.label }}</option>
        <option v-if="inCollection" :value="NUMBERED">1.  numerado</option>
      </select>
      <span v-if="numbered" class="ergo-field__hint">A posição vem de <span class="e-mono">@row.number</span>, dentro da coleção.</span>
      <template v-if="hasMarker && indent === 0">
        <button type="button" class="ergo-btn" @click="indentWrapped">Recuar a quebra</button>
        <span class="ergo-field__hint">Hoje um texto que quebra volta para baixo do marcador. Isto alinha as linhas seguintes sob o texto.</span>
      </template>
      <span v-else-if="hasMarker" class="ergo-field__hint">Quebra recuada em {{ indent }} mm — ajuste em Aparência.</span>
    </label>

    <div class="ergo-field">
      <span class="ergo-field__label">Conteúdo</span>
      <div class="ergo-segmented" role="group" aria-label="Forma do conteúdo">
        <button type="button" :aria-pressed="mode === 'value'" @click="setMode('value')">Texto fixo</button>
        <button type="button" :aria-pressed="mode === 'bind'" @click="setMode('bind')">Campo</button>
        <button type="button" :aria-pressed="mode === 'parts'" @click="setMode('parts')">Composto</button>
      </div>
    </div>

    <label v-if="mode === 'value'" class="ergo-field">
      <span class="ergo-field__label">Texto</span>
      <textarea class="ergo-input" :value="str(['text', 'value'])" @input="designer.setProp(node.uid, ['text', 'value'], ($event.target as HTMLTextAreaElement).value)" @blur="designer.seal()" />
    </label>

    <template v-else-if="mode === 'bind'">
      <label class="ergo-field">
        <span class="ergo-field__label">Campo</span>
        <input class="ergo-input ergo-input--mono" :value="str(['bind'])" placeholder="clique num campo dos dados" @input="designer.setProp(node.uid, ['bind'], ($event.target as HTMLInputElement).value)" @blur="designer.seal()" />
      </label>
      <div class="e-row e-gap-2">
        <label class="ergo-field e-grow">
          <span class="ergo-field__label">Antes</span>
          <input class="ergo-input" :value="str(['text', 'prefix'])" @input="designer.setProp(node.uid, ['text', 'prefix'], orUndefined(($event.target as HTMLInputElement).value))" @blur="designer.seal()" />
        </label>
        <label class="ergo-field e-grow">
          <span class="ergo-field__label">Depois</span>
          <input class="ergo-input" :value="str(['text', 'suffix'])" @input="designer.setProp(node.uid, ['text', 'suffix'], orUndefined(($event.target as HTMLInputElement).value))" @blur="designer.seal()" />
        </label>
      </div>
    </template>

    <div v-else class="ergo-field">
      <span class="ergo-field__label">Partes, na ordem</span>
      <ul class="e-stack-1">
        <li v-for="(part, i) in parts" :key="i" class="e-row e-items-center e-gap-1">
          <span class="ergo-part-kind e-text-caption e-text-muted">{{ typeof part.bind === 'string' ? 'campo' : 'texto' }}</span>
          <input
            v-if="typeof part.bind === 'string'"
            class="ergo-input ergo-input--mono"
            :value="part.bind"
            placeholder="caminho"
            @input="setPart(i, { ...part, bind: ($event.target as HTMLInputElement).value })"
            @blur="designer.seal()"
          />
          <input
            v-else
            class="ergo-input"
            :value="typeof part.value === 'string' ? part.value : ''"
            @input="setPart(i, { ...part, value: ($event.target as HTMLInputElement).value })"
            @blur="designer.seal()"
          />
          <button type="button" class="ergo-btn ergo-btn--ghost ergo-btn--sm ergo-btn--icon" aria-label="Tirar parte" @click="setPart(i, null)">×</button>
        </li>
      </ul>
      <div class="e-row e-gap-1">
        <button type="button" class="ergo-btn ergo-btn--sm" @click="addPart('value')">+ Texto</button>
        <button type="button" class="ergo-btn ergo-btn--sm" @click="addPart('bind')">+ Campo</button>
      </div>
      <span class="ergo-field__hint">Clicar num campo dos dados acrescenta uma parte.</span>
    </div>
  </div>
</template>

<style scoped>
.ergo-part-kind {
  width: 38px;
  flex-shrink: 0;
}
</style>
