import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Db } from '~~/server/utils/db'
import { answerCoachQuestion, createCoachSession, getCoachView } from '~~/server/services/coach'
import { askAboutQuestion, buildSystemPrompt, CHAT, readClaudeConfig, validateMessages } from '~~/server/services/chat'
import { ExamError } from '~~/server/services/exam'
import type { Question } from '~~/shared/assembly'
import { presentedKey } from '../helpers/presented'

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
    expect(() => readClaudeConfig({ ANTHROPIC_API_KEY: 'k' })).toThrow(/Missing: ANTHROPIC_MODEL/)
    expect(() => readClaudeConfig({ ANTHROPIC_MODEL: 'm' })).toThrow(/Missing: ANTHROPIC_API_KEY/)
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

  it('keeps the assistant on the exam topics, including Claude Code and the docs', () => {
    const prompt = buildSystemPrompt(question, false)
    expect(prompt).toContain('Claude Code')
    expect(prompt).toContain('Politely decline')
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
    answerCoachQuestion(db, sessionId, q.id, presentedKey(db, sessionId).get(q.id)!.correct, 1)

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

describe('docs tool loop', () => {
  let db: Db
  let sessionId: string
  let questionId: string
  beforeEach(() => {
    db = openDatabase(':memory:', QUESTIONS)
    sessionId = createCoachSession(db, { domain: null, size: 2 }, 0, rng)
    questionId = getCoachView(db, sessionId).current!.id
  })
  afterEach(() => {
    db.close()
    vi.unstubAllGlobals()
  })

  it('runs a requested docs tool and answers with the result in context', async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response('Hook docs text', { status: 200 }))
    vi.stubGlobal('fetch', fetchStub)
    const create = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu_1', name: 'fetch_docs', input: { url: 'https://code.claude.com/docs/en/hooks.md' } }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hooks run deterministically.' }] })

    const { reply } = await askAboutQuestion(db, sessionId, questionId, [{ role: 'user', content: 'What are hooks?' }], ENV, { messages: { create } } as never)

    expect(reply).toBe('Hooks run deterministically.')
    expect(fetchStub).toHaveBeenCalledWith('https://code.claude.com/docs/en/hooks.md', expect.anything())
    const secondCall = create.mock.calls[1]![0]
    const toolResult = secondCall.messages.at(-1).content[0]
    expect(toolResult).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_1' })
    expect(toolResult.content).toContain('Hook docs text')
    expect(create.mock.calls[0]![0].tools.map((t: { name: string }) => t.name)).toEqual(['search_docs', 'fetch_docs'])
  })

  it('tells the model when it asks for a URL outside the index, and does not fetch it', async () => {
    const fetchStub = vi.fn()
    vi.stubGlobal('fetch', fetchStub)
    const create = vi.fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu_2', name: 'fetch_docs', input: { url: 'https://evil.example/x.md' } }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'I could not verify that.' }] })

    await askAboutQuestion(db, sessionId, questionId, [{ role: 'user', content: 'x' }], ENV, { messages: { create } } as never)
    expect(fetchStub).not.toHaveBeenCalled()
    expect(create.mock.calls[1]![0].messages.at(-1).content[0].content).toMatch(/not in the documentation index/)
  })

  it('answers without tools once the tool budget is spent', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const toolTurn = {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu_x', name: 'search_docs', input: { query: 'hooks' } }],
    }
    const create = vi.fn()
      .mockResolvedValueOnce(toolTurn).mockResolvedValueOnce(toolTurn).mockResolvedValueOnce(toolTurn).mockResolvedValueOnce(toolTurn)
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Final answer.' }] })

    const { reply } = await askAboutQuestion(db, sessionId, questionId, [{ role: 'user', content: 'x' }], ENV, { messages: { create } } as never)
    expect(reply).toBe('Final answer.')
    expect(create).toHaveBeenCalledTimes(CHAT.maxToolRounds + 1)
    expect(create.mock.calls.at(-1)![0].tools).toBeUndefined()
  })
})

describe('chat route error mapping', () => {
  it('turns a missing configuration into an HTTP 503 whose message reaches the browser', async () => {
    const { guardAsync } = await import('~~/server/utils/http')
    await expect(guardAsync(() => Promise.reject(new ExamError(503, 'not configured'))))
      .rejects.toMatchObject({ statusCode: 503, statusMessage: 'not configured' })
  })
})
