<script setup lang="ts">
/* Grava ao confirmar (change), não a cada tecla: "1." no meio da digitação não é número. */
const props = defineProps<{
  value: number | undefined
  min?: number
  step?: number
  placeholder?: string
  label: string
  unit?: string
}>()

const emit = defineEmits<{ commit: [value: number | undefined] }>()

function onChange(event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim().replace(',', '.')
  if (raw === '') return emit('commit', undefined)
  const n = Number(raw)
  if (Number.isFinite(n) && (props.min === undefined || n >= props.min)) emit('commit', n)
  else (event.target as HTMLInputElement).value = props.value === undefined ? '' : String(props.value)
}
</script>

<template>
  <label class="ergo-field">
    <span class="ergo-field__label">{{ label }}<template v-if="unit"> ({{ unit }})</template></span>
    <input
      class="ergo-input e-tabular"
      type="text"
      inputmode="decimal"
      :value="value ?? ''"
      :placeholder="placeholder"
      @change="onChange"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
    />
  </label>
</template>
