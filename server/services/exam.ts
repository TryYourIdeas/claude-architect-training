import { randomUUID } from 'node:crypto'
import { assembleDiagnostic, assemblePractice, type Question, type Rng } from '~~/shared/assembly'
import { identityOrder, presentQuestion, randomOrder, toDisplayedKeys, toStoredKeys } from '~~/shared/presentation'
import { DOMAINS, EXAM, isCorrectSelection, isPass, SCALE_NOTE, SCENARIOS, scaleScore } from '~~/shared/exam'
import type { Db } from '../utils/db'
import { rowToQuestion } from '../utils/db'

export type TestMode = 'diagnostic' | 'practice' | 'coaching'

export class ExamError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

export interface TestRow {
  id: string
  mode: TestMode
  scenarios: string | null
  domain: number | null
  created_at: number
  deadline_at: number | null
  finished_at: number | null
  correct_count: number | null
  total_items: number | null
  scaled_score: number | null
  passed: number | null
}

export interface PublicItem {
  position: number
  id: string
  scenario: number
  domain: number
  taskStatement: string
  stem: string
  options: Question['options']
  selectCount: number
}

export interface TestView {
  id: string
  mode: TestMode
  scenarios: number[] | null
  finished: boolean
  deadlineAt: number | null
  remainingSeconds: number | null
  items: PublicItem[]
  answers: Record<string, string[]>
}

export interface DomainResult {
  domain: number
  name: string
  correct: number
  total: number
  percent: number
}

export interface ReportItem {
  position: number
  id: string
  domain: number
  taskStatement: string
  stem: string
  options: Question['options']
  selectCount: number
  selected: string[]
  correct: string[]
  isCorrect: boolean
  explanation: string
}

export interface Report {
  id: string
  mode: TestMode
  scenarios: number[] | null
  scenarioNames: string[]
  totalItems: number
  correctCount: number
  scaledScore: number
  passScaled: number
  passed: boolean
  scaleNote: string
  domains: DomainResult[]
  items: ReportItem[]
}

export function loadQuestions(db: Db): Question[] {
  return (db.prepare('SELECT * FROM questions').all() as Parameters<typeof rowToQuestion>[0][]).map(rowToQuestion)
}

export function getTestRow(db: Db, id: string): TestRow {
  const row = db.prepare('SELECT * FROM tests WHERE id = ?').get(id) as TestRow | undefined
  if (!row) throw new ExamError(404, 'Test not found')
  return row
}

export function itemsFor(db: Db, id: string): Question[] {
  return (db.prepare(`
    SELECT q.* FROM test_items ti JOIN questions q ON q.id = ti.question_id
    WHERE ti.test_id = ? ORDER BY ti.position
  `).all(id) as Parameters<typeof rowToQuestion>[0][]).map(rowToQuestion)
}

/** Answers keyed by question id, in stored keys (A–E as written in the question bank). */
export function answersFor(db: Db, id: string): Record<string, string[]> {
  const rows = db.prepare('SELECT question_id, selected FROM test_answers WHERE test_id = ?').all(id) as { question_id: string, selected: string }[]
  return Object.fromEntries(rows.map(r => [r.question_id, JSON.parse(r.selected) as string[]]))
}

export interface OrderedItem {
  /** The question as stored in the bank. */
  stored: Question
  /** Stored option keys in the order this attempt shows them. */
  order: string[]
  /** The question as the learner sees it: options relabelled A, B, C… in `order`. */
  presented: Question
}

/** Items of an attempt in position order, with the option order each one was shown in. */
export function orderedItemsFor(db: Db, id: string): OrderedItem[] {
  const rows = db.prepare(`
    SELECT q.*, ti.option_order AS option_order FROM test_items ti JOIN questions q ON q.id = ti.question_id
    WHERE ti.test_id = ? ORDER BY ti.position
  `).all(id) as (Parameters<typeof rowToQuestion>[0] & { option_order: string | null })[]

  return rows.map((r) => {
    const stored = rowToQuestion(r)
    const order = r.option_order ? (JSON.parse(r.option_order) as string[]) : identityOrder(stored)
    return { stored, order, presented: presentQuestion(stored, order) }
  })
}

