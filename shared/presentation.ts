import { shuffle, type Question, type Rng } from './assembly'

/**
 * Options are stored with fixed keys (A–E) in the question bank. Each attempt shows them in a
 * random order and relabels them A, B, C… in that order. An "order" is the list of stored keys in
 * the sequence the learner sees them, for example ["C", "A", "D", "B"] shows stored C as A.
 */
export const DISPLAY_KEYS = ['A', 'B', 'C', 'D', 'E'] as const

/** A random presentation order for one question. */
export function randomOrder(question: Pick<Question, 'options'>, rng: Rng): string[] {
  return shuffle(question.options.map(o => o.key), rng)
}

/** The stored order, used for questions presented before shuffling existed. */
export function identityOrder(question: Pick<Question, 'options'>): string[] {
  return question.options.map(o => o.key)
}

/** Question as the learner sees it: options in the given order, relabelled A, B, C…. */
export function presentQuestion(question: Question, order: readonly string[]): Question {
  const textByKey = new Map(question.options.map(o => [o.key, o.text]))
  const displayOf = new Map(order.map((key, i) => [key, DISPLAY_KEYS[i]!]))
  return {
    ...question,
    options: order.map((key, i) => ({ key: DISPLAY_KEYS[i]!, text: textByKey.get(key) ?? '' })),
    correct: question.correct.map(key => displayOf.get(key) ?? key).sort(),
  }
}

/** Learner's selection (displayed letters) → stored keys. */
export function toStoredKeys(displayed: readonly string[], order: readonly string[]): string[] {
  return displayed.map(d => order[DISPLAY_KEYS.indexOf(d as (typeof DISPLAY_KEYS)[number])] ?? d).sort()
}

/** Stored keys → displayed letters, for showing an answer in the order the learner saw. */
export function toDisplayedKeys(stored: readonly string[], order: readonly string[]): string[] {
  return stored.map(key => DISPLAY_KEYS[order.indexOf(key)] ?? key).sort()
}
