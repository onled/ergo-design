<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { SECTION_NAMES, type EditorNode } from '../../document/document'
import { accepts, findNode, presentSections, type InsertableKind } from '../../document/ops'
import { BLOCKS, MAX_BLOCK_COLS, MAX_BLOCK_ROWS } from '../../designer/blocks'
import StylesPanel from '../styles/StylesPanel.vue'
import { useDesigner } from '../../designer/useDesigner'
import type { SectionName } from '../../spec/template'
import { INSERTABLE, SECTION_HINTS, SECTION_LABELS } from './labels'
import TreeItem from './TreeItem.vue'

const designer = useDesigner()
const menuOpen = shallowRef(false)
const tab = shallowRef<'structure' | 'styles'>('structure')
const dropSection = shallowRef<SectionName | null>(null)

const root = computed(() => designer.doc.value.root)
const sections = computed(() => presentSections(designer.doc.value))
const missing = computed(() => SECTION_NAMES.filter((n) => !sections.value.includes(n)))
const insertTarget = computed(() => {
  const found = designer.selected.value
  if (found) return 'perto do selecionado'
  return `em ${SECTION_LABELS[designer.activeSection.value]}`
})

function insert(kind: InsertableKind) {
  menuOpen.value = false
  designer.insertKind(kind)
}

/** Tamanho do bloco que tem tamanho, enquanto o menu está aberto. */
const size = shallowRef({ rows: 4, cols: 2 })

function insertBlock(id: string) {
  menuOpen.value = false
  designer.insertBlock(id, size.value)
}

function setSize(key: 'rows' | 'cols', event: Event) {
  const max = key === 'rows' ? MAX_BLOCK_ROWS : MAX_BLOCK_COLS
  const input = event.target as HTMLInputElement
  const n = Math.min(max, Math.max(1, Math.round(Number(input.value)) || 1))
  size.value = { ...size.value, [key]: n }
  input.value = String(n)
}

function switchTab(next: 'structure' | 'styles') {
  // O destaque de usos de um estilo continua ao voltar para a árvore: é lá que ele aparece.
  tab.value = next
  menuOpen.value = false
}

function onSectionDragOver(event: DragEvent, name: SectionName) {
  const d = designer.dragging.value
  if (!d) return
  const kind = 'field' in d ? (d.field.kind === 'list' ? 'table' : 'text') : findNode(designer.doc.value, d.uid)?.node.kind
  if (!kind || !accepts(root.value, name, { kind } as EditorNode)) return
  event.preventDefault()
  dropSection.value = name
}

function onSectionDrop(event: DragEvent, name: SectionName) {
  dropSection.value = null
  const d = designer.dragging.value
  designer.dragging.value = null
  if (!d) return
  event.preventDefault()
  const at = { parent: root.value.uid, slot: name, index: root.value.slots[name]?.length ?? 0 }
  if ('field' in d) designer.insertField(d.field, at)
  else designer.move(d.uid, at.parent, at.slot, at.index)
}

function addSection(event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value) designer.addSection(select.value as SectionName)
  select.value = ''
}
</script>

