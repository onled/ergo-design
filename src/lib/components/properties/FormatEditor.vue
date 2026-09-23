<script setup lang="ts">
/*
 * Formato do valor ligado. O ergo formata pelo tipo declarado; sem tipo, o
 * valor sai como veio. Os campos mudam conforme o tipo, e só se escreve no JSON
 * o que difere do padrão do locale.
 */
import { computed, shallowRef } from 'vue'
import type { JsonObject, JsonValue } from '../../document/document'
import type { FormatType } from '../../spec/template'
import NumberInput from './NumberInput.vue'

const props = defineProps<{ format: JsonObject | undefined }>()
const emit = defineEmits<{ commit: [format: JsonObject | undefined] }>()

const TYPES: { v: FormatType | ''; label: string }[] = [
  { v: '', label: 'Como veio' },
  { v: 'text', label: 'Texto' },
  { v: 'number', label: 'Número' },
  { v: 'currency', label: 'Moeda' },
  { v: 'percent', label: 'Percentual' },
  { v: 'date', label: 'Data' },
  { v: 'datetime', label: 'Data e hora' },
  { v: 'time', label: 'Hora' },
  { v: 'boolean', label: 'Sim/não' },
]

const PATTERNS: Partial<Record<FormatType, { v: string; label: string }[]>> = {
  date: [
    { v: '', label: '07/09/2026' },
    { v: "dd 'de' MMMM 'de' yyyy", label: '07 de setembro de 2026' },
    { v: "EEEE, dd 'de' MMMM 'de' yyyy", label: 'segunda-feira, 07 de setembro de 2026' },
    { v: 'MM/yyyy', label: '09/2026' },
    { v: "MMMM 'de' yyyy", label: 'setembro de 2026' },
  ],
  datetime: [
    { v: '', label: '07/09/2026 14:47' },
    { v: 'dd/MM/yyyy HH:mm:ss', label: '07/09/2026 14:47:03' },
    { v: "dd 'de' MMMM 'de' yyyy HH:mm", label: '07 de setembro de 2026 14:47' },
    { v: "EEEE, dd 'de' MMMM 'de' yyyy HH:mm", label: 'segunda-feira, 07 de setembro de 2026 14:47' },
  ],
  time: [
    { v: '', label: '14:47' },
    { v: 'HH:mm:ss', label: '14:47:03' },
  ],
}

const f = computed(() => props.format ?? {})
const type = computed(() => (typeof f.value.type === 'string' ? (f.value.type as FormatType) : ''))
const str = (k: string) => (typeof f.value[k] === 'string' ? (f.value[k] as string) : '')
const num = (k: string) => (typeof f.value[k] === 'number' ? (f.value[k] as number) : undefined)

/** Troca uma chave; formato que fica vazio sai inteiro. */
function set(key: string, value: JsonValue | undefined) {
  const next: JsonObject = { ...f.value }
  if (value === undefined || value === '') delete next[key]
  else next[key] = value
  emit('commit', Object.keys(next).length ? next : undefined)
}

/** Trocar o tipo descarta o que só fazia sentido no anterior; transformação e texto de vazio ficam. */
function setType(v: string) {
  const keep: JsonObject = {}
  for (const k of ['nullText', 'transform', 'trim']) if (f.value[k] !== undefined) keep[k] = f.value[k]!
  if (v) keep.type = v
  if (v === 'currency') keep.currency = 'BRL'
  emit('commit', Object.keys(keep).length ? keep : undefined)
}

const patterns = computed(() => (type.value ? PATTERNS[type.value] : undefined))
const wantsCustom = shallowRef(false)
const customPattern = computed(
  () => wantsCustom.value || (!!patterns.value && str('pattern') !== '' && !patterns.value.some((p) => p.v === str('pattern'))),
)

function pickPattern(v: string) {
  wantsCustom.value = v === '__custom'
  if (!wantsCustom.value) set('pattern', v)
}
</script>

