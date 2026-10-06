import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '~~/server/utils/db'
import { answerCoachQuestion, createCoachSession, getCoachView } from '~~/server/services/coach'
import { createTest, getTestView, listTests, orderedItemsFor, saveAnswer } from '~~/server/services/exam'
import type { Question } from '~~/shared/assembly'
import { presentQuestion, randomOrder, toDisplayedKeys, toStoredKeys } from '~~/shared/presentation'
import { presentedKey } from '../helpers/presented'

const QUESTIONS = resolve(__dirname, '../../data/questions.json')
const rng = (() => {
  let s = 2024
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
})()

const stored: Question = {
  id: 'Q', scenario: 1, domain: 1, taskStatement: '1.1', stem: 's',
  options: [{ key: 'A', text: 'first' }, { key: 'B', text: 'second' }, { key: 'C', text: 'third' }, { key: 'D', text: 'fourth' }],
  correct: ['C'], selectCount: 1, explanation: 'e',
}

describe('option presentation', () => {
  it('relabels options A, B, C… in the shown order and keeps each text with its answer', () => {
    const shown = presentQuestion(stored, ['C', 'A', 'D', 'B'])
    expect(shown.options).toEqual([
      { key: 'A', text: 'third' },
      { key: 'B', text: 'first' },
      { key: 'C', text: 'fourth' },
      { key: 'D', text: 'second' },
    ])
    // Stored C ("third") is shown as A.
    expect(shown.correct).toEqual(['A'])
  })

  it('maps letters both ways for a multiple-response answer', () => {
    const order = ['D', 'B', 'A', 'C']
    expect(toStoredKeys(['A', 'C'], order)).toEqual(['A', 'D'])
    expect(toDisplayedKeys(['A', 'D'], order)).toEqual(['A', 'C'])
  })

  it('produces a random order that is a permutation of the stored keys', () => {
    for (let i = 0; i < 20; i++) {
      const order = randomOrder(stored, rng)
      expect([...order].sort()).toEqual(['A', 'B', 'C', 'D'])
    }
  })
})

describe('shuffled attempts keep scoring correct', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:', QUESTIONS)
  })
  afterEach(() => db.close())

  it('shuffles the options of attempts away from the stored order', () => {
    const id = createTest(db, 'practice', 0, rng)
    const moved = orderedItemsFor(db, id).filter(i => i.order.some((k, idx) => k !== i.stored.options[idx]!.key))
    expect(moved.length).toBeGreaterThan(0)
  })

  it('scores the letter the learner sees as correct, even when the option was moved', () => {
    const id = createTest(db, 'practice', 0, rng)
    const item = orderedItemsFor(db, id).find(i => i.order.join('') !== 'ABCD'.slice(0, i.order.length) && i.stored.selectCount === 1)!
    const displayedCorrect = presentedKey(db, id).get(item.stored.id)!.correct

    saveAnswer(db, id, item.stored.id, displayedCorrect, 1)
    const view = getTestView(db, id, 2)
    expect(view.answers[item.stored.id]).toEqual(displayedCorrect)

    // The stored answer is in the bank's keys, not the displayed ones.
    const storedAnswer = db.prepare('SELECT selected FROM test_answers WHERE test_id = ? AND question_id = ?')
      .get(id, item.stored.id) as { selected: string }
    expect(JSON.parse(storedAnswer.selected)).toEqual(item.stored.correct)
  })

  it('keeps the same order when the coaching question is reloaded', () => {
    const id = createCoachSession(db, { domain: null, size: 3 }, 0, rng)
    const first = getCoachView(db, id).current!
    const again = getCoachView(db, id).current!
    expect(again.options).toEqual(first.options)
  })

  it('feedback reports the learner\'s letters and the correct letter they saw', () => {
    const id = createCoachSession(db, { domain: null, size: 3 }, 0, rng)
    const current = getCoachView(db, id).current!
    const correct = presentedKey(db, id).get(current.id)!.correct
    const feedback = answerCoachQuestion(db, id, current.id, correct, 1)
    expect(feedback.isCorrect).toBe(true)
    expect(feedback.correct).toEqual(correct)
    expect(feedback.selected).toEqual(correct)
  })
})

describe('recent attempts', () => {
  it('lists at most the requested number of attempts, newest first', () => {
    const db = openDatabase(':memory:', QUESTIONS)
    for (let i = 0; i < 7; i++) createTest(db, 'diagnostic', 1000 + i, rng)
    const recent = listTests(db, 5)
    expect(recent).toHaveLength(5)
    expect(recent[0]!.createdAt).toBe(1006)
    db.close()
  })
})