<template>
  <aside class="ergo-structure e-col e-shrink-0 e-bg-surface e-border-r" aria-label="Estrutura">
    <div class="ergo-structure__head e-row e-items-center e-gap-1 e-px-2 e-border-b">
      <div class="ergo-segmented" role="tablist" aria-label="Painel">
        <button type="button" role="tab" :aria-selected="tab === 'structure'" :aria-pressed="tab === 'structure'" @click="switchTab('structure')">Estrutura</button>
        <button type="button" role="tab" :aria-selected="tab === 'styles'" :aria-pressed="tab === 'styles'" @click="switchTab('styles')">Estilos</button>
      </div>
      <div v-if="tab === 'structure'" class="e-ml-auto e-relative">
        <button type="button" class="ergo-btn ergo-btn--sm" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">+ Inserir</button>
        <div v-if="menuOpen" class="ergo-structure__menu e-bg-surface e-shadow-lg e-rounded-lg e-p-1" role="menu">
          <p class="e-text-caption e-text-muted e-px-2 e-py-1">Entra {{ insertTarget }}</p>
          <button v-for="item in INSERTABLE" :key="item.kind" type="button" role="menuitem" class="ergo-structure__menu-item e-text-label" @click="insert(item.kind)">
            {{ item.label }}
          </button>
          <p class="ergo-structure__menu-group e-text-caption e-text-muted e-px-2">Blocos prontos</p>
          <template v-for="block in BLOCKS" :key="block.id">
            <button v-if="!block.size" type="button" role="menuitem" class="ergo-structure__menu-item" @click="insertBlock(block.id)">
              <span class="e-block e-text-label">{{ block.label }}</span>
              <span class="e-block e-text-caption e-text-muted">{{ block.hint }}</span>
            </button>
            <div v-else class="ergo-structure__menu-item ergo-structure__menu-form">
              <span class="e-block e-text-label">{{ block.label.replace('N × 2', `${size.rows} × ${size.cols}`) }}</span>
              <span class="e-block e-text-caption e-text-muted">{{ block.hint }}</span>
              <div class="e-row e-items-end e-gap-1 e-mt-2" @click.stop>
                <label class="ergo-field">
                  <span class="ergo-field__label">Linhas</span>
                  <input class="ergo-input e-tabular" type="number" min="1" :max="MAX_BLOCK_ROWS" :value="size.rows" @change="setSize('rows', $event)" />
                </label>
                <label class="ergo-field">
                  <span class="ergo-field__label">Colunas</span>
                  <input class="ergo-input e-tabular" type="number" min="1" :max="MAX_BLOCK_COLS" :value="size.cols" @change="setSize('cols', $event)" />
                </label>
                <button type="button" role="menuitem" class="ergo-btn" @click="insertBlock(block.id)">Inserir</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <StylesPanel v-if="tab === 'styles'" />

    <div v-else class="e-grow e-scroll-y e-py-2" @click="menuOpen = false">
      <section v-for="name in sections" :key="name" class="ergo-structure__section">
        <div
          class="ergo-structure__section-head e-row e-items-center e-gap-2 e-px-3"
          :class="{
            'ergo-structure__section-head--active': !designer.selectedUid.value && designer.activeSection.value === name,
            'ergo-structure__section-head--drop': dropSection === name,
          }"
          :title="SECTION_HINTS[name]"
          @click="designer.selectSection(name)"
          @dragover="onSectionDragOver($event, name)"
          @dragleave="dropSection = null"
          @drop="onSectionDrop($event, name)"
        >
          <span class="ergo-section-title">{{ SECTION_LABELS[name] }}</span>
          <button
            v-if="designer.highlightedStyle.value && name === sections[0]"
            type="button"
            class="ergo-btn ergo-btn--sm ergo-btn--on"
            title="Tirar o destaque"
            @click.stop="designer.highlightedStyle.value = null"
          >
            usos de {{ designer.highlightedStyle.value }} ×
          </button>
          <button
            v-if="name !== 'content'"
            type="button"
            class="ergo-btn ergo-btn--ghost ergo-btn--sm ergo-btn--icon e-ml-auto ergo-structure__remove"
            :aria-label="`Remover ${SECTION_LABELS[name]}`"
            title="Remover seção"
            @click.stop="designer.removeSection(name)"
          >
            ×
          </button>
        </div>
        <ul role="tree" :aria-label="SECTION_LABELS[name]">
          <TreeItem
            v-for="(node, i) in root.slots[name]"
            :key="node.uid"
            :node="node"
            :parent-uid="root.uid"
            :slot="name"
            :index="i"
            :depth="0"
          />
        </ul>
        <p v-if="root.slots[name]!.length === 0" class="e-text-caption e-text-subtle ergo-structure__empty">
          {{ name === 'content' ? 'Vazio. Clique num campo dos dados, ou em + Inserir.' : 'Vazio.' }}
        </p>
      </section>

      <div v-if="missing.length" class="e-px-3 e-pt-3">
        <select class="ergo-input" aria-label="Adicionar seção" @change="addSection">
          <option value="">+ Adicionar seção…</option>
          <option v-for="name in missing" :key="name" :value="name">{{ SECTION_LABELS[name] }} — {{ SECTION_HINTS[name] }}</option>
        </select>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.ergo-structure {
  width: var(--ergo-panel-width);
}

.ergo-structure__head {
  height: 44px;
  flex-shrink: 0;
}

.ergo-structure__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  width: 260px;
  max-height: 70vh;
  overflow-y: auto;
  border: 1px solid var(--ergo-color-border);
}

.ergo-structure__menu-item {
  display: block;
  width: 100%;
  padding: 6px var(--ergo-space-2);
  text-align: left;
  border-radius: var(--ergo-radius-sm);
}

.ergo-structure__menu-group {
  margin-top: var(--ergo-space-2);
  padding-top: var(--ergo-space-2);
  border-top: 1px solid var(--ergo-color-border);
}

.ergo-structure__menu-form,
.ergo-structure__menu-form:hover {
  background: var(--ergo-color-surface-sunken);
}

.ergo-structure__menu-form .ergo-field {
  width: 64px;
}

.ergo-structure__menu-item:hover {
  background: var(--ergo-color-surface-hover);
}

.ergo-structure__section + .ergo-structure__section {
  margin-top: var(--ergo-space-2);
}

.ergo-structure__section-head {
  height: 28px;
  cursor: default;
  border-radius: var(--ergo-radius-sm);
}

.ergo-structure__section-head:hover {
  background: var(--ergo-color-surface-hover);
}

.ergo-structure__section-head--active .ergo-section-title {
  color: var(--ergo-color-accent-text);
}

.ergo-structure__section-head--drop {
  box-shadow: inset 0 0 0 2px var(--ergo-color-accent);
}

.ergo-structure__remove {
  opacity: 0;
}

.ergo-structure__section-head:hover .ergo-structure__remove,
.ergo-structure__remove:focus-visible {
  opacity: 1;
}

.ergo-structure__empty {
  padding: 2px var(--ergo-space-3) var(--ergo-space-1) 30px;
}
</style>
