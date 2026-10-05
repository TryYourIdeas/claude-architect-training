import { getDb } from '../../utils/db'
import { listQuestionStats } from '../../services/stats'

export default defineEventHandler(() => listQuestionStats(getDb()))
