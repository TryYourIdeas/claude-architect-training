import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '~~/server/utils/db'
import { buildReport, createTest, ExamError, getTestView, saveAnswer, submitTest } from '~~/server/services/exam'
import { EXAM } from '~~/shared/exam'

const QUESTIONS = resolve(__dirname, '../../data/questions.json')
const MINUTE = 60_000
const rng = (() => {
  let s = 12345
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
})()

let db: Db
beforeEach(() => {
  db = openDatabase(':memory:', QUESTIONS)
})
afterEach(() => db.close())

function answerKey(testId: string) {
  // Answer every item correctly using the bank's own key, so we can test scoring end to end.
  const view = getTestView(db, testId, 0)
  const rows = db.prepare('SELECT id, correct FROM questions').all() as { id: string, correct: string }[]
  const key = new Map(rows.map(r => [r.id, JSON.parse(r.correct) as string[]]))
  return { view, key }
}

describe('practice exam lifecycle', () => {
  it('creates a 60-item timed test and never exposes correct answers while in progress', () => {
    const now = 1_000_000
    const id = createTest(db, 'practice', now, rng)
    const view = getTestView(db, id, now)

    expect(view.items).toHaveLength(EXAM.items)
    expect(view.scenarios).toHaveLength(EXAM.scenariosDrawn)
    expect(view.remainingSeconds).toBe(EXAM.timeLimitMinutes * 60)
    expect(view.finished).toBe(false)
    expect(JSON.stringify(view)).not.toContain('"correct"')
    expect(JSON.stringify(view)).not.toContain('explanation')
  })

  it('rejects answers for questions outside the test and selections over selectCount', () => {
    const id = createTest(db, 'practice', 0, rng)
    const view = getTestView(db, id, 0)
    expect(() => saveAnswer(db, id, 'NOT-IN-TEST', ['A'], 0)).toThrow(ExamError)

    const multi = view.items.find(i => i.selectCount > 1)
    if (multi) {
      const keys = multi.options.map(o => o.key)
      expect(() => saveAnswer(db, id, multi.id, keys.slice(0, multi.selectCount + 1), 0)).toThrow(/Select at most/)
    }
  })

  it('scores a perfect attempt at 1000 and reports it as a pass', () => {
    const id = createTest(db, 'practice', 0, rng)
    const { view, key } = answerKey(id)
    for (const item of view.items) saveAnswer(db, id, item.id, key.get(item.id)!, 10)

    const report = submitTest(db, id, 20)
    expect(report.correctCount).toBe(EXAM.items)
    expect(report.scaledScore).toBe(1000)
    expect(report.passed).toBe(true)
    expect(report.domains.reduce((s, d) => s + d.total, 0)).toBe(EXAM.items)
  })

  it('treats partially correct multiple-response answers as wrong', () => {
    const id = createTest(db, 'practice', 0, rng)
    const { view, key } = answerKey(id)
    const multi = view.items.find(i => i.selectCount > 1)!
    saveAnswer(db, id, multi.id, [key.get(multi.id)![0]!], 1)

    const report = submitTest(db, id, 2)
    const item = report.items.find(i => i.id === multi.id)!
    expect(item.isCorrect).toBe(false)
  })

  it('finalizes automatically once the 120-minute deadline has passed', () => {
    const start = 0
    const id = createTest(db, 'practice', start, rng)
    const { view, key } = answerKey(id)
    saveAnswer(db, id, view.items[0]!.id, key.get(view.items[0]!.id)!, 1)

    const after = getTestView(db, id, EXAM.timeLimitMinutes * MINUTE + 1)
    expect(after.finished).toBe(true)
    expect(after.remainingSeconds).toBeNull()
    expect(() => saveAnswer(db, id, view.items[1]!.id, ['A'], EXAM.timeLimitMinutes * MINUTE + 2)).toThrow(/already finished/)
  })

  it('refuses to save answers after the deadline', () => {
    const id = createTest(db, 'practice', 0, rng)
    const { view } = answerKey(id)
    expect(() => saveAnswer(db, id, view.items[0]!.id, ['A'], EXAM.timeLimitMinutes * MINUTE + 1)).toThrow(ExamError)
  })

  it('does not report before the test is finished', () => {
    const id = createTest(db, 'practice', 0, rng)
    expect(() => buildReport(db, id)).toThrow(/not finished/)
  })
})

describe('diagnostic', () => {
  it('is untimed and has 10 items', () => {
    const id = createTest(db, 'diagnostic', 0, rng)
    const view = getTestView(db, id, 10 * 60 * MINUTE)
    expect(view.items).toHaveLength(10)
    expect(view.remainingSeconds).toBeNull()
    expect(view.finished).toBe(false)
    expect(view.scenarios).toBeNull()
  })
})
