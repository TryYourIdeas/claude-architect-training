import { createError } from 'h3'
import { ExamError } from '../services/exam'

function toHttpError(err: unknown): unknown {
  if (err instanceof ExamError) {
    return createError({ statusCode: err.statusCode, statusMessage: err.message })
  }
  return err
}

/** Runs a synchronous service call and maps ExamError to an HTTP error response. */
export function guard<T>(fn: () => T): T {
  try {
    return fn()
  }
  catch (err) {
    throw toHttpError(err)
  }
}

/** Async counterpart of `guard`, for services that call external APIs. */
export async function guardAsync<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  }
  catch (err) {
    throw toHttpError(err)
  }
}
