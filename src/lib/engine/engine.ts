/*
 * O editor não conhece a URL do ergo. Fala com um adaptador, e quem instala
 * decide o que há do outro lado: o servidor do Covalente (que autentica e
 * repassa) ou o proxy /api do ergo.onled.cloud. Nos dois casos o navegador só
 * fala com a própria origem, e o ergo não precisa de CORS.
 */

import type { ReportRequest, Template, ValidationIssue } from '../spec/template'

export type RenderRequest = ReportRequest

/**
 * Recusa do serviço: validação (422), limite (413), pedido inválido (400) ou
 * qualquer resposta de erro no caminho, como o rate limit de um proxy.
 */
export interface EngineError {
  /** Código do ergo (`validation_error`, `limit_exceeded`…) ou `http_<status>`. */
  code: string
  message: string
  issues: ValidationIssue[]
}

export type RenderResult =
  | { ok: true; pdf: Blob; pages: number; templateHash: string }
  | { ok: false; error: EngineError }

export type ValidateResult =
  | { ok: true; hash: string; warnings: ValidationIssue[] }
  | { ok: false; error: EngineError }

/**
 * Recusa volta como `ok: false`. Falha de rede e cancelamento rejeitam a
 * promessa — um preview cancelado não é um problema do template.
 */
export interface ErgoEngine {
  render(req: RenderRequest, signal: AbortSignal): Promise<RenderResult>
  validate(template: Template, signal: AbortSignal): Promise<ValidateResult>
}

export interface HttpEngineOptions {
  /** Cabeçalhos extras em cada chamada, como um token do host. */
  headers?: Record<string, string>
  /** Padrão: o `fetch` global. */
  fetch?: typeof fetch
}

/**
 * Adaptador para quem fala HTTP direto com o ergo, ou com algo que repassa a
 * mesma API: chama `${baseUrl}/v1/reports/render` e `${baseUrl}/v1/templates/validate`.
 */
export function createHttpEngine(baseUrl: string, options: HttpEngineOptions = {}): ErgoEngine {
  const base = baseUrl.replace(/\/+$/, '')
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))

  function post(path: string, body: unknown, signal: AbortSignal): Promise<Response> {
    return doFetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: JSON.stringify(body),
      signal,
    })
  }

  return {
    async render(req, signal) {
      const res = await post('/v1/reports/render', req, signal)
      if (!res.ok) return { ok: false, error: await readError(res) }
      return {
        ok: true,
        pdf: await res.blob(),
        pages: Number(res.headers.get('X-Report-Pages') ?? 0),
        templateHash: res.headers.get('X-Template-Hash') ?? '',
      }
    },

    async validate(template, signal) {
      const res = await post('/v1/templates/validate', { template }, signal)
      if (!res.ok) return { ok: false, error: await readError(res) }
      const body = (await res.json()) as { hash?: string; warnings?: ValidationIssue[] }
      return { ok: true, hash: body.hash ?? '', warnings: body.warnings ?? [] }
    },
  }
}

/** O ergo responde `{ error: { code, message, issues } }`; um proxy, qualquer coisa. */
async function readError(res: Response): Promise<EngineError> {
  const fallback: EngineError = { code: `http_${res.status}`, message: res.statusText, issues: [] }
  const text = await res.text()
  try {
    const error = (JSON.parse(text) as { error?: Partial<EngineError> }).error
    if (!error || typeof error.code !== 'string') return { ...fallback, message: text || fallback.message }
    return { code: error.code, message: error.message ?? '', issues: error.issues ?? [] }
  } catch {
    return { ...fallback, message: text || fallback.message }
  }
}
