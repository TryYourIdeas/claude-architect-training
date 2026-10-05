import { DIAGNOSTIC, DOMAINS, EXAM, domainQuotas } from './exam'

export interface Question {
  id: string
  scenario: number
  domain: number
  taskStatement: string
  stem: string
  options: { key: string, text: string }[]
  correct: string[]
  selectCount: number
  explanation: string
}

export type Rng = () => number

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function pickScenarios(rng: Rng, count = EXAM.scenariosDrawn, bankSize = EXAM.scenarioBankSize): number[] {
  const all = Array.from({ length: bankSize }, (_, i) => i + 1)
  return shuffle(all, rng).slice(0, count).sort((a, b) => a - b)
}

/**
 * Fills per-domain quotas from `pool`. Shortfalls in a domain are topped up
 * from the remaining pool so the test still reaches `total` when possible.
 */
function fillQuotas(pool: readonly Question[], total: number, rng: Rng): { items: Question[], shortfall: number } {
  const quotas = domainQuotas(total)
  const chosen: Question[] = []
  const used = new Set<string>()

  for (const domain of DOMAINS) {
    const candidates = shuffle(pool.filter(q => q.domain === domain.id), rng)
    for (const q of candidates.slice(0, quotas[domain.id])) {
      chosen.push(q)
      used.add(q.id)
    }
  }

  const leftovers = shuffle(pool.filter(q => !used.has(q.id)), rng)
  while (chosen.length < total && leftovers.length > 0) {
    chosen.push(leftovers.shift()!)
  }

  return { items: chosen.slice(0, total), shortfall: Math.max(0, total - chosen.length) }
}

export interface PracticeAssembly {
  scenarios: number[]
  items: Question[]
  shortfall: number
}

export function assemblePractice(bank: readonly Question[], rng: Rng, scenarios = pickScenarios(rng)): PracticeAssembly {
  const pool = bank.filter(q => scenarios.includes(q.scenario))
  const { items, shortfall } = fillQuotas(pool, EXAM.items, rng)
  return { scenarios, items: shuffle(items, rng), shortfall }
}

export function assembleDiagnostic(bank: readonly Question[], rng: Rng): Question[] {
  const { items } = fillQuotas(bank, DIAGNOSTIC.items, rng)
  return shuffle(items, rng)
}

/**
 * Coaching session: one question per item, presented in random order.
 * With no domain, questions are balanced across all five domains by blueprint weight.
 * With a domain, the session draws only from that domain (and may be shorter than requested).
 */
export function assembleCoachSession(bank: readonly Question[], rng: Rng, size: number, domain: number | null): Question[] {
  if (domain === null) return fillQuotas(bank, size, rng).items
  const pool = shuffle(bank.filter(q => q.domain === domain), rng)
  return pool.slice(0, size)
}
