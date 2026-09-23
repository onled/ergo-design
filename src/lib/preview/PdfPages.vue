<script setup lang="ts">
/*
 * Páginas do PDF desenhadas em canvas pelo pdf.js.
 *
 * Um <iframe> com o blob seria zero dependência, mas pisca a cada render e não
 * deixa sobrepor seleção (F3). Aqui o documento novo é desenhado fora da tela e
 * só troca de lugar com o anterior quando todas as páginas estão prontas.
 */
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'

const props = defineProps<{
  pdf: Uint8Array | null
  /** 1 = tamanho real (mm do papel em mm de tela, a 96dpi). */
  zoom?: number
}>()

const host = shallowRef<HTMLDivElement>()
const renderError = shallowRef<string | null>(null)

/** CSS px por ponto PDF: 96dpi da tela sobre 72pt por polegada. */
const PX_PER_PT = 96 / 72

let generation = 0
/** Destruir a tarefa de carga libera o documento no worker. */
let current: PDFDocumentLoadingTask | undefined

watch(
  () => [props.pdf, props.zoom] as const,
  async ([bytes, zoom]) => {
    const mine = ++generation
    if (!bytes) {
      host.value?.replaceChildren()
      return
    }
    try {
      const { pdfjs, worker } = await loadPdfjs()
      // getDocument transfere o buffer para o worker; a prop não pode ser consumida.
      const task = pdfjs.getDocument({ data: bytes.slice(), worker })
      const canvases = await drawAll(await task.promise, zoom ?? 1, () => mine !== generation)
      if (mine !== generation) {
        void task.destroy()
        return
      }
      host.value?.replaceChildren(...canvases)
      void current?.destroy()
      current = task
      renderError.value = null
    } catch (err) {
      if (mine === generation) renderError.value = err instanceof Error ? err.message : String(err)
    }
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  generation++
  void current?.destroy()
})

async function drawAll(doc: PDFDocumentProxy, zoom: number, stale: () => boolean): Promise<HTMLCanvasElement[]> {
  const ratio = window.devicePixelRatio || 1
  const out: HTMLCanvasElement[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    if (stale()) break
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: PX_PER_PT * zoom * ratio })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = `${viewport.width / ratio}px`
    canvas.style.height = `${viewport.height / ratio}px`
    canvas.className = 'ergo-pdf-pages__page'
    canvas.setAttribute('aria-label', `Página ${n} de ${doc.numPages}`)
    await page.render({ canvas, viewport }).promise
    out.push(canvas)
  }
  return out
}
</script>

<script lang="ts">
import type { PDFWorker } from 'pdfjs-dist'

let pdfjsPromise: Promise<{ pdfjs: typeof import('pdfjs-dist'); worker: PDFWorker }> | undefined

/**
 * pdf.js só carrega quando há o que desenhar, e uma vez por página. O worker é
 * um só: sem ele, cada render subia um worker novo, e isso custava mais que o
 * render inteiro no ergo.
 */
function loadPdfjs() {
  pdfjsPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
    ([pdfjs, workerUrl]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default
      return { pdfjs, worker: new pdfjs.PDFWorker() }
    },
  )
  return pdfjsPromise
}
</script>

<template>
  <div class="ergo-pdf-pages">
    <div ref="host" class="ergo-pdf-pages__host" />
    <p v-if="renderError" class="e-text-label e-text-danger">Não foi possível desenhar o PDF: {{ renderError }}</p>
  </div>
</template>

<style scoped>
.ergo-pdf-pages__host {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ergo-space-6);
}

/*
 * A página tem a largura do papel; quando não cabe, a área de preview rola.
 * Sem `max-width: none` o reset (`canvas { max-width: 100% }`) a encolheria na
 * horizontal sem mexer na altura, e o papel sairia achatado.
 */
.ergo-pdf-pages__host :deep(.ergo-pdf-pages__page) {
  display: block;
  flex-shrink: 0;
  max-width: none;
  background: var(--ergo-color-paper);
  box-shadow: var(--ergo-shadow-paper);
}
</style>
