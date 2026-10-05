import { getDb } from '../../utils/db'
import { guard } from '../../utils/http'
import { listTests } from '../../services/exam'

export default defineEventHandler(() => guard(() => listTests(getDb())))
