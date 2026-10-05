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

export interface QuestionStat {
  shown: number
  wrong: number
}

export type StatLookup = (questionId: string) => QuestionStat | undefined

/**
 * Orders questions for coaching: most wrong answers first, then least shown.
 * Ties are broken randomly so repeated sessions do not always start the same way.
 */
export function prioritize(questions: readonly Question[], rng: Rng, stats: StatLookup = () => undefined): Question[] {
  return shuffle(questions, rng).sort((a, b) => {
    const sa = stats(a.id)
    const sb = stats(b.id)
    if ((sa?.wrong ?? 0) !== (sb?.wrong ?? 0)) return (sb?.wrong ?? 0) - (sa?.wrong ?? 0)
    return (sa?.shown ?? 0) - (sb?.shown ?? 0)
  })
}

/**
 * Fills per-domain quotas from `pool`. Shortfalls in a domain are topped up
 * from the remaining pool so the test still reaches `total` when possible.
 * `rank` decides which candidates within a domain are chosen first.
 */
function fillQuotas(
  pool: readonly Question[],
  total: number,
  rng: Rng,
  rank: (qs: readonly Question[]) => Question[] = qs => shuffle(qs, rng),
): { items: Question[], shortfall: number } {
  const quotas = domainQuotas(total)
  const chosen: Question[] = []
  const used = new Set<string>()

  for (const domain of DOMAINS) {
    const candidates = rank(pool.filter(q => q.domain === domain.id))
    for (const q of candidates.slice(0, quotas[domain.id])) {
      chosen.push(q)
      used.add(q.id)
    }
  }

  const leftovers = rank(pool.filter(q => !used.has(q.id)))
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
 * Questions are chosen by priority (most wrong, then least shown). With no domain, the
 * choice is balanced across all five domains by blueprint weight; with a domain, the
 * session draws only from that domain and may be shorter than requested.
 */
export function assembleCoachSession(
  bank: readonly Question[],
  rng: Rng,
  size: number,
  domain: number | null,
  stats: StatLookup = () => undefined,
): Question[] {
  const rank = (qs: readonly Question[]) => prioritize(qs, rng, stats)
  if (domain === null) return shuffle(fillQuotas(bank, size, rng, rank).items, rng)
  return shuffle(rank(bank.filter(q => q.domain === domain)).slice(0, size), rng)
}
