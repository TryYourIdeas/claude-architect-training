import { getDb } from '../../../utils/db'
import { guard } from '../../../utils/http'
import { buildReport } from '../../../services/exam'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  return guard(() => buildReport(getDb(), id))
})
