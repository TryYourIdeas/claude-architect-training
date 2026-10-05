import { getDb } from '../../../../utils/db'
import { guard } from '../../../../utils/http'
import { getCoachView } from '../../../../services/coach'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  return guard(() => getCoachView(getDb(), id))
})
