<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import type { DataField } from '../../document/scope'
import { useDesigner } from '../../designer/useDesigner'
import { formatBytes } from '../../files/files'
import FieldRow from './FieldRow.vue'

defineProps<{ file: { name: string; bytes: number } | null; hasData: boolean }>()
const emit = defineEmits<{ load: []; clear: [] }>()

const designer = useDesigner()
const hovered = shallowRef<DataField | null>(null)

/** Campos soltos na raiz ficam juntos num grupo; objetos e listas, cada um no seu. */
const groups = computed(() => {
  const fields = designer.fields.value
  const loose = fields.filter((f) => f.children.length === 0)
  const nested = fields.filter((f) => f.children.length > 0)
  return [
    { key: '@sistema', fields: designer.systemFields.value, root: true, title: 'sistema' },
    ...(loose.length ? [{ key: '(raiz)', fields: loose, root: true, title: 'raiz' }] : []),
    ...nested.map((f) => ({ key: f.path, fields: [f], root: false, title: '' })),
  ]
})

const hint = computed(() => {
  if (hovered.value) {
    const action = designer.fieldAction(hovered.value)
    if (!action) return 'Este campo não pode ser usado diretamente.'
    const alt = action.alt ? ` · Alt+clique: ${action.alt.label.toLowerCase()}` : ''
    return `${action.label}${alt}`
  }
  const found = designer.selected.value
  if (!found) return 'Clique num campo para inseri-lo; numa lista, para inserir uma tabela. Ou arraste para a estrutura.'
  return 'Clique num campo para ligá-lo ao componente selecionado.'
})
</script>

<template>
  <section class="ergo-data e-col e-shrink-0 e-bg-surface e-border-t" aria-label="Dados">
    <div class="ergo-data__head e-row e-items-center e-gap-3 e-px-4 e-border-b">
      <span class="e-eyebrow">Dados</span>
      <template v-if="hasData">
        <span class="e-text-label e-truncate">{{ file?.name ?? 'Dados do host' }}</span>
        <span v-if="file" class="e-text-caption e-text-muted e-tabular">{{ formatBytes(file.bytes) }}</span>
        <span class="e-text-caption e-text-accent e-truncate e-min-w-0">{{ hint }}</span>
        <button type="button" class="ergo-btn ergo-btn--sm e-ml-auto" @click="emit('load')">Trocar</button>
        <button type="button" class="ergo-btn ergo-btn--sm" @click="emit('clear')">Remover</button>
      </template>
      <span v-else class="e-text-label e-text-muted">Sem dados: o preview mostra o desenho com os campos vazios.</span>
    </div>

    <div v-if="!hasData" class="e-grow e-row e-items-center e-justify-center e-gap-3 e-p-4">
      <button type="button" class="ergo-btn ergo-btn--primary" @click="emit('load')">Carregar JSON de dados</button>
      <span class="e-text-label e-text-muted">ou solte o arquivo em qualquer lugar do editor</span>
    </div>
    <div v-else class="ergo-data__groups e-grow e-row e-min-h-0">
      <div v-for="group in groups" :key="group.key" class="ergo-data__group e-col e-min-h-0 e-border-r">
        <ul class="e-scroll-y e-grow e-py-1 e-px-1">
          <template v-if="group.root">
            <li class="ergo-data__group-title e-text-caption e-text-subtle e-px-2">{{ group.title }}</li>
            <FieldRow v-for="f in group.fields" :key="f.path" :field="f" :depth="0" @hover="hovered = $event" />
          </template>
          <FieldRow v-else :field="group.fields[0]!" :depth="0" @hover="hovered = $event" />
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ergo-data {
  height: 240px;
}

.ergo-data__head {
  height: 36px;
  flex-shrink: 0;
}

.ergo-data__groups {
  overflow-x: auto;
}

.ergo-data__group {
  width: 300px;
  flex-shrink: 0;
}

.ergo-data__group-title {
  height: 24px;
  line-height: 24px;
}
</style>