/** Answers keyed by question id, in the letters the learner saw. */
export function displayedAnswersFor(db: Db, id: string): Record<string, string[]> {
  const stored = answersFor(db, id)
  const out: Record<string, string[]> = {}
  for (const item of orderedItemsFor(db, id)) {
    const answer = stored[item.stored.id]
    if (answer) out[item.stored.id] = toDisplayedKeys(answer, item.order)
  }
  return out
}

export function createTest(db: Db, mode: Exclude<TestMode, 'coaching'>, now = Date.now(), rng: Rng = Math.random): string {
  const bank = loadQuestions(db)
  if (bank.length === 0) throw new ExamError(500, 'Question bank is empty')

  let items: Question[]
  let scenarios: number[] | null = null
  let deadlineAt: number | null = null

  if (mode === 'practice') {
    const assembled = assemblePractice(bank, rng)
    items = assembled.items
    scenarios = assembled.scenarios
    deadlineAt = now + EXAM.timeLimitMinutes * 60_000
  }
  else {
    items = assembleDiagnostic(bank, rng)
  }

  const id = randomUUID()
  const insertTest = db.prepare(`
    INSERT INTO tests (id, mode, scenarios, created_at, deadline_at) VALUES (?, ?, ?, ?, ?)
  `)
  const insertItem = db.prepare('INSERT INTO test_items (test_id, position, question_id, option_order) VALUES (?, ?, ?, ?)')

  db.transaction(() => {
    insertTest.run(id, mode, scenarios ? JSON.stringify(scenarios) : null, now, deadlineAt)
    items.forEach((q, i) => insertItem.run(id, i + 1, q.id, JSON.stringify(randomOrder(q, rng))))
  })()

  return id
}

export function scoreTest(db: Db, id: string, now = Date.now()): Report {
  const row = getTestRow(db, id)
  if (row.finished_at !== null) return buildReport(db, id)

  const items = itemsFor(db, id)
  const answers = answersFor(db, id)
  const correctCount = items.filter(q => isCorrectSelection(q.correct, answers[q.id] ?? [])).length
  const scaled = scaleScore(correctCount, items.length)

  db.prepare(`
    UPDATE tests SET finished_at = ?, correct_count = ?, total_items = ?, scaled_score = ?, passed = ? WHERE id = ?
  `).run(now, correctCount, items.length, scaled, isPass(scaled) ? 1 : 0, id)

  return buildReport(db, id)
}

/** Finalizes the test automatically once its deadline has passed. */
function expireIfNeeded(db: Db, row: TestRow, now: number): TestRow {
  if (row.finished_at === null && row.deadline_at !== null && now > row.deadline_at) {
    scoreTest(db, row.id, row.deadline_at)
    return getTestRow(db, row.id)
  }
  return row
}

export function getTestView(db: Db, id: string, now = Date.now()): TestView {
  const row = expireIfNeeded(db, getTestRow(db, id), now)
  const items = orderedItemsFor(db, id)

  return {
    id: row.id,
    mode: row.mode,
    scenarios: row.scenarios ? JSON.parse(row.scenarios) : null,
    finished: row.finished_at !== null,
    deadlineAt: row.deadline_at,
    remainingSeconds: row.deadline_at !== null && row.finished_at === null
      ? Math.max(0, Math.floor((row.deadline_at - now) / 1000))
      : null,
    items: items.map(({ presented: q }, i) => ({
      position: i + 1,
      id: q.id,
      scenario: q.scenario,
      domain: q.domain,
      taskStatement: q.taskStatement,
      stem: q.stem,
      options: q.options,
      selectCount: q.selectCount,
    })),
    answers: displayedAnswersFor(db, id),
  }
}

