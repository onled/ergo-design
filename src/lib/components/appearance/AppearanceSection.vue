<script setup lang="ts">
/*
 * Aparência de um lugar que aceita styleRef (componente, coluna, cabeçalho).
 *
 * Formatar aqui altera um estilo nomeado: o que o nó já usa — e então vale para
 * todos que o usam, com o aviso de quantos são — ou um criado na hora, se o nó
 * não tem estilo. "Só neste" separa uma cópia antes de mudar.
 */
import { computed, shallowRef, watch } from 'vue'
import type { JsonValue } from '../../document/document'
import type { EditorNode } from '../../document/document'
import { getProp } from '../../document/ops'
import { effectiveStyle, getStyle, refTokens, type RefPath } from '../../document/styles'
import { useDesigner } from '../../designer/useDesigner'
import type { Style } from '../../spec/template'
import AppearanceFields, { type AppearanceGroup } from './AppearanceFields.vue'

const props = defineProps<{
  node: EditorNode
  refPath: RefPath
  groups: AppearanceGroup[]
  title?: string
}>()

const designer = useDesigner()

const tokens = computed(() => refTokens(getProp(props.node, props.refPath as string[])))
const names = computed(() => [...designer.styleUsage.value.keys()])
/** Qual dos estilos da composição recebe as mudanças: por padrão, o último (o mais específico). */
const chosen = shallowRef<string | null>(null)
const target = computed(() => (chosen.value && tokens.value.includes(chosen.value) ? chosen.value : (tokens.value[tokens.value.length - 1] ?? null)))
watch(
  () => [props.node.uid, props.refPath.join('.')],
  () => {
    chosen.value = null
    variantPending.value = false
  },
)

const effective = computed<Style>(() => effectiveStyle(designer.doc.value, tokens.value))
const own = computed(() => (target.value ? (getStyle(designer.doc.value, target.value) as Style | undefined) : undefined))
/** Outros nós (não este) que também usam o estilo-alvo. */
const sharedWith = computed(() => {
  if (!target.value) return 0
  const uses = designer.styleUsage.value.get(target.value) ?? []
  return uses.filter((u) => u.uid !== props.node.uid || u.path.join('.') !== props.refPath.join('.')).length
})
const missing = computed(() => tokens.value.filter((t) => !names.value.includes(t)))

const pickerOpen = shallowRef(false)

function toggleName(name: string) {
  const next = tokens.value.includes(name) ? tokens.value.filter((t) => t !== name) : [...tokens.value, name]
  designer.setRef(props.node.uid, props.refPath, next.length ? next.join(' ') : undefined)
}

/**
 * "Só aqui": a próxima mudança não vai para o estilo compartilhado — vira uma
 * variação composta sobre ele, com só aquela propriedade. Nada é criado antes
 * da mudança, para o impresso não juntar estilo vazio.
 */
const variantPending = shallowRef(false)

function change(path: string[], value: JsonValue | undefined) {
  const edited = designer.editAppearance(props.node.uid, props.refPath, target.value, path, value, {
    variant: variantPending.value,
  })
  if (variantPending.value && edited) chosen.value = edited
  variantPending.value = false
}
</script>

<template>
  <section class="ergo-appearance e-stack-3">
    <div class="e-row e-items-center e-gap-2">
      <span class="ergo-section-title">{{ title ?? 'Aparência' }}</span>
      <button type="button" class="ergo-btn ergo-btn--ghost ergo-btn--sm e-ml-auto" :aria-expanded="pickerOpen" @click="pickerOpen = !pickerOpen">
        {{ pickerOpen ? 'Fechar estilos' : 'Estilos…' }}
      </button>
    </div>

    <div v-if="pickerOpen" class="ergo-appearance__picker e-stack-2">
      <span class="ergo-field__hint">Estilos aplicados, compostos na ordem em que foram marcados.</span>
      <div class="e-row e-wrap e-gap-1">
        <button
          v-for="name in names"
          :key="name"
          type="button"
          class="ergo-btn ergo-btn--sm"
          :class="{ 'ergo-btn--on': tokens.includes(name) }"
          :aria-pressed="tokens.includes(name)"
          @click="toggleName(name)"
        >
          {{ name }}
        </button>
      </div>
    </div>

    <div v-if="tokens.length" class="ergo-appearance__target e-stack-2">
      <div class="e-row e-items-center e-wrap e-gap-1">
        <span class="e-text-caption e-text-muted">Editando</span>
        <template v-if="tokens.length > 1">
          <button
            v-for="t in tokens"
            :key="t"
            type="button"
            class="ergo-btn ergo-btn--sm"
            :class="{ 'ergo-btn--on': t === target }"
            :aria-pressed="t === target"
            @click="chosen = t"
          >
            {{ t }}
          </button>
        </template>
        <span v-else class="e-mono e-text-caption">{{ target }}</span>
      </div>
      <p v-if="sharedWith > 0" class="ergo-appearance__shared e-row e-items-center e-gap-2 e-text-caption">
        <span class="e-grow">Mudanças valem para mais {{ sharedWith }} {{ sharedWith === 1 ? 'uso' : 'usos' }} de <strong>{{ target }}</strong>.</span>
        <button type="button" class="ergo-btn ergo-btn--sm" :class="{ 'ergo-btn--on': variantPending }" :aria-pressed="variantPending" @click="variantPending = !variantPending">
          Só aqui
        </button>
      </p>
      <p v-if="variantPending" class="ergo-appearance__variant e-text-caption">
        A próxima mudança fica só neste, numa variação sobre <strong>{{ target }}</strong> — o resto continua vindo dele.
      </p>
      <p v-if="missing.length" class="e-text-caption e-text-danger">Estilo inexistente: {{ missing.join(', ') }}. Tire-o em Estilos…</p>
    </div>
    <p v-else class="e-text-caption e-text-muted">Sem estilo: a primeira mudança cria um (ou usa um igual que já exista).</p>

    <AppearanceFields
      :effective="effective"
      :own="own"
      :groups="groups"
      @change="change"
    />
  </section>
</template>

<style scoped>
.ergo-appearance__picker,
.ergo-appearance__target {
  padding: var(--ergo-space-2);
  border-radius: var(--ergo-radius-md);
  background: var(--ergo-color-surface-sunken);
}

.ergo-appearance__variant {
  padding: var(--ergo-space-1) var(--ergo-space-2);
  color: var(--ergo-color-accent-text);
  background: var(--ergo-color-accent-soft);
  border-radius: var(--ergo-radius-sm);
}

.ergo-appearance__shared {
  padding: var(--ergo-space-1) var(--ergo-space-2);
  color: var(--ergo-color-warning);
  background: var(--ergo-color-warning-soft);
  border-radius: var(--ergo-radius-sm);
}
</style>
