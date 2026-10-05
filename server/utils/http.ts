import { createError } from 'h3'
import { ExamError } from '../services/exam'

/** Runs a service call and maps ExamError to an HTTP error response. */
export function guard<T>(fn: () => T): T {
  try {
    return fn()
  }
  catch (err) {
    if (err instanceof ExamError) {
      throw createError({ statusCode: err.statusCode, statusMessage: err.message })
    }
    throw err
  }
}
