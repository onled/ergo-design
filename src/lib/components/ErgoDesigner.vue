<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { useErgoConfig } from '../config/config'
import { createDesigner, provideDesigner } from '../designer/useDesigner'
import { resolveIssuePath } from '../document/document'
import { downloadJson, downloadPdf, looksLikeTemplate, pickFile, readJsonFile } from '../files/files'
import PdfPages from '../preview/PdfPages.vue'
import DataPanel from './data/DataPanel.vue'
import PropertiesPanel from './properties/PropertiesPanel.vue'
import StructurePanel from './structure/StructurePanel.vue'
import { usePreview } from '../preview/usePreview'
import { createEmptyTemplate, type Template } from '../spec/template'

const props = defineProps<{
  /** Nome exibido e usado ao exportar. */
  name?: string
}>()

const template = defineModel<Template>({ default: createEmptyTemplate })
/** Dados de exemplo do preview. O host passa o registro; no site, a pessoa carrega um arquivo. */
const data = defineModel<unknown>('data')

const config = useErgoConfig()
const designer = createDesigner(template, data)
provideDesigner(designer)
const preview = usePreview({ engine: config.engine, template, data, locale: config.locale })

const templateName = shallowRef(props.name ?? 'Novo impresso')
const dataFile = shallowRef<{ name: string; bytes: number } | null>(null)
const fileError = shallowRef<string | null>(null)
const showProblems = shallowRef(false)
const dragging = shallowRef(false)

/*
 * Zoom. O padrão é ajustar à largura: a página do papel costuma ser mais larga
 * que a área que sobra entre os painéis, e ninguém quer rolar na horizontal
 * para ler um impresso.
 */
const ZOOMS = [0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2]
const PX_PER_MM = 96 / 25.4
const CANVAS_PADDING = 64

const zoomMode = shallowRef<'fit' | 'manual'>('fit')
const manualZoom = shallowRef(1)
const viewportWidth = shallowRef(0)
const scroller = shallowRef<HTMLElement>()

const fitZoom = computed(() => {
  const pageWidth = template.value.page.widthMm * PX_PER_MM
  if (!viewportWidth.value || !pageWidth) return 1
  return Math.min(1, Math.max(0.25, (viewportWidth.value - CANVAS_PADDING) / pageWidth))
})
const zoom = computed(() => (zoomMode.value === 'fit' ? fitZoom.value : manualZoom.value))
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)

function stepZoom(dir: 1 | -1) {
  const current = zoom.value
  const next = dir > 0 ? ZOOMS.find((z) => z > current + 0.001) : [...ZOOMS].reverse().find((z) => z < current - 0.001)
  if (next === undefined) return
  zoomMode.value = 'manual'
  manualZoom.value = next
}

let observer: ResizeObserver | undefined
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('pointerdown', onPointerDown, true)
  if (!scroller.value) return
  observer = new ResizeObserver(([entry]) => (viewportWidth.value = entry!.contentRect.width))
  observer.observe(scroller.value)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pointerdown', onPointerDown, true)
  observer?.disconnect()
})

const problemCount = computed(() => preview.issues.value.length + preview.warnings.value.length)

const statusText = computed(() => {
  if (preview.failure.value) return 'Serviço indisponível'
  switch (preview.status.value) {
    case 'rendering':
      return 'Gerando…'
    case 'ready':
      return `${preview.pages.value} ${preview.pages.value === 1 ? 'página' : 'páginas'} · ${preview.elapsedMs.value} ms`
    case 'failed':
      return 'Não gerou'
    default:
      return ''
  }
})

/** Leva o problema ao nó; o que não é de componente (página, estilos) cai na raiz e limpa a seleção. */
function goToIssue(path: string) {
  const uid = resolveIssuePath(designer.paths.value, path)
  designer.select(uid && uid !== designer.doc.value.root.uid ? uid : null)
}

