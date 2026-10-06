import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '~~/server/utils/db'
import { answerCoachQuestion, createCoachSession, getCoachView } from '~~/server/services/coach'
import { applyAnswer, listQuestionStats, loadStatMap, recordAnswer, recordPresentation } from '~~/server/services/stats'
import { assembleCoachSession, prioritize, type Question } from '~~/shared/assembly'
import { presentedKey } from '../helpers/presented'
import { CLEAR_WRONG_AFTER_RIGHT } from '~~/shared/exam'

const QUESTIONS = resolve(__dirname, '../../data/questions.json')
const rng = (() => {
  let s = 7
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
})()

describe('applyAnswer counter rules', () => {
  const zero = { shown: 0, right: 0, wrong: 0 }

  it('counts a wrong answer and resets the right counter to 0', () => {
    const after = applyAnswer({ shown: 2, right: 2, wrong: 1 }, false)
    expect(after).toEqual({ shown: 2, right: 0, wrong: 2 })
  })

  it('counts correct answers in a row', () => {
    expect(applyAnswer(zero, true)).toEqual({ shown: 0, right: 1, wrong: 0 })
    expect(applyAnswer({ shown: 0, right: 1, wrong: 0 }, true)).toEqual({ shown: 0, right: 2, wrong: 0 })
  })

  it('sets the wrong counter to 0 after 3 right answers', () => {
    expect(CLEAR_WRONG_AFTER_RIGHT).toBe(3)
    const afterTwo = { shown: 1, right: 0, wrong: 2 }
    const afterThree = [true, true, true].reduce(applyAnswer, afterTwo)
    expect(afterThree.wrong).toBe(0)
  })

  it('a wrong answer in the middle of a streak starts the right count again', () => {
    const steps = [true, true, false, true]
    const end = steps.reduce(applyAnswer, { shown: 0, right: 0, wrong: 0 })
    expect(end).toEqual({ shown: 0, right: 1, wrong: 1 })
  })

  it('restarts the right count after clearing wrong', () => {
    const end = [true, true, true, true].reduce(applyAnswer, { shown: 0, right: 0, wrong: 1 })
    expect(end).toEqual({ shown: 0, right: 1, wrong: 0 })
  })
})

describe('coaching priority', () => {
  const q = (id: string, domain: number): Question => ({
    id, scenario: 1, domain, taskStatement: '1.1', stem: id, options: [{ key: 'A', text: 'a' }],
    correct: ['A'], selectCount: 1, explanation: 'x',
  })

  it('ranks the most wrong first, then the least shown', () => {
    const qs = [q('a', 1), q('b', 1), q('c', 1)]
    const stats = new Map([
      ['a', { shown: 5, wrong: 0 }],
      ['b', { shown: 9, wrong: 3 }],
      ['c', { shown: 1, wrong: 3 }],
    ])
    const ranked = prioritize(qs, rng, id => stats.get(id)).map(x => x.id)
    // b and c share the most wrong answers (3); c has been shown less, so it comes first. a has none.
    expect(ranked).toEqual(['c', 'b', 'a'])
  })

  it('a single-domain selection takes the highest-wrong questions', () => {
    const bank = JSON.parse(readFileSync(QUESTIONS, 'utf8')) as Question[]
    const inDomain = bank.filter(x => x.domain === 3)
    const hot = inDomain[inDomain.length - 1]!.id
    const stats = (id: string) => (id === hot ? { shown: 0, wrong: 9 } : undefined)
    const picked = assembleCoachSession(bank, rng, 3, 3, stats)
    expect(picked.map(x => x.id)).toContain(hot)
  })
})

describe('counters in the database', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:', QUESTIONS)
  })
  afterEach(() => db.close())

  it('counts a question as shown once per session, even on reload', () => {
    const id = createCoachSession(db, { domain: null, size: 3 }, 0, rng)
    const first = getCoachView(db, id).current!
    getCoachView(db, id)
    getCoachView(db, id)
    expect(loadStatMap(db).get(first.id)?.shown).toBe(1)
  })

  it('updates right and wrong counters when answers are checked', () => {
    const id = createCoachSession(db, { domain: null, size: 2 }, 0, rng)
    const q = getCoachView(db, id).current!
    answerCoachQuestion(db, id, q.id, presentedKey(db, id).get(q.id)!.correct, 1)

    const row = listQuestionStats(db).find(r => r.id === q.id)!
    expect(row).toMatchObject({ shown: 1, right: 1, wrong: 0 })
  })

  it('a wrong answer raises the wrong counter and clears the right counter', () => {
    const id = 'some-session'
    db.prepare('INSERT INTO tests (id, mode, created_at) VALUES (?, ?, 0)').run(id, 'coaching')
    const qid = (db.prepare('SELECT id FROM questions LIMIT 1').get() as { id: string }).id
    recordAnswer(db, qid, true)
    recordAnswer(db, qid, false)
    expect(listQuestionStats(db).find(r => r.id === qid)).toMatchObject({ right: 0, wrong: 1 })
  })

  it('recordPresentation is idempotent per session', () => {
    db.prepare('INSERT INTO tests (id, mode, created_at) VALUES (?, ?, 0)').run('s1', 'coaching')
    const qid = (db.prepare('SELECT id FROM questions LIMIT 1').get() as { id: string }).id
    recordPresentation(db, 's1', qid)
    recordPresentation(db, 's1', qid)
    expect(listQuestionStats(db).find(r => r.id === qid)?.shown).toBe(1)
  })
})
