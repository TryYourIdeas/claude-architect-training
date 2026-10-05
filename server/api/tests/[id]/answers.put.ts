import { getDb } from '../../../utils/db'
import { guard } from '../../../utils/http'
import { saveAnswer } from '../../../services/exam'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ questionId?: unknown, selected?: unknown }>(event)
  if (typeof body?.questionId !== 'string' || !Array.isArray(body.selected)
    || !body.selected.every(k => typeof k === 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'Expected { questionId: string, selected: string[] }' })
  }
  guard(() => saveAnswer(getDb(), id, body.questionId as string, body.selected as string[]))
  return { ok: true }
})