function isEditable(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/**
 * Atalhos. O ouvinte fica na janela, e não no elemento do editor, porque uma
 * ação que apaga o elemento com foco (o item de menu que some ao fechar, o
 * componente apagado) devolve o foco ao body — e aí um ouvinte preso ao editor
 * nunca mais veria o teclado. Fora do editor, só atende quando ninguém mais tem
 * o foco e o último clique foi aqui dentro: duas instâncias na mesma página não
 * disputam a tecla.
 */
const root = shallowRef<HTMLElement>()
const lastInteraction = shallowRef(false)

function ownsKeyboard(target: EventTarget | null): boolean {
  const el = root.value
  if (!el) return false
  if (target instanceof Node && el.contains(target)) return true
  const active = document.activeElement
  return lastInteraction.value && (active === null || active === document.body)
}

/** Clique fora tira o editor da vez, e clique dentro devolve. */
function onPointerDown(event: PointerEvent) {
  lastInteraction.value = event.target instanceof Node && !!root.value?.contains(event.target)
}

function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (!ownsKeyboard(event.target)) return
  // Dentro de um campo, desfazer é do campo.
  if (isEditable(event.target)) return
  if (mod && key === 'z' && !event.shiftKey) designer.undo()
  else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) designer.redo()
  else if (mod && key === 'd' && designer.selectedUid.value) designer.duplicate(designer.selectedUid.value)
  else if ((key === 'delete' || key === 'backspace') && designer.selectedUid.value) designer.remove(designer.selectedUid.value)
  else if (key === 'escape') designer.select(null)
  else return
  event.preventDefault()
}

async function openTemplate(file?: File) {
  file ??= await pickFile()
  if (!file) return
  try {
    const loaded = await readJsonFile(file)
    if (!looksLikeTemplate(loaded.value)) {
      throw new Error(`${file.name} não parece um template do ergo (falta version "v1", page ou sections).`)
    }
    template.value = loaded.value
    templateName.value = file.name.replace(/\.json$/i, '')
    fileError.value = null
  } catch (err) {
    fileError.value = err instanceof Error ? err.message : String(err)
  }
}

async function loadData(file?: File) {
  file ??= await pickFile()
  if (!file) return
  try {
    const loaded = await readJsonFile(file)
    data.value = loaded.value
    dataFile.value = { name: loaded.name, bytes: loaded.bytes }
    fileError.value = null
  } catch (err) {
    fileError.value = err instanceof Error ? err.message : String(err)
  }
}

function clearData() {
  data.value = undefined
  dataFile.value = null
}

function exportTemplate() {
  downloadJson(template.value, `${templateName.value}.json`)
}

/** Salva o PDF que está no preview: é o mesmo que o ergo gera em produção. */
function savePdf() {
  if (preview.pdf.value) downloadPdf(preview.pdf.value, `${templateName.value}.pdf`)
}

/** Solto no editor: template se tem cara de template, dados caso contrário. */
async function onDrop(event: DragEvent) {
  dragging.value = false
  designer.dragging.value = null
  const file = event.dataTransfer?.files[0]
  if (!file) return
  try {
    const loaded = await readJsonFile(file)
    if (looksLikeTemplate(loaded.value)) await openTemplate(file)
    else await loadData(file)
  } catch (err) {
    fileError.value = err instanceof Error ? err.message : String(err)
  }
}

