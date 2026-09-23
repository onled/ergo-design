<script setup lang="ts">
defineProps<{ label: string; value: string | undefined; placeholder?: string; clearable?: boolean }>()
const emit = defineEmits<{ commit: [value: string | undefined] }>()

/** O seletor nativo só entende #rrggbb; o ergo aceita também #rgb. */
function toPicker(v: string | undefined): string {
  if (!v) return '#000000'
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'
}

function onText(event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim()
  if (raw === '') return emit('commit', undefined)
  const hex = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) emit('commit', hex.toLowerCase())
}
</script>

<template>
  <div class="ergo-field">
    <span class="ergo-field__label">{{ label }}</span>
    <div class="e-row e-items-center e-gap-1">
      <input type="color" class="ergo-color" :value="toPicker(value)" :aria-label="label" @change="emit('commit', ($event.target as HTMLInputElement).value)" />
      <input class="ergo-input ergo-input--mono" :value="value ?? ''" :placeholder="placeholder ?? 'nenhuma'" @change="onText" @keydown.enter="($event.target as HTMLInputElement).blur()" />
      <button v-if="clearable && value" type="button" class="ergo-btn ergo-btn--ghost ergo-btn--sm ergo-btn--icon" :aria-label="`Tirar ${label.toLowerCase()}`" @click="emit('commit', undefined)">×</button>
    </div>
  </div>
</template>

<style scoped>
.ergo-color {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--ergo-color-border);
  border-radius: var(--ergo-radius-sm);
  background: none;
  cursor: pointer;
}
</style>
