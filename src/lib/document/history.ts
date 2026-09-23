/*
 * Desfazer/refazer por snapshot. Um template tem kilobytes: guardar cópias do
 * documento custa pouco e não abre a classe de bug de comandos invertíveis que
 * desfazem quase certo.
 *
 * Digitação coalesce: commits seguidos com a mesma chave (um campo de um nó)
 * substituem o estado atual em vez de empilhar, e viram uma entrada só.
 * `seal()` — ao sair do campo — fecha a entrada.
 */

export interface History<T> {
  /** Estado atual. Não mutar: o próximo estado entra por `commit`. */
  readonly present: T
  readonly canUndo: boolean
  readonly canRedo: boolean
  /** Registra um estado novo. Com `coalesceKey` igual ao do commit anterior, funde. */
  commit(next: T, coalesceKey?: string): void
  /** Encerra a coalescência: o próximo commit abre entrada nova. */
  seal(): void
  undo(): T | undefined
  redo(): T | undefined
  /** Descarta o histórico, como ao abrir outro template. */
  reset(state: T): void
}

export interface HistoryOptions {
  /** Entradas de desfazer mantidas. Padrão: 200. */
  limit?: number
}

export function createHistory<T>(initial: T, options: HistoryOptions = {}): History<T> {
  const limit = options.limit ?? 200
  let past: T[] = []
  let future: T[] = []
  let present = structuredClone(initial)
  let openKey: string | undefined

  return {
    get present() {
      return present
    },
    get canUndo() {
      return past.length > 0
    },
    get canRedo() {
      return future.length > 0
    },

    commit(next, coalesceKey) {
      const snapshot = structuredClone(next)
      if (coalesceKey === undefined || coalesceKey !== openKey) {
        past.push(present)
        if (past.length > limit) past.shift()
      }
      present = snapshot
      future = []
      openKey = coalesceKey
    },

    seal() {
      openKey = undefined
    },

    undo() {
      const previous = past.pop()
      if (previous === undefined) return undefined
      future.push(present)
      present = previous
      openKey = undefined
      return present
    },

    redo() {
      const next = future.pop()
      if (next === undefined) return undefined
      past.push(present)
      present = next
      openKey = undefined
      return present
    },

    reset(state) {
      past = []
      future = []
      present = structuredClone(state)
      openKey = undefined
    },
  }
}
