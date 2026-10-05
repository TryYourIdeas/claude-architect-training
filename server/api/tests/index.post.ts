import { getDb } from '../../utils/db'
import { guard } from '../../utils/http'
import { createTest, type TestMode } from '../../services/exam'

type ExamMode = Exclude<TestMode, 'coaching'>

export default defineEventHandler(async (event) => {
  const body = await readBody<{ mode?: string }>(event)
  const mode = body?.mode
  if (mode !== 'diagnostic' && mode !== 'practice') {
    throw createError({ statusCode: 400, statusMessage: 'mode must be "diagnostic" or "practice"' })
  }
  const id = guard(() => createTest(getDb(), mode as ExamMode))
  setResponseStatus(event, 201)
  return { id }
})
