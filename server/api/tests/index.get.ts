import { getDb } from '../../utils/db'
import { listTests } from '../../services/exam'

// The home page shows the five most recent attempts.
export default defineEventHandler(() => listTests(getDb(), 5))
