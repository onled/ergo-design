<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { slotsOf, type EditorNode, type SlotName } from '../../document/document'
import { accepts, describeNode, findNode } from '../../document/ops'
import { refPathsOf, refTokens } from '../../document/styles'
import { useDesigner } from '../../designer/useDesigner'

const props = defineProps<{
  node: EditorNode
  parentUid: string
  slot: SlotName
  index: number
  depth: number
}>()

const designer = useDesigner()
const collapsed = shallowRef(false)
const dropZone = shallowRef<'before' | 'after' | 'inside' | null>(null)

const label = computed(() => describeNode(props.node))
const selected = computed(() => designer.selectedUid.value === props.node.uid)
const usesHighlighted = computed(() => {
  const name = designer.highlightedStyle.value
  if (!name) return false
  return refPathsOf(props.node).some((path) => refTokens(getIn(path)).includes(name))
})

function getIn(path: readonly string[]) {
  let cur: unknown = props.node.props
  for (const key of path) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[key] : undefined
  return cur as string | undefined
}
const childSlots = computed(() =>
  (Object.keys(slotsOf(props.node.kind)) as SlotName[]).filter((slot) => props.node.slots[slot] !== undefined),
)
const hasChildren = computed(() => childSlots.value.some((slot) => (props.node.slots[slot]?.length ?? 0) > 0))
/** Onde "soltar dentro" cai: a primeira lista de componentes do nó. */
const innerSlot = computed<SlotName | undefined>(() =>
  (Object.keys(slotsOf(props.node.kind)) as SlotName[]).find((slot) => slot !== 'columns'),
)

const SLOT_LABELS: Partial<Record<SlotName, string>> = { detail: 'Detalhe de cada linha' }

function draggedKind(): EditorNode['kind'] | null {
  const d = designer.dragging.value
  if (!d) return null
  if ('field' in d) return d.field.kind === 'list' ? 'table' : 'text'
  if (d.uid === props.node.uid) return null
  return findNode(designer.doc.value, d.uid)?.node.kind ?? null
}

function onDragStart(event: DragEvent) {
  event.stopPropagation()
  event.dataTransfer?.setData('text/plain', describeNode(props.node).title)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  designer.dragging.value = { uid: props.node.uid }
}

function onDragOver(event: DragEvent) {
  const kind = draggedKind()
  if (!kind) return
  const probe = { kind } as EditorNode
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const y = (event.clientY - rect.top) / rect.height
  const canInside = innerSlot.value !== undefined && accepts(props.node, innerSlot.value, probe)
  const parent = findNode(designer.doc.value, props.parentUid)?.node
  const canBeside = parent !== undefined && accepts(parent, props.slot, probe)
  let zone: typeof dropZone.value = null
  if (canInside && (!canBeside || (y > 0.25 && y < 0.75))) zone = 'inside'
  else if (canBeside) zone = y < 0.5 ? 'before' : 'after'
  if (!zone) return
  event.preventDefault()
  event.stopPropagation()
  dropZone.value = zone
}

function onDrop(event: DragEvent) {
  const zone = dropZone.value
  dropZone.value = null
  const d = designer.dragging.value
  designer.dragging.value = null
  if (!zone || !d) return
  event.preventDefault()
  event.stopPropagation()
  const at =
    zone === 'inside'
      ? { parent: props.node.uid, slot: innerSlot.value!, index: props.node.slots[innerSlot.value!]?.length ?? 0 }
      : { parent: props.parentUid, slot: props.slot, index: zone === 'before' ? props.index : props.index + 1 }
  if ('field' in d) {
    designer.insertField(d.field, at)
    return
  }
  // A posição de destino é contada com o nó ainda na lista; tirando-o antes, desloca uma.
  const origin = findNode(designer.doc.value, d.uid)
  const sameList = origin?.parent?.uid === at.parent && origin.slot === at.slot
  const index = sameList && origin!.index < at.index ? at.index - 1 : at.index
  designer.move(d.uid, at.parent, at.slot, index)
}
</script>

<template>
  <li class="ergo-tree-item" role="treeitem" :aria-selected="selected" :aria-expanded="hasChildren ? !collapsed : undefined">
    <div
      class="ergo-tree-item__row e-row e-items-center e-gap-1"
      :class="{
        'ergo-tree-item__row--selected': selected,
        'ergo-tree-item__row--opaque': node.kind === 'opaque',
        'ergo-tree-item__row--style': usesHighlighted,
        [`ergo-tree-item__row--drop-${dropZone}`]: dropZone,
      }"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
      draggable="true"
      @click.stop="designer.select(node.uid)"
      @dragstart="onDragStart"
      @dragend="designer.dragging.value = null"
      @dragover="onDragOver"
      @dragleave="dropZone = null"
      @drop="onDrop"
    >
      <button
        v-if="hasChildren"
        type="button"
        class="ergo-tree-item__twisty"
        :aria-label="collapsed ? 'Expandir' : 'Recolher'"
        @click.stop="collapsed = !collapsed"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" :style="{ transform: collapsed ? 'rotate(-90deg)' : undefined }" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <span v-else class="ergo-tree-item__twisty" />
      <span class="e-text-label e-nowrap">{{ label.title }}</span>
      <span v-if="label.detail" class="e-text-caption e-text-muted e-truncate e-min-w-0">{{ label.detail }}</span>
    </div>

    <template v-if="hasChildren && !collapsed">
      <template v-for="slot in childSlots" :key="slot">
        <div
          v-if="SLOT_LABELS[slot] && node.slots[slot]!.length > 0"
          class="ergo-tree-item__slot e-text-caption e-text-subtle"
          :style="{ paddingLeft: `${22 + (depth + 1) * 14}px` }"
        >
          {{ SLOT_LABELS[slot] }}
        </div>
        <ul role="group">
          <TreeItem
            v-for="(child, i) in node.slots[slot]"
            :key="child.uid"
            :node="child"
            :parent-uid="node.uid"
            :slot="slot"
            :index="i"
            :depth="depth + 1"
          />
        </ul>
      </template>
    </template>
  </li>
</template>

<style scoped>
.ergo-tree-item__row {
  position: relative;
  height: 28px;
  padding-right: var(--ergo-space-2);
  cursor: default;
  border-radius: var(--ergo-radius-sm);
  user-select: none;
}

.ergo-tree-item__row:hover {
  background: var(--ergo-color-surface-hover);
}

.ergo-tree-item__row--selected,
.ergo-tree-item__row--selected:hover {
  color: var(--ergo-color-accent-text);
  background: var(--ergo-color-accent-soft);
}

.ergo-tree-item__row--style::after {
  content: '';
  position: absolute;
  top: 9px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: var(--ergo-radius-full);
  background: var(--ergo-color-accent);
}

.ergo-tree-item__row--opaque {
  font-style: italic;
}

.ergo-tree-item__row--drop-inside {
  box-shadow: inset 0 0 0 2px var(--ergo-color-accent);
}

.ergo-tree-item__row--drop-before::before,
.ergo-tree-item__row--drop-after::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 0;
  height: 2px;
  background: var(--ergo-color-accent);
}

.ergo-tree-item__row--drop-before::before {
  top: -1px;
}

.ergo-tree-item__row--drop-after::after {
  bottom: -1px;
}

.ergo-tree-item__twisty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--ergo-color-text-muted);
}

.ergo-tree-item__slot {
  height: 22px;
  line-height: 22px;
}
</style>
