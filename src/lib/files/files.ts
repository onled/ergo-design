/*
 * Arquivos que entram e saem do editor: template (a spec) e dados de exemplo.
 */

import type { Template } from '../spec/template'

export interface LoadedJson {
  name: string
  bytes: number
  value: unknown
}

export async function readJsonFile(file: File): Promise<LoadedJson> {
  const text = await file.text()
  try {
    return { name: file.name, bytes: file.size, value: JSON.parse(text) as unknown }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`${file.name} não é um JSON válido: ${reason}`, { cause: err })
  }
}

/**
 * Só para decidir o que fazer com um arquivo solto no editor. Quem decide se o
 * template é válido é o ergo.
 */
export function looksLikeTemplate(value: unknown): value is Template {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return v.version === 'v1' && typeof v.sections === 'object' && typeof v.page === 'object'
}

export function downloadJson(value: unknown, fileName: string): void {
  download(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' }), fileName)
}

export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  download(new Blob([bytes as BlobPart], { type: 'application/pdf' }), fileName)
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function pickFile(accept = 'application/json,.json'): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('change', () => resolve(input.files?.[0]), { once: true })
    input.addEventListener('cancel', () => resolve(undefined), { once: true })
    input.click()
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}
