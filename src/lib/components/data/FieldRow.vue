<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import type { DataField } from '../../document/scope'
import { useDesigner } from '../../designer/useDesigner'

const props = defineProps<{ field: DataField; depth: number }>()
const emit = defineEmits<{ hover: [field: DataField | null] }>()
const designer = useDesigner()

const open = shallowRef(props.depth === 0)
const expandable = computed(() => props.field.children.length > 0)
const action = computed(() => (designer.version.value, designer.fieldAction(props.field)))

const KIND_LABEL: Record<DataField['kind'], string> = {
  object: 'objeto',
  list: 'lista',
  text: 'texto',
  number: 'número',
  boolean: 'sim/não',
  null: 'vazio',
}

function onClick(event: MouseEvent) {
  if (event.altKey && action.value?.alt) action.value.alt.run()
  else if (action.value) action.value.run()
  else if (expandable.value) open.value = !open.value
}

function onDragStart(event: DragEvent) {
  if (props.field.kind === 'object') return event.preventDefault()
  event.dataTransfer?.setData('text/plain', props.field.path)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
  designer.dragging.value = { field: props.field }
}
</script>

<template>
  <li>
    <div
      class="ergo-field-row e-row e-items-center e-gap-1"
      :class="{ 'ergo-field-row--disabled': !action }"
      :style="{ paddingLeft: `${4 + depth * 14}px` }"
      :title="action ? (action.alt ? `${action.label} · Alt+clique: ${action.alt.label.toLowerCase()}` : action.label) : field.kind === 'object' ? 'Objeto: abra para ver os campos' : 'Chave com caractere que o ergo não acessa'"
      :draggable="field.kind !== 'object'"
      @click="onClick"
      @mouseenter="emit('hover', field)"
      @mouseleave="emit('hover', null)"
      @dragstart="onDragStart"
      @dragend="designer.dragging.value = null"
    >
      <button
        v-if="expandable"
        type="button"
        class="ergo-field-row__twisty"
        :aria-label="open ? 'Recolher' : 'Expandir'"
        :aria-expanded="open"
        @click.stop="open = !open"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" :style="{ transform: open ? undefined : 'rotate(-90deg)' }" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <span v-else class="ergo-field-row__twisty" />
      <span v-if="field.label" class="e-text-caption e-nowrap">{{ field.label }}</span>
      <span class="e-mono e-text-caption e-nowrap" :class="{ 'e-text-muted': field.label }">{{ field.key }}</span>
      <span v-if="!field.label" class="ergo-field-row__kind e-text-caption e-nowrap">{{ field.hint === 'date' ? 'data' : field.hint === 'datetime' ? 'data e hora' : KIND_LABEL[field.kind] }}</span>
      <span class="e-text-caption e-text-muted e-truncate e-min-w-0">{{ field.sample }}</span>
    </div>
    <ul v-if="expandable && open">
      <FieldRow v-for="child in field.children" :key="child.path" :field="child" :depth="depth + 1" @hover="(f) => emit('hover', f)" />
    </ul>
  </li>
</template>

<style scoped>
.ergo-field-row {
  height: 24px;
  padding-right: var(--ergo-space-2);
  border-radius: var(--ergo-radius-sm);
  cursor: pointer;
  user-select: none;
}

.ergo-field-row:hover {
  background: var(--ergo-color-accent-soft);
}

.ergo-field-row--disabled {
  cursor: default;
}

.ergo-field-row--disabled:hover {
  background: var(--ergo-color-surface-hover);
}

.ergo-field-row__twisty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--ergo-color-text-muted);
}

.ergo-field-row__kind {
  color: var(--ergo-color-text-subtle);
}
</style>
