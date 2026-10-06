import { randomUUID } from 'node:crypto'
import { assembleCoachSession, type Question, type Rng } from '~~/shared/assembly'
import { COACH, DOMAINS, isCorrectSelection } from '~~/shared/exam'
import { randomOrder, toStoredKeys } from '~~/shared/presentation'
import { loadStatMap, recordAnswer, recordPresentation } from './stats'
import type { Db } from '../utils/db'
import { answersFor, buildReport, ExamError, getTestRow, loadQuestions, orderedItemsFor, type PublicItem, type Report, scoreTest } from './exam'

export interface CoachFeedback {
  questionId: string
  position: number
  isCorrect: boolean
  selected: string[]
  correct: string[]
  explanation: string
  taskStatement: string
  domain: number
  domainName: string
}

export interface CoachView {
  id: string
  domain: number | null
  domainName: string | null
  total: number
  answered: number
  finished: boolean
  /** The next unanswered question, or null once the session is complete. */
  current: PublicItem | null
}

function domainName(id: number): string {
  return DOMAINS.find(d => d.id === id)?.name ?? `Domain ${id}`
}

function ensureCoaching(db: Db, id: string) {
  const row = getTestRow(db, id)
  if (row.mode !== 'coaching') throw new ExamError(404, 'Coaching session not found')
  return row
}

export function createCoachSession(
  db: Db,
  options: { domain: number | null, size?: number },
  now = Date.now(),
  rng: Rng = Math.random,
): string {
  const size = options.size ?? COACH.defaultSize
  if (!Number.isInteger(size) || size < COACH.minSize || size > COACH.maxSize) {
    throw new ExamError(400, `size must be between ${COACH.minSize} and ${COACH.maxSize}`)
  }
  if (options.domain !== null && !DOMAINS.some(d => d.id === options.domain)) {
    throw new ExamError(400, 'domain must be 1–5 or null for all domains')
  }

  const stats = loadStatMap(db)
  const items = assembleCoachSession(loadQuestions(db), rng, size, options.domain, id => stats.get(id))
  if (items.length === 0) throw new ExamError(400, 'No questions available for that domain')

  const id = randomUUID()
  db.transaction(() => {
    db.prepare('INSERT INTO tests (id, mode, domain, created_at) VALUES (?, ?, ?, ?)')
      .run(id, 'coaching', options.domain, now)
    const insertItem = db.prepare('INSERT INTO test_items (test_id, position, question_id, option_order) VALUES (?, ?, ?, ?)')
    items.forEach((q, i) => insertItem.run(id, i + 1, q.id, JSON.stringify(randomOrder(q, rng))))
  })()
  return id
}

export function getCoachView(db: Db, id: string): CoachView {
  const row = ensureCoaching(db, id)
  const items = orderedItemsFor(db, id)
  const answers = answersFor(db, id)
  const index = items.findIndex(({ stored }) => !(stored.id in answers))
  const next = index === -1 ? null : items[index]!.presented

  if (next && row.finished_at === null) recordPresentation(db, id, next.id)

  return {
    id,
    domain: row.domain,
    domainName: row.domain === null ? null : domainName(row.domain),
    total: items.length,
    answered: items.length - items.filter(({ stored }) => !(stored.id in answers)).length,
    finished: row.finished_at !== null,
    current: next && row.finished_at === null
      ? {
          position: index + 1,
          id: next.id,
          scenario: next.scenario,
          domain: next.domain,
          taskStatement: next.taskStatement,
          stem: next.stem,
          options: next.options,
          selectCount: next.selectCount,
        }
      : null,
  }
}

/**
 * Locks in the answer to the current question and returns feedback immediately.
 * Answering the final question completes the session.
 */
export function answerCoachQuestion(
  db: Db,
  id: string,
  questionId: string,
  selected: string[],
  now = Date.now(),
): CoachFeedback {
  const row = ensureCoaching(db, id)
  if (row.finished_at !== null) throw new ExamError(409, 'Session is already complete')

  const items = orderedItemsFor(db, id)
  const answers = answersFor(db, id)
  const index = items.findIndex(({ stored }) => !(stored.id in answers))
  if (index === -1) throw new ExamError(409, 'Session is already complete')
  const { stored, order, presented: current } = items[index]!
  if (stored.id !== questionId) throw new ExamError(409, 'Answer the current question first')

  // The learner answers with the letters they see; compare and store in stored keys.
  const unique = [...new Set(selected)].sort()
  const validKeys = new Set(current.options.map(o => o.key))
  if (unique.some(k => !validKeys.has(k))) throw new ExamError(400, 'Unknown option key')
  if (unique.length !== current.selectCount) {
    throw new ExamError(400, `Select exactly ${current.selectCount} option(s)`)
  }

  const storedSelected = toStoredKeys(unique, order)
  const isCorrect = isCorrectSelection(stored.correct, storedSelected)
  const remaining = items.length - Object.keys(answers).length - 1

  db.transaction(() => {
    db.prepare('INSERT INTO test_answers (test_id, question_id, selected, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, questionId, JSON.stringify(storedSelected), now)
    recordAnswer(db, questionId, isCorrect)
    if (remaining === 0) scoreTest(db, id, now)
  })()

  return toFeedback(current, unique, index + 1)
}

function toFeedback(q: Question, selected: string[], position: number): CoachFeedback {
  return {
    questionId: q.id,
    position,
    isCorrect: isCorrectSelection(q.correct, selected),
    selected,
    correct: q.correct,
    explanation: q.explanation,
    taskStatement: q.taskStatement,
    domain: q.domain,
    domainName: domainName(q.domain),
  }
}

export function getCoachSummary(db: Db, id: string): Report {
  const row = ensureCoaching(db, id)
  if (row.finished_at === null) throw new ExamError(409, 'Session is not complete yet')
  return buildReport(db, id)
}
