<script setup lang="ts">
import NumberInput from './NumberInput.vue'

/** Coluna de linha ou de tabela: proporcional (`weight`) por padrão, fixa (`widthMm`) quando o autor trava. */
const props = defineProps<{ weight: number | undefined; widthMm: number | undefined }>()
const emit = defineEmits<{ commit: [changes: [string, number | undefined][]] }>()

const fixed = () => props.widthMm !== undefined && props.widthMm > 0

function setMode(mode: 'weight' | 'fixed') {
  if (mode === 'fixed' && !fixed()) emit('commit', [['weight', undefined], ['widthMm', 30]])
  if (mode === 'weight' && fixed()) emit('commit', [['widthMm', undefined], ['weight', 1]])
}
</script>

<template>
  <div class="ergo-field">
    <span class="ergo-field__label">Largura</span>
    <div class="ergo-segmented" role="group" aria-label="Tipo de largura">
      <button type="button" :aria-pressed="!fixed()" @click="setMode('weight')">Proporcional</button>
      <button type="button" :aria-pressed="fixed()" @click="setMode('fixed')">Fixa</button>
    </div>
    <NumberInput
      v-if="fixed()"
      label="Largura"
      unit="mm"
      :min="0"
      :value="widthMm"
      @commit="(v) => emit('commit', [['widthMm', v && v > 0 ? v : undefined], ...(v && v > 0 ? [] : [['weight', 1]] as [string, number][])])"
    />
    <NumberInput
      v-else
      label="Peso"
      :min="0"
      :value="weight"
      placeholder="1"
      @commit="(v) => emit('commit', [['weight', v && v > 0 ? v : 1]])"
    />
    <span class="ergo-field__hint">{{ fixed() ? 'Não muda com as outras colunas.' : 'Divide o que sobra das colunas fixas, na proporção dos pesos.' }}</span>
  </div>
</template>
