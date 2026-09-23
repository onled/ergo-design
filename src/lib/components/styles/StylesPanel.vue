<script setup lang="ts">
/*
 * Estilos do impresso: quantos componentes usam cada um, com renomear (que
 * atualiza toda referência), duplicar, apagar o que ninguém usa e editar direto.
 */
import { computed, shallowRef } from 'vue'
import { effectiveStyle, getStyle, isValidStyleName } from '../../document/styles'
import { useDesigner } from '../../designer/useDesigner'
import type { Style } from '../../spec/template'
import AppearanceFields from '../appearance/AppearanceFields.vue'

const designer = useDesigner()
const open = shallowRef<string | null>(null)
const renameError = shallowRef<string | null>(null)

const rows = computed(() =>
  [...designer.styleUsage.value.entries()].map(([name, uses]) => ({
    name,
    uses: uses.length,
    exists: getStyle(designer.doc.value, name) !== undefined,
    style: effectiveStyle(designer.doc.value, [name]),
  })),
)

function toggle(name: string) {
  open.value = open.value === name ? null : name
  renameError.value = null
  designer.highlightedStyle.value = open.value
}

function rename(from: string, event: Event) {
  const input = event.target as HTMLInputElement
  const to = input.value.trim()
  if (to === from) return
  if (!isValidStyleName(to)) {
    renameError.value = 'O nome não pode ter espaço nem ficar vazio.'
    input.value = from
    return
  }
  if (designer.styleUsage.value.has(to)) {
    renameError.value = `Já existe um estilo ${to}.`
    input.value = from
    return
  }
  renameError.value = null
  designer.renameStyle(from, to)
  open.value = to
}

function add() {
  const name = designer.createStyle('estilo')
  open.value = name
  designer.highlightedStyle.value = name
}

function duplicate(name: string) {
  const copy = designer.duplicateStyle(name)
  open.value = copy
  designer.highlightedStyle.value = copy
}

/** Amostra na tela: aproximação do papel, não o render — esse é o preview. */
function sample(style: Style) {
  const border = style.border?.widthMm ? `${Math.max(1, style.border.widthMm * 3.78)}px solid ${style.border.color || '#000'}` : undefined
  const sides = String(style.border?.sides ?? 'all').toLowerCase()
  const on = (k: string) => sides === 'all' || sides === '' || sides.includes(k)
  return {
    fontSize: `${Math.min(style.fontSizePt ?? 10, 18) * 1.33}px`,
    fontWeight: ['bold', '700', '800', '900'].includes(String(style.fontWeight)) ? 700 : 400,
    fontStyle: ['italic', 'oblique'].includes(String(style.fontStyle)) ? 'italic' : 'normal',
    color: style.color,
    background: style.backgroundColor ?? '#ffffff',
    textAlign: (style.align as 'left' | 'center' | 'right') ?? 'left',
    borderTop: on('t') ? border : undefined,
    borderRight: on('r') ? border : undefined,
    borderBottom: on('b') ? border : undefined,
    borderLeft: on('l') ? border : undefined,
  }
}
</script>

<template>
  <div class="ergo-styles e-col e-grow e-min-h-0">
    <div class="e-grow e-scroll-y e-p-2 e-stack-1">
      <p class="e-text-caption e-text-muted e-px-2 e-pb-1">
        Formatar um componente altera o estilo dele. Aqui ficam todos, com quantos usos cada um tem.
      </p>
      <div v-for="row in rows" :key="row.name" class="ergo-styles__item" :class="{ 'ergo-styles__item--open': open === row.name }">
        <button type="button" class="ergo-styles__head e-row e-items-center e-gap-2 e-w-full" :aria-expanded="open === row.name" @click="toggle(row.name)">
          <span class="ergo-styles__sample" :style="sample(row.style)">Aa</span>
          <span class="e-mono e-text-label e-truncate e-min-w-0" :class="{ 'e-text-danger': !row.exists }">{{ row.name }}</span>
          <span class="e-ml-auto e-text-caption e-tabular" :class="row.uses ? 'e-text-muted' : 'e-text-subtle'">
            {{ !row.exists ? 'não existe' : row.uses === 0 ? 'sem uso' : `${row.uses} ${row.uses === 1 ? 'uso' : 'usos'}` }}
          </span>
        </button>

        <div v-if="open === row.name && row.exists" class="e-px-3 e-pb-3 e-stack-3">
          <label class="ergo-field">
            <span class="ergo-field__label">Nome</span>
            <input class="ergo-input ergo-input--mono" :value="row.name" @change="rename(row.name, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
            <span v-if="renameError" class="e-text-caption e-text-danger">{{ renameError }}</span>
            <span v-else-if="row.uses" class="ergo-field__hint">Renomear atualiza os {{ row.uses }} usos. Eles aparecem marcados na estrutura.</span>
          </label>
          <div class="e-row e-gap-1">
            <button type="button" class="ergo-btn ergo-btn--sm" @click="duplicate(row.name)">Duplicar</button>
            <button
              type="button"
              class="ergo-btn ergo-btn--sm"
              :disabled="row.uses > 0"
              :title="row.uses > 0 ? 'Em uso: tire-o dos componentes antes de apagar' : undefined"
              @click="designer.deleteStyle(row.name); open = null"
            >
              Apagar
            </button>
          </div>
          <AppearanceFields
            :effective="row.style"
            :own="getStyle(designer.doc.value, row.name) as Style"
            :groups="['text', 'box', 'cell', 'margin']"
            @change="(path, value) => designer.editStyle(row.name, path, value)"
          />
        </div>
      </div>
    </div>
    <div class="e-p-2 e-border-t">
      <button type="button" class="ergo-btn e-w-full" @click="add">+ Novo estilo</button>
    </div>
  </div>
</template>

<style scoped>
.ergo-styles__item {
  border-radius: var(--ergo-radius-md);
}

.ergo-styles__item--open {
  background: var(--ergo-color-surface-sunken);
}

.ergo-styles__head {
  height: 36px;
  padding-inline: var(--ergo-space-2);
  border-radius: var(--ergo-radius-md);
  text-align: left;
}

.ergo-styles__head:hover {
  background: var(--ergo-color-surface-hover);
}

.ergo-styles__sample {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 26px;
  overflow: hidden;
  line-height: 1;
  border-radius: var(--ergo-radius-sm);
  box-shadow: inset 0 0 0 1px var(--ergo-color-border);
}
</style>
