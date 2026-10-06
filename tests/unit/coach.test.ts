import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '~~/server/utils/db'
import { presentedKey, wrongSelection } from '../helpers/presented'
import { answerCoachQuestion, createCoachSession, getCoachSummary, getCoachView } from '~~/server/services/coach'
import { ExamError, getTestRow } from '~~/server/services/exam'
import { COACH, DOMAINS } from '~~/shared/exam'

const QUESTIONS = resolve(__dirname, '../../data/questions.json')
const rng = (() => {
  let s = 99
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

function answerKey(sessionId: string): Map<string, string[]> {
  return new Map([...presentedKey(db, sessionId)].map(([qid, k]) => [qid, k.correct]))
}

function wrongFor(sessionId: string, questionId: string): string[] {
  return wrongSelection(db, sessionId, questionId)
}

describe('coaching session creation', () => {
  it('defaults to 10 questions balanced across all domains', () => {
    const id = createCoachSession(db, { domain: null }, 0, rng)
    const view = getCoachView(db, id)
    expect(view.total).toBe(COACH.defaultSize)
    expect(view.domain).toBeNull()
    expect(view.current).not.toBeNull()
    expect(view.current!.position).toBe(1)
  })

  it('draws only from the requested domain', () => {
    const id = createCoachSession(db, { domain: 2, size: 5 }, 0, rng)
    const items = db.prepare(`
      SELECT q.domain FROM test_items ti JOIN questions q ON q.id = ti.question_id WHERE ti.test_id = ?
    `).all(id) as { domain: number }[]
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(i => i.domain === 2)).toBe(true)
    expect(getCoachView(db, id).domainName).toBe(DOMAINS[1]!.name)
  })

  it('rejects an invalid domain or size', () => {
    expect(() => createCoachSession(db, { domain: 9 }, 0, rng)).toThrow(ExamError)
    expect(() => createCoachSession(db, { domain: null, size: 0 }, 0, rng)).toThrow(/size must be/)
    expect(() => createCoachSession(db, { domain: null, size: COACH.maxSize + 1 }, 0, rng)).toThrow(/size must be/)
  })
})

describe('one question at a time with immediate feedback', () => {
  it('serves the next unanswered question only, and locks an answer once given', () => {
    const id = createCoachSession(db, { domain: null, size: 3 }, 0, rng)
    const first = getCoachView(db, id).current!
    const key = answerKey(id).get(first.id)!

    const feedback = answerCoachQuestion(db, id, first.id, key, 1)
    expect(feedback.isCorrect).toBe(true)
    expect(feedback.correct).toEqual(key)
    expect(feedback.explanation.length).toBeGreaterThan(0)

    const after = getCoachView(db, id)
    expect(after.answered).toBe(1)
    expect(after.current!.id).not.toBe(first.id)
    expect(after.current!.position).toBe(2)

    // The answered question cannot be answered again.
    expect(() => answerCoachQuestion(db, id, first.id, key, 2)).toThrow(/current question/)
  })

  it('returns feedback marking an incorrect answer', () => {
    const id = createCoachSession(db, { domain: null, size: 1 }, 0, rng)
    const q = getCoachView(db, id).current!
    const feedback = answerCoachQuestion(db, id, q.id, wrongFor(id, q.id), 1)
    expect(feedback.isCorrect).toBe(false)
  })

  it('requires exactly selectCount options for multiple-response items', () => {
    const id = createCoachSession(db, { domain: null, size: 30 }, 0, rng)
    const key = answerKey(id)
    let step = 1
    // Answer single-response questions correctly until a multiple-response one is served.
    let current = getCoachView(db, id).current!
    while (current.selectCount === 1) {
      answerCoachQuestion(db, id, current.id, key.get(current.id)!, step++)
      current = getCoachView(db, id).current!
    }
    const correct = key.get(current.id)!
    expect(() => answerCoachQuestion(db, id, current.id, [correct[0]!], step)).toThrow(/Select exactly/)
    expect(() => answerCoachQuestion(db, id, current.id, correct, step)).not.toThrow()
  })

  it('rejects unknown option keys', () => {
    const id = createCoachSession(db, { domain: null, size: 1 }, 0, rng)
    const q = getCoachView(db, id).current!
    expect(() => answerCoachQuestion(db, id, q.id, ['Z'], 1)).toThrow(/Unknown option key/)
  })

  it('completes the session after the final answer and produces a summary', () => {
    const id = createCoachSession(db, { domain: null, size: 4 }, 0, rng)
    const key = answerKey(id)
    for (let i = 0; i < 4; i++) {
      const q = getCoachView(db, id).current!
      answerCoachQuestion(db, id, q.id, i === 0 ? wrongFor(id, q.id) : key.get(q.id)!, i + 1)
    }

    const view = getCoachView(db, id)
    expect(view.finished).toBe(true)
    expect(view.current).toBeNull()
    expect(getTestRow(db, id).finished_at).not.toBeNull()

    const summary = getCoachSummary(db, id)
    expect(summary.totalItems).toBe(4)
    expect(summary.correctCount).toBe(3)
    expect(summary.mode).toBe('coaching')
  })

  it('will not summarise a session that is still in progress', () => {
    const id = createCoachSession(db, { domain: null, size: 2 }, 0, rng)
    expect(() => getCoachSummary(db, id)).toThrow(/not complete/)
  })

  it('does not treat a coaching session as an exam test', () => {
    const id = createCoachSession(db, { domain: null, size: 2 }, 0, rng)
    const row = db.prepare('SELECT mode, deadline_at FROM tests WHERE id = ?').get(id) as { mode: string, deadline_at: number | null }
    expect(row.mode).toBe('coaching')
    expect(row.deadline_at).toBeNull()
  })
})

describe('database migration', () => {
  it('upgrades a tests table that still has the old mode CHECK constraint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coach-migrate-'))
    const path = join(dir, 'old.db')
    try {
      const old = new Database(path)
      old.exec(`
        CREATE TABLE questions (id TEXT PRIMARY KEY, scenario INTEGER NOT NULL, domain INTEGER NOT NULL,
          task_statement TEXT NOT NULL, stem TEXT NOT NULL, options TEXT NOT NULL, correct TEXT NOT NULL,
          select_count INTEGER NOT NULL, explanation TEXT NOT NULL);
        CREATE TABLE tests (id TEXT PRIMARY KEY,
          mode TEXT NOT NULL CHECK (mode IN ('diagnostic', 'practice')), scenarios TEXT,
          created_at INTEGER NOT NULL, deadline_at INTEGER, finished_at INTEGER,
          correct_count INTEGER, total_items INTEGER, scaled_score INTEGER, passed INTEGER);
        CREATE TABLE test_items (test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
          position INTEGER NOT NULL, question_id TEXT NOT NULL REFERENCES questions(id), PRIMARY KEY (test_id, position));
        CREATE TABLE test_answers (test_id TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
          question_id TEXT NOT NULL REFERENCES questions(id), selected TEXT NOT NULL, updated_at INTEGER NOT NULL,
          PRIMARY KEY (test_id, question_id));
        INSERT INTO tests (id, mode, created_at) VALUES ('legacy', 'diagnostic', 1);
      `)
      old.close()

      const upgraded = openDatabase(path, QUESTIONS)
      const legacy = upgraded.prepare('SELECT id, mode FROM tests WHERE id = ?').get('legacy') as { id: string, mode: string }
      expect(legacy).toEqual({ id: 'legacy', mode: 'diagnostic' })
      expect(() => createCoachSession(upgraded, { domain: null, size: 2 }, 0)).not.toThrow()
      const schema = (upgraded.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tests'").get() as { sql: string }).sql
      expect(schema).not.toMatch(/CHECK\s*\(\s*mode/i)
      upgraded.close()
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
