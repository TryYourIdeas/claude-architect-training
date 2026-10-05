import { getDb } from '../../../utils/db'
import { guard } from '../../../utils/http'
import { createCoachSession } from '../../../services/coach'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ domain?: unknown, size?: unknown }>(event)
  const domain = body?.domain ?? null
  const size = body?.size ?? undefined
  if (domain !== null && typeof domain !== 'number') {
    throw createError({ statusCode: 400, statusMessage: 'domain must be a number 1–5 or null' })
  }
  if (size !== undefined && typeof size !== 'number') {
    throw createError({ statusCode: 400, statusMessage: 'size must be a number' })
  }
  const id = guard(() => createCoachSession(getDb(), { domain, size: size as number | undefined }))
  setResponseStatus(event, 201)
  return { id }
})
