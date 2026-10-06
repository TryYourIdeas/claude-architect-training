import type { Db } from '~~/server/utils/db'
import { orderedItemsFor } from '~~/server/services/exam'

/**
 * The answer key as one attempt shows it: correct and wrong letters per question, in the
 * learner's displayed order. Each attempt shuffles options, so tests must ask the attempt.
 */
export function presentedKey(db: Db, testId: string): Map<string, { correct: string[], wrong: string[] }> {
  return new Map(orderedItemsFor(db, testId).map(({ presented: q }) => {
    const keys = q.options.map(o => o.key)
    return [q.id, { correct: [...q.correct], wrong: keys.filter(k => !q.correct.includes(k)) }]
  }))
}

/** A selection of the right size that differs from the correct answer, in displayed letters. */
export function wrongSelection(db: Db, testId: string, questionId: string): string[] {
  const { correct, wrong } = presentedKey(db, testId).get(questionId)!
  return [wrong[0]!, ...correct.slice(1)].slice(0, correct.length)
}
