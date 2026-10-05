import { getDb } from '../../../../utils/db'
import { guardAsync } from '../../../../utils/http'
import { askAboutQuestion } from '../../../../services/chat'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ questionId?: unknown, messages?: unknown }>(event)
  if (typeof body?.questionId !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'questionId is required' })
  }
  return guardAsync(() => askAboutQuestion(getDb(), id, body.questionId as string, body.messages))
})
