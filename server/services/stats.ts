import { CLEAR_WRONG_AFTER_RIGHT } from '~~/shared/exam'
import type { Db } from '../utils/db'

export interface Counters {
  shown: number
  right: number
  wrong: number
}

/**
 * Applies one answer to a question's counters.
 * - A wrong answer increments `wrong` and resets `right` to 0.
 * - A correct answer increments `right`. Reaching CLEAR_WRONG_AFTER_RIGHT correct answers in a row
 *   clears `wrong` to 0 and restarts the right count.
 */
export function applyAnswer(c: Counters, isCorrect: boolean): Counters {
  if (!isCorrect) return { shown: c.shown, right: 0, wrong: c.wrong + 1 }
  const right = c.right + 1
  if (right >= CLEAR_WRONG_AFTER_RIGHT) return { shown: c.shown, right: 0, wrong: 0 }
  return { shown: c.shown, right, wrong: c.wrong }
}

function ensureStats(db: Db, questionId: string): void {
  db.prepare('INSERT OR IGNORE INTO question_stats (question_id) VALUES (?)').run(questionId)
}

/** Counts a question as shown the first time it is presented in a coaching session. */
export function recordPresentation(db: Db, testId: string, questionId: string): void {
  db.transaction(() => {
    const inserted = db.prepare('INSERT OR IGNORE INTO coach_presentations (test_id, question_id) VALUES (?, ?)')
      .run(testId, questionId).changes
    if (inserted === 0) return
    ensureStats(db, questionId)
    db.prepare('UPDATE question_stats SET shown = shown + 1 WHERE question_id = ?').run(questionId)
  })()
}

/** Updates the right/wrong counters for one answered question. */
export function recordAnswer(db: Db, questionId: string, isCorrect: boolean): void {
  db.transaction(() => {
    ensureStats(db, questionId)
    const row = db.prepare('SELECT shown, right_count, wrong_count FROM question_stats WHERE question_id = ?')
      .get(questionId) as { shown: number, right_count: number, wrong_count: number }
    const next = applyAnswer({ shown: row.shown, right: row.right_count, wrong: row.wrong_count }, isCorrect)
    db.prepare('UPDATE question_stats SET right_count = ?, wrong_count = ? WHERE question_id = ?')
      .run(next.right, next.wrong, questionId)
  })()
}

/** Shown and wrong counters per question, used to prioritise coaching selection. */
export function loadStatMap(db: Db): Map<string, { shown: number, wrong: number }> {
  const rows = db.prepare('SELECT question_id, shown, wrong_count FROM question_stats').all() as
    { question_id: string, shown: number, wrong_count: number }[]
  return new Map(rows.map(r => [r.question_id, { shown: r.shown, wrong: r.wrong_count }]))
}

export interface QuestionStatRow {
  id: string
  domain: number
  taskStatement: string
  shown: number
  right: number
  wrong: number
}

export function listQuestionStats(db: Db): QuestionStatRow[] {
  return (db.prepare(`
    SELECT q.id, q.domain, q.task_statement, COALESCE(s.shown, 0) AS shown,
           COALESCE(s.right_count, 0) AS right_count, COALESCE(s.wrong_count, 0) AS wrong_count
    FROM questions q LEFT JOIN question_stats s ON s.question_id = q.id
    ORDER BY wrong_count DESC, shown ASC, q.id
  `).all() as { id: string, domain: number, task_statement: string, shown: number, right_count: number, wrong_count: number }[])
    .map(r => ({
      id: r.id,
      domain: r.domain,
      taskStatement: r.task_statement,
      shown: r.shown,
      right: r.right_count,
      wrong: r.wrong_count,
    }))
}
