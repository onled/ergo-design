/*
 * Preview: cada mudança de template ou de dados vira um render real no ergo.
 *
 * Edição chega em rajada (digitação, arrastar), então há debounce, e o render
 * que ficou velho é cancelado pelo AbortSignal em vez de chegar depois do novo
 * e sobrescrevê-lo. O PDF anterior continua na tela até o próximo existir.
 */

import { onScopeDispose, shallowRef, watch, type Ref } from 'vue'
import type { ErgoEngine } from '../engine/engine'
import type { RenderOptions, Template, ValidationIssue } from '../spec/template'

export type PreviewStatus = 'idle' | 'rendering' | 'ready' | 'failed'

export interface PreviewOptions {
  engine: ErgoEngine
  template: Ref<Template>
  /** `undefined` = sem dados: renderiza o esqueleto, com binds vazios. */
  data: Ref<unknown>
  locale: string
  /** Padrão: 250ms. */
  debounceMs?: number
}

export function usePreview(options: PreviewOptions) {
  const status = shallowRef<PreviewStatus>('idle')
  const pdf = shallowRef<Uint8Array | null>(null)
  const pages = shallowRef(0)
  const elapsedMs = shallowRef(0)
  /** Impedem o render: validação, bind que não resolve, limite. */
  const issues = shallowRef<ValidationIssue[]>([])
  /** Renderiza, mas provavelmente não é o que se quis. */
  const warnings = shallowRef<ValidationIssue[]>([])
  /** Falha que não é do template: rede, serviço fora, proxy. */
  const failure = shallowRef<string | null>(null)

  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined

  async function run() {
    controller?.abort()
    const current = new AbortController()
    controller = current
    const { signal } = current

    const template = options.template.value
    const hasData = options.data.value !== undefined
    const renderOptions: RenderOptions = { locale: options.locale, timezone: localTimezone() }
    if (!hasData) renderOptions.strictBindings = false

    status.value = 'rendering'
    const started = performance.now()
    try {
      const [render, validation] = await Promise.all([
        options.engine.render({ template, data: hasData ? options.data.value : {}, options: renderOptions }, signal),
        options.engine.validate(template, signal),
      ])
      if (signal.aborted) return

      warnings.value = validation.ok ? validation.warnings : []
      failure.value = null
      elapsedMs.value = Math.round(performance.now() - started)

      if (render.ok) {
        pdf.value = new Uint8Array(await render.pdf.arrayBuffer())
        if (signal.aborted) return
        pages.value = render.pages
        issues.value = []
        status.value = 'ready'
        return
      }
      // A validação fala do template; o render também dos dados. Mostra os dois
      // sem repetir o que ambos apontaram.
      const all = [...render.error.issues, ...(validation.ok ? [] : validation.error.issues)]
      issues.value = all.length > 0 ? dedupe(all) : [{ path: '', message: render.error.message }]
      status.value = 'failed'
    } catch (err) {
      if (signal.aborted) return
      failure.value = err instanceof Error ? err.message : String(err)
      status.value = 'failed'
    }
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(run, options.debounceMs ?? 250)
  }

  // Template muda em rajada (digitação); dados chegam de uma vez, num arquivo.
  watch(options.template, schedule, { deep: true })
  watch(options.data, run, { deep: true, immediate: true })

  onScopeDispose(() => {
    clearTimeout(timer)
    controller?.abort()
  })

  return { status, pdf, pages, elapsedMs, issues, warnings, failure, refresh: run }
}

function dedupe(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()
  return issues.filter((i) => {
    const key = `${i.path}\n${i.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** `@report.generatedAt` sai em UTC; o preview mostra a hora de quem olha. */
function localTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}
