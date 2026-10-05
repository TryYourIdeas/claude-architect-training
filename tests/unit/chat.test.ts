import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Db } from '~~/server/utils/db'
import { answerCoachQuestion, createCoachSession, getCoachView } from '~~/server/services/coach'
import { askAboutQuestion, buildSystemPrompt, CHAT, readClaudeConfig, validateMessages } from '~~/server/services/chat'
import { ExamError } from '~~/server/services/exam'
import type { Question } from '~~/shared/assembly'

const QUESTIONS = resolve(__dirname, '../../data/questions.json')
const ENV = { ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_MODEL: 'claude-test-model' }
const rng = (() => {
  let s = 5
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
})()

const question: Question = {
  id: 'Q-1', scenario: 1, domain: 1, taskStatement: '1.4', stem: 'Which mechanism enforces the rule?',
  options: [{ key: 'A', text: 'Prompt text' }, { key: 'B', text: 'A hook' }],
  correct: ['B'], selectCount: 1, explanation: 'Hooks are deterministic.',
}

function fakeClient(reply: unknown) {
  const create = vi.fn().mockResolvedValue(reply)
  return { client: { messages: { create } } as never, create }
}

describe('readClaudeConfig', () => {
  it('reads the key, model and optional base URL from the environment', () => {
    expect(readClaudeConfig({ ...ENV, ANTHROPIC_BASE_URL: 'https://api.example.test' }))
      .toEqual({ apiKey: 'test-key', model: 'claude-test-model', baseURL: 'https://api.example.test' })
  })

  it('leaves baseURL undefined when it is not set', () => {
    expect(readClaudeConfig(ENV).baseURL).toBeUndefined()
  })

  it('fails with 503 when the key or model is missing, without revealing secrets', () => {
    expect(() => readClaudeConfig({ ANTHROPIC_MODEL: 'm' })).toThrow(ExamError)
    expect(() => readClaudeConfig({ ANTHROPIC_API_KEY: 'k' })).toThrow(/not configured/)
    try {
      readClaudeConfig({})
    }
    catch (err) {
      expect((err as ExamError).statusCode).toBe(503)
    }
  })
})

describe('buildSystemPrompt', () => {
  it('does not reveal the correct answer or explanation before the learner answers', () => {
    const prompt = buildSystemPrompt(question, false)
    expect(prompt).toContain('Which mechanism enforces the rule?')
    expect(prompt).toContain('NOT answered yet')
    expect(prompt).not.toContain('Correct answer')
    expect(prompt).not.toContain('Hooks are deterministic.')
  })

  it('includes the answer and explanation once the learner has answered', () => {
    const prompt = buildSystemPrompt(question, true)
    expect(prompt).toContain('Correct answer: B.')
    expect(prompt).toContain('Hooks are deterministic.')
  })

  it('keeps the assistant on the question topic', () => {
    expect(buildSystemPrompt(question, false)).toContain('Stay on the topic')
  })
})

describe('validateMessages', () => {
  it('accepts a conversation that ends with a user message', () => {
    expect(validateMessages([{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }, { role: 'user', content: 'Why?' }]))
      .toHaveLength(3)
  })

  it('rejects empty input, bad roles, blank content and a trailing assistant message', () => {
    expect(() => validateMessages([])).toThrow(/non-empty/)
    expect(() => validateMessages([{ role: 'system', content: 'x' }])).toThrow(/role/)
    expect(() => validateMessages([{ role: 'user', content: '   ' }])).toThrow(/non-empty text/)
    expect(() => validateMessages([{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }])).toThrow(/last message/)
  })

  it('rejects messages over the length limit', () => {
    expect(() => validateMessages([{ role: 'user', content: 'x'.repeat(CHAT.maxMessageChars + 1) }])).toThrow(/limited to/)
  })

  it('keeps only the most recent turns', () => {
    const many = Array.from({ length: CHAT.maxHistoryTurns + 4 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    }))
    many.push({ role: 'user', content: 'last' })
    const kept = validateMessages(many)
    expect(kept.length).toBe(CHAT.maxHistoryTurns)
    expect(kept[kept.length - 1]!.content).toBe('last')
  })
})

