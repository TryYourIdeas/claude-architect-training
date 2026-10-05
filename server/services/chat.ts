import Anthropic from '@anthropic-ai/sdk'
import type { Question } from '~~/shared/assembly'
import { DOMAINS } from '~~/shared/exam'
import type { Db } from '../utils/db'
import { answersFor, ExamError, getTestRow, itemsFor } from './exam'

export const CHAT = {
  maxMessageChars: 2000,
  maxHistoryTurns: 12,
  maxTokens: 800,
} as const

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudeConfig {
  apiKey: string
  model: string
  baseURL?: string
}

/**
 * Reads the Claude connection settings from the environment:
 *   ANTHROPIC_API_KEY   – API token (required)
 *   ANTHROPIC_MODEL     – model id, e.g. claude-sonnet-5 (required)
 *   ANTHROPIC_BASE_URL  – API endpoint (optional; the SDK default is used when unset)
 */
export function readClaudeConfig(env: NodeJS.ProcessEnv = process.env): ClaudeConfig {
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  const model = env.ANTHROPIC_MODEL?.trim()
  if (!apiKey || !model) {
    throw new ExamError(503, 'The chat assistant is not configured. Set ANTHROPIC_API_KEY and ANTHROPIC_MODEL.')
  }
  const baseURL = env.ANTHROPIC_BASE_URL?.trim() || undefined
  return { apiKey, model, baseURL }
}

/**
 * Builds the system prompt for one question. The correct answer and explanation are only
 * included once the learner has locked in an answer, so the assistant cannot give the
 * answer away before the learner has tried it.
 */
export function buildSystemPrompt(question: Question, revealed: boolean): string {
  const domain = DOMAINS.find(d => d.id === question.domain)?.name ?? `Domain ${question.domain}`
  const options = question.options.map(o => `${o.key}. ${o.text}`).join('\n')

  const lines = [
    'You are a patient tutor helping a learner prepare for the Claude Certified Architect – Foundations exam.',
    `Stay on the topic of the question below (${domain}, task ${question.taskStatement}). Politely decline unrelated requests.`,
    'Explain concepts, clarify wording and discuss trade-offs. Keep answers focused and under about 200 words.',
    '',
    `Question (${question.selectCount === 1 ? 'one answer' : `${question.selectCount} answers`}):`,
    question.stem,
    '',
    'Options:',
    options,
  ]

  if (revealed) {
    lines.push(
      '',
      `The learner has answered. Correct answer: ${question.correct.join(', ')}.`,
      `Reference explanation: ${question.explanation}`,
      'You may discuss the correct answer and why the other options are wrong.',
    )
  }
  else {
    lines.push(
      '',
      'The learner has NOT answered yet. Do not reveal or hint at which option is correct.',
      'Help them reason about the concepts instead.',
    )
  }
  return lines.join('\n')
}

export function validateMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ExamError(400, 'messages must be a non-empty array')
  }
  const clean: ChatMessage[] = messages.map((m) => {
    if (!m || typeof m !== 'object') throw new ExamError(400, 'Each message must be an object')
    const { role, content } = m as { role?: unknown, content?: unknown }
    if (role !== 'user' && role !== 'assistant') throw new ExamError(400, 'Message role must be user or assistant')
    if (typeof content !== 'string' || !content.trim()) throw new ExamError(400, 'Message content must be non-empty text')
    if (content.length > CHAT.maxMessageChars) {
      throw new ExamError(400, `Messages are limited to ${CHAT.maxMessageChars} characters`)
    }
    return { role, content: content.trim() }
  })
  if (clean[clean.length - 1]!.role !== 'user') throw new ExamError(400, 'The last message must be from the user')
  return clean.slice(-CHAT.maxHistoryTurns)
}

/** Sends one chat turn to Claude about a question in a coaching session. */
export async function askAboutQuestion(
  db: Db,
  sessionId: string,
  questionId: string,
  messages: unknown,
  env: NodeJS.ProcessEnv = process.env,
  client?: Pick<Anthropic, 'messages'>,
): Promise<{ reply: string }> {
  const row = getTestRow(db, sessionId)
  if (row.mode !== 'coaching') throw new ExamError(404, 'Coaching session not found')

  const item = itemsFor(db, sessionId).find(q => q.id === questionId)
  if (!item) throw new ExamError(400, 'Question is not part of this session')

  const conversation = validateMessages(messages)
  const revealed = questionId in answersFor(db, sessionId)
  const system = buildSystemPrompt(item, revealed)

  const config = readClaudeConfig(env)
  const api = client ?? new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL })

  try {
    const response = await api.messages.create({
      model: config.model,
      max_tokens: CHAT.maxTokens,
      system,
      messages: conversation,
    })
    const reply = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim()
    if (!reply) throw new ExamError(502, 'The assistant returned an empty reply')
    return { reply }
  }
  catch (err) {
    if (err instanceof ExamError) throw err
    // Log the upstream cause for operators; the learner only sees a generic message.
    console.error('[coach-chat] Claude request failed', {
      sessionId,
      questionId,
      status: err instanceof Anthropic.APIError ? err.status : undefined,
      message: err instanceof Error ? err.message : String(err),
    })
    throw new ExamError(502, 'The chat assistant is unavailable right now. Please try again.')
  }
}
