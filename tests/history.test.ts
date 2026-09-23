import { describe, expect, it } from 'vitest'
import { createHistory } from '../src/lib/document/history'

describe('histórico', () => {
  it('desfaz e refaz', () => {
    const h = createHistory({ n: 0 })
    h.commit({ n: 1 })
    h.commit({ n: 2 })
    expect(h.undo()).toEqual({ n: 1 })
    expect(h.undo()).toEqual({ n: 0 })
    expect(h.undo()).toBeUndefined()
    expect(h.redo()).toEqual({ n: 1 })
    expect(h.canRedo).toBe(true)
  })

  it('commit novo descarta o refazer', () => {
    const h = createHistory({ n: 0 })
    h.commit({ n: 1 })
    h.undo()
    h.commit({ n: 9 })
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toEqual({ n: 0 })
  })

  it('coalesce digitação no mesmo campo até selar', () => {
    const h = createHistory({ s: '' })
    h.commit({ s: 'a' }, 'n1.text')
    h.commit({ s: 'ab' }, 'n1.text')
    h.commit({ s: 'abc' }, 'n1.text')
    h.seal()
    h.commit({ s: 'abcd' }, 'n1.text')
    expect(h.undo()).toEqual({ s: 'abc' })
    expect(h.undo()).toEqual({ s: '' })
  })

  it('campo diferente abre entrada nova', () => {
    const h = createHistory({ a: 0, b: 0 })
    h.commit({ a: 1, b: 0 }, 'a')
    h.commit({ a: 1, b: 1 }, 'b')
    expect(h.undo()).toEqual({ a: 1, b: 0 })
  })

  it('guarda cópia: mutar o objeto passado não altera o histórico', () => {
    const next = { n: 1 }
    const h = createHistory({ n: 0 })
    h.commit(next)
    next.n = 99
    expect(h.present).toEqual({ n: 1 })
  })

  it('respeita o limite', () => {
    const h = createHistory(0, { limit: 2 })
    for (let i = 1; i <= 5; i++) h.commit(i)
    expect(h.undo()).toBe(4)
    expect(h.undo()).toBe(3)
    expect(h.undo()).toBeUndefined()
  })
})
