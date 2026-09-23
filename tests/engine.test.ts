import { describe, expect, it } from 'vitest'
import { createHttpEngine } from '../src/lib/engine/engine'
import { createEmptyTemplate } from '../src/lib/spec/template'

function fakeFetch(res: Response, calls: { url: string; init: RequestInit }[] = []): typeof fetch {
  return async (input, init) => {
    calls.push({ url: String(input), init: init! })
    return res
  }
}

const signal = new AbortController().signal

describe('createHttpEngine', () => {
  it('renderiza e lê os cabeçalhos', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const res = new Response(new Blob(['%PDF']), { headers: { 'X-Report-Pages': '3', 'X-Template-Hash': 'abc' } })
    const engine = createHttpEngine('/api/', { fetch: fakeFetch(res, calls), headers: { 'X-Tenant': 't' } })
    const out = await engine.render({ template: createEmptyTemplate(), data: {} }, signal)
    expect(calls[0]!.url).toBe('/api/v1/reports/render')
    expect((calls[0]!.init.headers as Record<string, string>)['X-Tenant']).toBe('t')
    expect(out.ok && out.pages === 3 && out.templateHash === 'abc').toBe(true)
  })

  it('devolve os issues de uma recusa', async () => {
    const body = { error: { code: 'validation_error', message: 'x', issues: [{ path: 'template.page', message: 'm' }] } }
    const engine = createHttpEngine('', { fetch: fakeFetch(Response.json(body, { status: 422 })) })
    expect(await engine.validate(createEmptyTemplate(), signal)).toEqual({ ok: false, error: body.error })
  })

  it('aceita erro que não é do ergo', async () => {
    const engine = createHttpEngine('', { fetch: fakeFetch(new Response('slow down', { status: 429 })) })
    expect(await engine.validate(createEmptyTemplate(), signal)).toEqual({
      ok: false,
      error: { code: 'http_429', message: 'slow down', issues: [] },
    })
  })

  it('valida com warnings', async () => {
    const engine = createHttpEngine('', { fetch: fakeFetch(Response.json({ valid: true, hash: 'h' })) })
    expect(await engine.validate(createEmptyTemplate(), signal)).toEqual({ ok: true, hash: 'h', warnings: [] })
  })
})