function onDragOver(event: DragEvent) {
  if (designer.dragging.value || !event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  dragging.value = true
}
</script>

<template>
  <div
    class="ergo ergo-designer e-col"
    :data-ergo-theme="config.theme"
    ref="root"
    :style="config.tokens"
    tabindex="-1"
    @dragover="onDragOver"
    @dragleave.self="dragging = false"
    @drop.prevent="onDrop"
  >
    <header class="ergo-designer__toolbar e-row e-items-center e-gap-2 e-px-3 e-bg-surface e-border-b">
      <span class="e-text-title e-font-semibold e-px-1">ergo</span>
      <span class="e-text-label e-text-muted e-truncate ergo-designer__name" :title="templateName">{{ templateName }}</span>

      <span class="ergo-designer__sep" />
      <button type="button" class="ergo-btn" @click="openTemplate()">Abrir template</button>
      <button type="button" class="ergo-btn" @click="loadData()">Carregar dados</button>
      <button type="button" class="ergo-btn" title="Salva a spec do impresso (JSON)" @click="exportTemplate">Exportar</button>
      <button
        type="button"
        class="ergo-btn"
        :disabled="!preview.pdf.value"
        title="Salva o PDF que está no preview"
        @click="savePdf"
      >
        Baixar PDF
      </button>

      <span class="ergo-designer__sep" />
      <button type="button" class="ergo-btn ergo-btn--icon" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" :disabled="!designer.canUndo.value" @click="designer.undo()">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 3 2 6l3 3M2.5 6H9a3 3 0 0 1 0 6H6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <button type="button" class="ergo-btn ergo-btn--icon" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" :disabled="!designer.canRedo.value" @click="designer.redo()">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="m9 3 3 3-3 3m2.5-3H5a3 3 0 0 0 0 6h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>

      <div class="e-ml-auto e-row e-items-center e-gap-2">
        <span class="e-text-caption e-text-muted e-tabular e-nowrap" :class="{ 'e-text-danger': preview.failure.value }" aria-live="polite">
          {{ statusText }}
        </span>

        <button
          type="button"
          class="ergo-btn"
          :class="{
            'ergo-btn--danger': preview.issues.value.length > 0,
            'ergo-btn--warning': preview.issues.value.length === 0 && preview.warnings.value.length > 0,
          }"
          :aria-expanded="showProblems"
          @click="showProblems = !showProblems"
        >
          {{ problemCount === 0 ? 'Sem problemas' : `${problemCount} ${problemCount === 1 ? 'problema' : 'problemas'}` }}
        </button>

        <span class="ergo-designer__sep" />
        <div class="e-row e-items-center e-gap-1" role="group" aria-label="Zoom">
          <button type="button" class="ergo-btn ergo-btn--icon" aria-label="Diminuir zoom" :disabled="zoom <= ZOOMS[0]!" @click="stepZoom(-1)">−</button>
          <span class="e-text-caption e-tabular ergo-designer__zoom">{{ zoomLabel }}</span>
          <button type="button" class="ergo-btn ergo-btn--icon" aria-label="Aumentar zoom" :disabled="zoom >= ZOOMS[ZOOMS.length - 1]!" @click="stepZoom(1)">+</button>
          <button
            type="button"
            class="ergo-btn"
            :class="{ 'ergo-btn--on': zoomMode === 'fit' }"
            :aria-pressed="zoomMode === 'fit'"
            title="Ajustar a página à largura do preview"
            @click="zoomMode = 'fit'"
          >
            Ajustar
          </button>
        </div>
      </div>
    </header>

    <div v-if="fileError" class="ergo-designer__banner e-row e-items-center e-gap-3 e-px-4 e-py-2 e-text-label" role="alert">
      <span class="e-grow">{{ fileError }}</span>
      <button type="button" class="ergo-btn" @click="fileError = null">Fechar</button>
    </div>

    <div class="ergo-designer__body e-row e-grow e-min-h-0">
      <StructurePanel />

      <main class="ergo-designer__canvas e-grow e-min-w-0 e-relative e-bg-canvas" aria-label="Preview">
        <div ref="scroller" class="ergo-designer__scroll e-h-full e-overflow-auto">
          <PdfPages :pdf="preview.pdf.value" :zoom="zoom" :class="{ 'ergo-designer__stale': preview.status.value === 'failed' }" />

          <div v-if="!preview.pdf.value && preview.failure.value" class="ergo-designer__empty e-stack-2">
            <p class="e-text-body e-font-medium">O serviço de impressão não respondeu.</p>
            <p class="e-text-label e-text-muted e-mono">{{ preview.failure.value }}</p>
            <button type="button" class="ergo-btn" @click="preview.refresh()">Tentar de novo</button>
          </div>
        </div>

        <section v-if="showProblems" class="ergo-designer__problems e-bg-surface e-shadow-lg e-rounded-lg e-col" aria-label="Problemas">
          <div class="e-row e-items-center e-px-4 e-py-3 e-border-b">
            <span class="e-eyebrow">Problemas</span>
            <button type="button" class="ergo-btn e-ml-auto" @click="showProblems = false">Fechar</button>
          </div>
          <ul class="e-scroll-y e-grow">
            <li v-if="problemCount === 0" class="e-px-4 e-py-3 e-text-label e-text-muted">O ergo não apontou nada.</li>
            <li v-for="(issue, i) in preview.issues.value" :key="`i${i}`" class="ergo-designer__problem e-px-4 e-py-2 e-border-b" role="button" tabindex="0" @click="goToIssue(issue.path)" @keydown.enter="goToIssue(issue.path)">
              <p class="e-text-label"><span class="e-text-danger e-font-medium">Erro</span> · {{ issue.message }}</p>
              <p v-if="issue.path" class="e-text-caption e-text-muted e-mono">{{ issue.path }}</p>
            </li>
            <li v-for="(issue, i) in preview.warnings.value" :key="`w${i}`" class="ergo-designer__problem e-px-4 e-py-2 e-border-b" role="button" tabindex="0" @click="goToIssue(issue.path)" @keydown.enter="goToIssue(issue.path)">
              <p class="e-text-label"><span class="e-text-warning e-font-medium">Aviso</span> · {{ issue.message }}</p>
              <p v-if="issue.path" class="e-text-caption e-text-muted e-mono">{{ issue.path }}</p>
            </li>
          </ul>
        </section>
      </main>

      <PropertiesPanel />
    </div>

    <DataPanel :file="dataFile" :has-data="data !== undefined" @load="loadData()" @clear="clearData" />

    <div v-if="dragging" class="ergo-designer__drop e-row e-items-center e-justify-center" aria-hidden="true">
      <span class="e-text-body e-font-medium">Solte o JSON: template abre como impresso, qualquer outro vira dados</span>
    </div>
  </div>
