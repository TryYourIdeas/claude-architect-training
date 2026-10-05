import { getDb } from '../../../../utils/db'
import { guard } from '../../../../utils/http'
import { getCoachSummary } from '../../../../services/coach'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  return guard(() => getCoachSummary(getDb(), id))
})
