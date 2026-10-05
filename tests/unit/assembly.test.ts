import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assembleDiagnostic, assemblePractice, pickScenarios, type Question } from '~~/shared/assembly'
import { DIAGNOSTIC, DOMAINS, domainQuotas, EXAM } from '~~/shared/exam'

const bank = JSON.parse(readFileSync(resolve(__dirname, '../../data/questions.json'), 'utf8')) as Question[]

// Deterministic PRNG so assembly results are reproducible in tests.
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('question bank', () => {
  it('has unique ids', () => {
    expect(new Set(bank.map(q => q.id)).size).toBe(bank.length)
  })

  it('has at least 15 questions in each of the 6 scenarios', () => {
    for (let s = 1; s <= EXAM.scenarioBankSize; s++) {
      expect(bank.filter(q => q.scenario === s).length).toBeGreaterThanOrEqual(15)
    }
  })

  it('covers every task statement in the exam guide at least twice', () => {
    const tasks = ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '2.1', '2.2', '2.3', '2.4', '2.5',
      '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6',
      '5.1', '5.2', '5.3', '5.4', '5.5', '5.6']
    for (const t of tasks) {
      expect(bank.filter(q => q.taskStatement === t).length, `task ${t}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('covers every domain', () => {
    for (const d of DOMAINS) {
      expect(bank.some(q => q.domain === d.id)).toBe(true)
    }
  })

  it('has consistent answer keys and selectCount for every item', () => {
    for (const q of bank) {
      const keys = q.options.map(o => o.key)
      expect(new Set(keys).size).toBe(keys.length)
      expect(q.correct.every(k => keys.includes(k))).toBe(true)
      expect(q.correct).toHaveLength(q.selectCount)
      expect(q.explanation.length).toBeGreaterThan(0)
    }
  })

  it('never declares more correct answers than the selectCount allows', () => {
    const multi = bank.filter(q => q.selectCount > 1)
    expect(multi.length).toBeGreaterThan(0)
    for (const q of multi) expect(q.correct.length).toBe(q.selectCount)
  })
})

describe('assemblePractice', () => {
  it('draws exactly 4 distinct scenarios from the 6', () => {
    const scenarios = pickScenarios(seeded(7))
    expect(scenarios).toHaveLength(EXAM.scenariosDrawn)
    expect(new Set(scenarios).size).toBe(EXAM.scenariosDrawn)
    scenarios.forEach(s => expect(s).toBeGreaterThanOrEqual(1))
    scenarios.forEach(s => expect(s).toBeLessThanOrEqual(EXAM.scenarioBankSize))
  })

  it('builds a 60-item test drawn only from the chosen scenarios with no duplicates', () => {
    const scenarios = [1, 3, 4, 6]
    const { items, shortfall } = assemblePractice(bank, seeded(42), scenarios)
    expect(items).toHaveLength(EXAM.items)
    expect(shortfall).toBe(0)
    expect(items.every(q => scenarios.includes(q.scenario))).toBe(true)
    expect(new Set(items.map(q => q.id)).size).toBe(EXAM.items)
  })

  it('reports a shortfall when the chosen scenarios cannot supply 60 items', () => {
    const pool = bank.filter(q => q.scenario === 1).length
    const { items, shortfall } = assemblePractice(bank, seeded(1), [1])
    expect(items).toHaveLength(Math.min(EXAM.items, pool))
    expect(shortfall).toBe(EXAM.items - Math.min(EXAM.items, pool))
  })

  it('represents each domain at its blueprint quota when the pool allows', () => {
    const scenarios = [2, 5, 6, 3]
    const { items } = assemblePractice(bank, seeded(99), scenarios)
    const quotas = domainQuotas(EXAM.items)
    const pool = bank.filter(q => scenarios.includes(q.scenario))
    for (const d of DOMAINS) {
      const available = pool.filter(q => q.domain === d.id).length
      const got = items.filter(q => q.domain === d.id).length
      // Each domain meets its quota up to what the pool can supply; top-ups may add more.
      expect(got).toBeGreaterThanOrEqual(Math.min(quotas[d.id]!, available))
    }
  })
})

describe('assembleDiagnostic', () => {
  it('draws 10 unique items spanning the domains by blueprint weight', () => {
    const items = assembleDiagnostic(bank, seeded(3))
    expect(items).toHaveLength(DIAGNOSTIC.items)
    expect(new Set(items.map(q => q.id)).size).toBe(DIAGNOSTIC.items)
    const quotas = domainQuotas(DIAGNOSTIC.items)
    for (const d of DOMAINS) {
      expect(items.filter(q => q.domain === d.id)).toHaveLength(quotas[d.id]!)
    }
  })
})