</template>

<!--
  Tokens, base e utilitários entram por aqui e não por import no index.ts: um
  import de CSS em .ts vai parar no .d.ts publicado, apontando para um arquivo
  que não existe em dist/types.
-->
<style src="../styles/index.css"></style>

<style scoped>
.ergo-designer {
  position: relative;
  outline: none;
  height: 100%;
  min-height: 480px;
}

.ergo-designer__toolbar {
  height: var(--ergo-toolbar-height);
  flex-shrink: 0;
}

.ergo-designer__name {
  max-width: 220px;
}

.ergo-designer__sep {
  width: 1px;
  height: 20px;
  margin-inline: var(--ergo-space-1);
  background: var(--ergo-color-border);
}

.ergo-designer__zoom {
  min-width: 40px;
  text-align: center;
}

.ergo-designer__banner {
  flex-shrink: 0;
  color: var(--ergo-color-danger);
  background: var(--ergo-color-danger-soft);
}


.ergo-designer__scroll {
  padding: var(--ergo-space-8);
}

.ergo-designer__stale {
  opacity: 0.45;
  transition: opacity 120ms;
}

.ergo-designer__empty {
  max-width: 420px;
  margin: var(--ergo-space-12) auto 0;
  text-align: center;
}

.ergo-designer__problems {
  position: absolute;
  top: var(--ergo-space-3);
  right: var(--ergo-space-3);
  width: min(460px, calc(100% - 2 * var(--ergo-space-3)));
  max-height: calc(100% - 2 * var(--ergo-space-3));
}

.ergo-designer__problem {
  cursor: pointer;
}

.ergo-designer__problem:hover {
  background: var(--ergo-color-surface-hover);
}

.ergo-designer__problem:last-child {
  border-bottom: 0;
}

.ergo-designer__problem .e-mono {
  overflow-wrap: anywhere;
}



.ergo-designer__drop {
  position: absolute;
  inset: 0;
  z-index: 10;
  color: var(--ergo-color-accent-text);
  background: color-mix(in srgb, var(--ergo-color-accent-soft) 88%, transparent);
  border: 2px dashed var(--ergo-color-accent);
  pointer-events: none;
}









</style>
