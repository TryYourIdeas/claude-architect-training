import { describe, expect, it } from 'vitest'
import { DOMAINS, domainQuotas, EXAM, isCorrectSelection, isPass, scaleScore } from '~~/shared/exam'

describe('domainQuotas', () => {
  it('splits 60 items by blueprint weight and always sums to the total', () => {
    const q = domainQuotas(60)
    expect(Object.values(q).reduce((a, b) => a + b, 0)).toBe(60)
    expect(q).toEqual({ 1: 16, 2: 11, 3: 12, 4: 12, 5: 9 })
  })

  it('keeps the 10-item diagnostic proportional', () => {
    expect(domainQuotas(10)).toEqual({ 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 })
  })

  it('weights match the exam guide and total 100', () => {
    expect(DOMAINS.map(d => d.weight)).toEqual([27, 18, 20, 20, 15])
    expect(DOMAINS.reduce((s, d) => s + d.weight, 0)).toBe(100)
  })
})

describe('scaleScore and pass mark', () => {
  it('maps percent correct onto the 100–1000 scale', () => {
    expect(scaleScore(0, 60)).toBe(100)
    expect(scaleScore(60, 60)).toBe(1000)
    expect(scaleScore(30, 60)).toBe(550)
  })

  it('passes at 720 and fails just below it', () => {
    expect(scaleScore(41, 60)).toBe(715)
    expect(isPass(715)).toBe(false)
    expect(scaleScore(42, 60)).toBe(730)
    expect(isPass(730)).toBe(true)
    expect(isPass(720)).toBe(true)
  })

  it('matches the exam constraints', () => {
    expect(EXAM).toMatchObject({ items: 60, timeLimitMinutes: 120, scenariosDrawn: 4, scenarioBankSize: 6, passScaled: 720 })
  })
})

describe('isCorrectSelection', () => {
  it('is all-or-nothing for multiple response items', () => {
    expect(isCorrectSelection(['A', 'C'], ['C', 'A'])).toBe(true)
    expect(isCorrectSelection(['A', 'C'], ['A'])).toBe(false)
    expect(isCorrectSelection(['A', 'C'], ['A', 'B', 'C'])).toBe(false)
  })

  it('treats no selection as incorrect', () => {
    expect(isCorrectSelection(['B'], [])).toBe(false)
  })
})
