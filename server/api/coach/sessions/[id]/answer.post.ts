import { getDb } from '../../../../utils/db'
import { guard } from '../../../../utils/http'
import { answerCoachQuestion } from '../../../../services/coach'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ questionId?: unknown, selected?: unknown }>(event)
  if (typeof body?.questionId !== 'string' || !Array.isArray(body.selected)
    || !body.selected.every(k => typeof k === 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'Expected { questionId: string, selected: string[] }' })
  }
  return guard(() => answerCoachQuestion(getDb(), id, body.questionId as string, body.selected as string[]))
})