describe('askAboutQuestion', () => {
  let db: Db
  let sessionId: string
  let questionId: string
  beforeEach(() => {
    db = openDatabase(':memory:', QUESTIONS)
    sessionId = createCoachSession(db, { domain: null, size: 2 }, 0, rng)
    questionId = getCoachView(db, sessionId).current!.id
  })
  afterEach(() => db.close())

  it('returns the text of Claude\'s reply using the configured model', async () => {
    const { client, create } = fakeClient({ content: [{ type: 'text', text: 'Think about enforcement.' }] })
    const result = await askAboutQuestion(db, sessionId, questionId, [{ role: 'user', content: 'Help' }], ENV, client)
    expect(result.reply).toBe('Think about enforcement.')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-test-model', max_tokens: CHAT.maxTokens }))
  })

  it('does not send the answer to Claude before the question is answered', async () => {
    const { client, create } = fakeClient({ content: [{ type: 'text', text: 'ok' }] })
    await askAboutQuestion(db, sessionId, questionId, [{ role: 'user', content: 'Which is right?' }], ENV, client)
    const system = create.mock.calls[0]![0].system as string
    expect(system).toContain('NOT answered yet')
    expect(system).not.toContain('Correct answer:')
  })

  it('sends the answer and explanation to Claude after the learner has answered', async () => {
    const q = getCoachView(db, sessionId).current!
    const correct = (db.prepare('SELECT correct FROM questions WHERE id = ?').get(q.id) as { correct: string }).correct
    answerCoachQuestion(db, sessionId, q.id, JSON.parse(correct), 1)

    const { client, create } = fakeClient({ content: [{ type: 'text', text: 'ok' }] })
    await askAboutQuestion(db, sessionId, q.id, [{ role: 'user', content: 'Why?' }], ENV, client)
    expect(create.mock.calls[0]![0].system).toContain('Correct answer:')
  })

  it('refuses questions that are not part of the session', async () => {
    const { client } = fakeClient({ content: [{ type: 'text', text: 'ok' }] })
    await expect(askAboutQuestion(db, sessionId, 'NOT-IN-SESSION', [{ role: 'user', content: 'x' }], ENV, client))
      .rejects.toThrow(/not part of this session/)
  })

  it('fails with 503 when Claude is not configured', async () => {
    await expect(askAboutQuestion(db, sessionId, questionId, [{ role: 'user', content: 'x' }], {}))
      .rejects.toMatchObject({ statusCode: 503 })
  })

  it('maps upstream failures to a generic 502 and logs the cause', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = { messages: { create: vi.fn().mockRejectedValue(new Error('boom: key=sk-secret')) } } as never
    await expect(askAboutQuestion(db, sessionId, questionId, [{ role: 'user', content: 'x' }], ENV, client))
      .rejects.toMatchObject({ statusCode: 502, message: expect.stringMatching(/unavailable/) })
    expect(error).toHaveBeenCalledWith('[coach-chat] Claude request failed', expect.objectContaining({ sessionId, questionId }))
    error.mockRestore()
  })

  it('rejects an empty reply from Claude', async () => {
    const { client } = fakeClient({ content: [] })
    await expect(askAboutQuestion(db, sessionId, questionId, [{ role: 'user', content: 'x' }], ENV, client))
      .rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('chat route error mapping', () => {
  it('turns a missing configuration into an HTTP 503 whose message reaches the browser', async () => {
    const { guardAsync } = await import('~~/server/utils/http')
    await expect(guardAsync(() => Promise.reject(new ExamError(503, 'not configured'))))
      .rejects.toMatchObject({ statusCode: 503, statusMessage: 'not configured' })
  })
})
