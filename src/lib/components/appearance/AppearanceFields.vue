<script setup lang="ts">
/*
 * Os campos de aparência de um estilo. Mostra o valor em vigor (a composição
 * inteira) e emite a mudança; quem usa decide em qual estilo ela cai.
 */
import { computed } from 'vue'
import type { JsonValue } from '../../document/document'
import type { Style } from '../../spec/template'
import NumberInput from '../properties/NumberInput.vue'
import ColorInput from './ColorInput.vue'

export type AppearanceGroup = 'text' | 'box' | 'cell' | 'margin' | 'lineColor'

const props = defineProps<{
  /** Valor em vigor: a composição de todos os estilos da referência. */
  effective: Style
  /** O estilo que recebe a mudança, sozinho: desligar o que é dele apaga em vez de sobrescrever. */
  own?: Style
  groups: AppearanceGroup[]
}>()
const emit = defineEmits<{ change: [path: string[], value: JsonValue | undefined] }>()

const has = (g: AppearanceGroup) => props.groups.includes(g)
const e = computed(() => props.effective)

const DECORATIONS = [
  { value: 'underline', label: 'S', title: 'Sublinhado', css: 'text-decoration: underline' },
  { value: 'lineThrough', label: 'T', title: 'Tachado', css: 'text-decoration: line-through' },
]
const decoration = computed(() => String(props.effective.textDecoration ?? '').toLowerCase().replace('-', ''))
const ownDecoration = computed(() => String(props.own?.textDecoration ?? '').toLowerCase())
const isOn = (v: string) => decoration.value === v.toLowerCase()

/** Desligar apaga quando a decoração é deste estilo; senão sobrescreve com `none`. */
function toggleDecoration(v: string) {
  if (!isOn(v)) return emit('change', ['textDecoration'], v)
  emit('change', ['textDecoration'], ownDecoration.value ? undefined : 'none')
}

const ownBold = computed(() => ['bold', '700', '800', '900'].includes(String(props.own?.fontWeight ?? '').toLowerCase()))
const ownItalic = computed(() => ['italic', 'oblique'].includes(String(props.own?.fontStyle ?? '').toLowerCase()))

const bold = computed(() => ['bold', '700', '800', '900'].includes(String(e.value.fontWeight ?? '').toLowerCase()))
const italic = computed(() => ['italic', 'oblique'].includes(String(e.value.fontStyle ?? '').toLowerCase()))

const SIDES = [
  { key: 't', label: 'Topo' },
  { key: 'r', label: 'Direita' },
  { key: 'b', label: 'Base' },
  { key: 'l', label: 'Esquerda' },
] as const

const sides = computed(() => {
  const s = String(e.value.border?.sides ?? '').toLowerCase().trim()
  return s === '' || s === 'all' ? new Set(['t', 'r', 'b', 'l']) : new Set([...s])
})
const hasBorder = computed(() => (e.value.border?.widthMm ?? 0) > 0)