<template>
  <section class="e-stack-3">
    <span class="ergo-section-title">Formato do valor</span>

    <label class="ergo-field">
      <span class="ergo-field__label">Tipo</span>
      <select class="ergo-input" :value="type" @change="setType(($event.target as HTMLSelectElement).value)">
        <option v-for="t in TYPES" :key="t.v" :value="t.v">{{ t.label }}</option>
      </select>
    </label>

    <template v-if="type === 'number' || type === 'currency' || type === 'percent'">
      <div class="ergo-format__grid">
        <NumberInput label="Casas decimais" :min="0" :placeholder="type === 'number' ? 'automático' : '2'" :value="num('decimals')" @commit="(v) => set('decimals', v === undefined ? undefined : Math.round(v))" />
        <label v-if="type === 'currency'" class="ergo-field">
          <span class="ergo-field__label">Moeda</span>
          <select class="ergo-input" :value="str('currency') || 'BRL'" @change="set('currency', ($event.target as HTMLSelectElement).value)">
            <option value="BRL">Real (R$)</option>
            <option value="USD">Dólar (US$)</option>
            <option value="EUR">Euro (€)</option>
          </select>
        </label>
      </div>
      <label class="ergo-check">
        <input type="checkbox" :checked="f.trimZeroDecimals === true" @change="set('trimZeroDecimals', ($event.target as HTMLInputElement).checked || undefined)" />
        Esconder decimais zerados (10,00 → 10)
      </label>
      <span v-if="type === 'percent'" class="ergo-field__hint">Multiplica por 100: 0,075 sai 7,5%.</span>
    </template>

    <template v-if="patterns">
      <label class="ergo-field">
        <span class="ergo-field__label">Aparência</span>
        <select class="ergo-input" :value="customPattern ? '__custom' : str('pattern')" @change="pickPattern(($event.target as HTMLSelectElement).value)">
          <option v-for="p in patterns" :key="p.v" :value="p.v">{{ p.label }}</option>
          <option value="__custom">Outro padrão…</option>
        </select>
      </label>
      <label v-if="customPattern" class="ergo-field">
        <span class="ergo-field__label">Padrão</span>
        <input class="ergo-input ergo-input--mono" :value="str('pattern')" placeholder="dd/MM/yyyy" @change="set('pattern', ($event.target as HTMLInputElement).value)" />
        <span class="ergo-field__hint">yyyy, MM, MMMM, dd, EEEE, HH, mm, ss; texto fixo entre aspas simples.</span>
      </label>
      <span class="ergo-field__hint">O dado precisa vir como data ISO (2026-09-07 ou 2026-09-07T14:47).</span>
    </template>

    <div v-if="type === 'boolean'" class="ergo-format__grid">
      <label class="ergo-field">
        <span class="ergo-field__label">Quando verdadeiro</span>
        <input class="ergo-input" :value="str('trueText')" placeholder="Sim" @input="set('trueText', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="ergo-field">
        <span class="ergo-field__label">Quando falso</span>
        <input class="ergo-input" :value="str('falseText')" placeholder="Não" @input="set('falseText', ($event.target as HTMLInputElement).value)" />
      </label>
    </div>

    <label class="ergo-field">
      <span class="ergo-field__label">Letras</span>
      <select class="ergo-input" :value="str('transform')" @change="set('transform', ($event.target as HTMLSelectElement).value)">
        <option value="">Como veio</option>
        <option value="upper">MAIÚSCULAS</option>
        <option value="lower">minúsculas</option>
        <option value="title">Primeira Maiúscula</option>
      </select>
    </label>

    <label class="ergo-field">
      <span class="ergo-field__label">Quando vazio</span>
      <input class="ergo-input" :value="str('nullText')" placeholder="nada" @input="set('nullText', ($event.target as HTMLInputElement).value)" />
    </label>
  </section>
</template>

<style scoped>
.ergo-format__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ergo-space-2);
}
</style>