export function saveAnswer(db: Db, id: string, questionId: string, selected: string[], now = Date.now()): void {
  const row = expireIfNeeded(db, getTestRow(db, id), now)
  if (row.finished_at !== null) throw new ExamError(409, 'Test is already finished')

  const item = orderedItemsFor(db, id).find(i => i.stored.id === questionId)
  if (!item) throw new ExamError(400, 'Question is not part of this test')
  const { presented: question, order } = item

  // The learner answers with the letters they see; store the original keys.
  const unique = [...new Set(selected)]
  const validKeys = new Set(question.options.map(o => o.key))
  if (unique.some(k => !validKeys.has(k))) throw new ExamError(400, 'Unknown option key')
  if (unique.length > question.selectCount) {
    throw new ExamError(400, `Select at most ${question.selectCount} option(s)`)
  }

  db.prepare(`
    INSERT INTO test_answers (test_id, question_id, selected, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(test_id, question_id) DO UPDATE SET selected = excluded.selected, updated_at = excluded.updated_at
  `).run(id, questionId, JSON.stringify(toStoredKeys(unique, order)), now)
}

export function submitTest(db: Db, id: string, now = Date.now()): Report {
  const row = expireIfNeeded(db, getTestRow(db, id), now)
  if (row.finished_at !== null) return buildReport(db, id)
  return scoreTest(db, row.id, now)
}

export function buildReport(db: Db, id: string): Report {
  const row = getTestRow(db, id)
  if (row.finished_at === null) throw new ExamError(409, 'Test is not finished yet')

  const items = orderedItemsFor(db, id)
  const answers = answersFor(db, id)

  const reportItems: ReportItem[] = items.map(({ stored, order, presented: q }, i) => {
    const storedSelected = answers[stored.id] ?? []
    return {
      position: i + 1,
      id: q.id,
      domain: q.domain,
      taskStatement: q.taskStatement,
      stem: q.stem,
      options: q.options,
      selectCount: q.selectCount,
      selected: toDisplayedKeys(storedSelected, order),
      correct: q.correct,
      isCorrect: isCorrectSelection(stored.correct, storedSelected),
      explanation: q.explanation,
    }
  })

  const domains: DomainResult[] = DOMAINS.map((d) => {
    const inDomain = reportItems.filter(i => i.domain === d.id)
    const correct = inDomain.filter(i => i.isCorrect).length
    return {
      domain: d.id,
      name: d.name,
      correct,
      total: inDomain.length,
      percent: inDomain.length ? Math.round((correct / inDomain.length) * 100) : 0,
    }
  }).filter(d => d.total > 0)

  const scenarios: number[] | null = row.scenarios ? JSON.parse(row.scenarios) : null

  return {
    id: row.id,
    mode: row.mode,
    scenarios,
    scenarioNames: scenarios ? scenarios.map(s => SCENARIOS[s] ?? `Scenario ${s}`) : [],
    totalItems: row.total_items ?? items.length,
    correctCount: row.correct_count ?? 0,
    scaledScore: row.scaled_score ?? EXAM.scaleMin,
    passScaled: EXAM.passScaled,
    passed: row.passed === 1,
    scaleNote: SCALE_NOTE,
    domains,
    items: reportItems,
  }
}

export function listTests(db: Db, limit = 5): Array<{ id: string, mode: TestMode, createdAt: number, finished: boolean, scaledScore: number | null, passed: boolean | null }> {
  const rows = db.prepare('SELECT * FROM tests ORDER BY created_at DESC LIMIT ?').all(limit) as TestRow[]
  return rows.map(r => ({
    id: r.id,
    mode: r.mode,
    createdAt: r.created_at,
    finished: r.finished_at !== null,
    scaledScore: r.scaled_score,
    passed: r.passed === null ? null : r.passed === 1,
  }))
}