function toggleSide(key: string) {
  const next = new Set(sides.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  if (next.size === 0) return emit('change', ['border', 'widthMm'], undefined)
  emit('change', ['border', 'sides'], next.size === 4 ? 'all' : ['t', 'r', 'b', 'l'].filter((k) => next.has(k)).join(''))
}

function setBorderWidth(v: number | undefined) {
  emit('change', ['border', 'widthMm'], v && v > 0 ? v : undefined)
}

const ALIGNS = [
  { v: 'left', label: 'Esquerda' },
  { v: 'center', label: 'Centro' },
  { v: 'right', label: 'Direita' },
]
const VALIGNS = [
  { v: 'top', label: 'Topo' },
  { v: 'middle', label: 'Meio' },
  { v: 'bottom', label: 'Base' },
]

function normAlign(a: string | undefined) {
  const x = String(a ?? 'left').toLowerCase()
  return ({ l: 'left', start: 'left', c: 'center', r: 'right', end: 'right' } as Record<string, string>)[x] ?? x
}
function normVAlign(a: string | undefined) {
  const x = String(a ?? 'top').toLowerCase()
  return ({ t: 'top', c: 'middle', center: 'middle', b: 'bottom', end: 'bottom' } as Record<string, string>)[x] ?? x
}

const truncates = computed(() => (e.value.maxLines ?? 0) > 0 || e.value.overflow === 'ellipsis' || e.value.overflow === 'clip')

function spacing(kind: 'padding' | 'margin', side: 'topMm' | 'rightMm' | 'bottomMm' | 'leftMm') {
  return e.value[kind]?.[side]
}
</script>

<template>
  <div class="e-stack-4">
    <!-- Texto -->
    <fieldset v-if="has('text')" class="ergo-appearance__group">
      <legend class="ergo-section-title">Texto</legend>
      <div class="ergo-appearance__grid">
        <NumberInput label="Tamanho" unit="pt" :min="1" :value="e.fontSizePt" @commit="(v) => emit('change', ['fontSizePt'], v)" />
        <div class="ergo-field">
          <span class="ergo-field__label">Ênfase e decoração</span>
          <div class="e-row e-gap-1">
            <button type="button" class="ergo-btn ergo-btn--icon" :class="{ 'ergo-btn--on': bold }" :aria-pressed="bold" aria-label="Negrito" title="Negrito" @click="emit('change', ['fontWeight'], bold ? (ownBold ? undefined : 'normal') : 'bold')">
              <strong>N</strong>
            </button>
            <button type="button" class="ergo-btn ergo-btn--icon" :class="{ 'ergo-btn--on': italic }" :aria-pressed="italic" aria-label="Itálico" title="Itálico" @click="emit('change', ['fontStyle'], italic ? (ownItalic ? undefined : 'normal') : 'italic')">
              <em>I</em>
            </button>
            <button
              v-for="d in DECORATIONS"
              :key="d.value"
              type="button"
              class="ergo-btn ergo-btn--icon"
              :class="{ 'ergo-btn--on': isOn(d.value) }"
              :aria-pressed="isOn(d.value)"
              :aria-label="d.title"
              :title="d.title"
              @click="toggleDecoration(d.value)"
            >
              <span :style="d.css">{{ d.label }}</span>
            </button>
          </div>
        </div>
      </div>
      <ColorInput label="Cor do texto" :value="e.color" @commit="(v) => emit('change', ['color'], v)" />
      <NumberInput
        label="Recuo das linhas seguintes"
        unit="mm"
        :min="0"
        placeholder="nenhum"
        :value="e.hangingIndentMm || undefined"
        @commit="(v) => emit('change', ['hangingIndentMm'], v || undefined)"
      />
      <span v-if="(e.hangingIndentMm ?? 0) > 0" class="ergo-field__hint">
        A primeira linha começa na margem; as outras entram, alinhando sob o texto e não sob o marcador.
      </span>
      <div class="ergo-field">
        <span class="ergo-field__label">Alinhamento</span>
        <div class="ergo-segmented" role="group" aria-label="Alinhamento horizontal">
          <button v-for="a in ALIGNS" :key="a.v" type="button" :aria-pressed="normAlign(e.align) === a.v" @click="emit('change', ['align'], a.v)">{{ a.label }}</button>
        </div>
      </div>
    </fieldset>

    <!-- Cor da linha horizontal -->
    <fieldset v-if="has('lineColor')" class="ergo-appearance__group">
      <legend class="ergo-section-title">Cor</legend>
      <ColorInput label="Cor da linha" :value="e.color" @commit="(v) => emit('change', ['color'], v)" />
      <span class="ergo-field__hint">A cor própria da linha, se houver, vence a do estilo.</span>
    </fieldset>

    <!-- Caixa -->
    <fieldset v-if="has('box')" class="ergo-appearance__group">
      <legend class="ergo-section-title">Fundo e borda</legend>
      <ColorInput label="Fundo" :value="e.backgroundColor" clearable @commit="(v) => emit('change', ['backgroundColor'], v)" />
      <div class="ergo-appearance__grid">
        <NumberInput label="Borda" unit="mm" :min="0" placeholder="sem borda" :value="e.border?.widthMm || undefined" @commit="setBorderWidth" />
        <ColorInput v-if="hasBorder" label="Cor da borda" :value="e.border?.color" placeholder="#000000" @commit="(v) => emit('change', ['border', 'color'], v)" />
      </div>
      <div v-if="hasBorder" class="ergo-field">
        <span class="ergo-field__label">Lados</span>
        <div class="e-row e-gap-1">
          <button
            v-for="s in SIDES"
            :key="s.key"
            type="button"
            class="ergo-btn ergo-btn--sm"
            :class="{ 'ergo-btn--on': sides.has(s.key) }"
            :aria-pressed="sides.has(s.key)"
            @click="toggleSide(s.key)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
      <div class="ergo-field">
        <span class="ergo-field__label">Espaço interno (mm)</span>
        <div class="ergo-appearance__sides">
          <NumberInput label="Topo" :min="0" :value="spacing('padding', 'topMm')" @commit="(v) => emit('change', ['padding', 'topMm'], v || undefined)" />
          <NumberInput label="Direita" :min="0" :value="spacing('padding', 'rightMm')" @commit="(v) => emit('change', ['padding', 'rightMm'], v || undefined)" />
          <NumberInput label="Base" :min="0" :value="spacing('padding', 'bottomMm')" @commit="(v) => emit('change', ['padding', 'bottomMm'], v || undefined)" />
          <NumberInput label="Esquerda" :min="0" :value="spacing('padding', 'leftMm')" @commit="(v) => emit('change', ['padding', 'leftMm'], v || undefined)" />
        </div>
      </div>
    </fieldset>

    <!-- Célula -->
    <fieldset v-if="has('cell')" class="ergo-appearance__group">
      <legend class="ergo-section-title">Altura e quebra</legend>
      <div class="ergo-field">
        <span class="ergo-field__label">Alinhamento vertical</span>
        <div class="ergo-segmented" role="group" aria-label="Alinhamento vertical">
          <button v-for="a in VALIGNS" :key="a.v" type="button" :aria-pressed="normVAlign(e.verticalAlign) === a.v" @click="emit('change', ['verticalAlign'], a.v)">{{ a.label }}</button>
        </div>
      </div>
      <div class="ergo-appearance__grid">
        <NumberInput label="Altura mínima" unit="mm" :min="0" placeholder="automática" :value="e.minHeightMm || undefined" @commit="(v) => emit('change', ['minHeightMm'], v || undefined)" />
        <NumberInput label="Máximo de linhas" :min="0" placeholder="sem limite" :value="e.maxLines || undefined" @commit="(v) => emit('change', ['maxLines'], v ? Math.round(v) : undefined)" />
      </div>
      <label class="ergo-check">
        <input type="checkbox" :checked="e.overflow === 'ellipsis'" @change="emit('change', ['overflow'], ($event.target as HTMLInputElement).checked ? 'ellipsis' : own?.overflow === 'ellipsis' ? undefined : 'wrap')" />
        Cortar em uma linha com reticências
      </label>
      <span v-if="truncates" class="ergo-field__hint">Texto que não cabe é cortado: confira no preview.</span>
    </fieldset>

    <!-- Margem -->
    <fieldset v-if="has('margin')" class="ergo-appearance__group">
      <legend class="ergo-section-title">Margem externa (mm)</legend>
      <div class="ergo-appearance__sides">
        <NumberInput label="Topo" :min="0" :value="spacing('margin', 'topMm')" @commit="(v) => emit('change', ['margin', 'topMm'], v || undefined)" />
        <NumberInput label="Direita" :min="0" :value="spacing('margin', 'rightMm')" @commit="(v) => emit('change', ['margin', 'rightMm'], v || undefined)" />
        <NumberInput label="Base" :min="0" :value="spacing('margin', 'bottomMm')" @commit="(v) => emit('change', ['margin', 'bottomMm'], v || undefined)" />
        <NumberInput label="Esquerda" :min="0" :value="spacing('margin', 'leftMm')" @commit="(v) => emit('change', ['margin', 'leftMm'], v || undefined)" />
      </div>
      <span class="ergo-field__hint">Espaço fora do componente. Prefira a margem a um componente de espaço.</span>
    </fieldset>
  </div>
</template>

<style scoped>
.ergo-appearance__group {
  display: flex;
  flex-direction: column;
  gap: var(--ergo-space-3);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.ergo-appearance__group legend {
  margin-bottom: var(--ergo-space-2);
  padding: 0;
}

.ergo-appearance__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ergo-space-2);
}

.ergo-appearance__sides {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ergo-space-1);
}
</style>
