import { describe, expect, it } from 'vitest'
import { DoxorError, toDoxorError } from '../../src/errors.js'

describe('toDoxorError', () => {
  it('maps IndexedDB DOMExceptions to doxor codes', () => {
    const cause = new DOMException('duplicate key', 'ConstraintError')
    const error = toDoxorError(cause)
    expect(error).toBeInstanceOf(DoxorError)
    expect(error.code).toBe('Constraint')
    expect(error.message).toBe('duplicate key')
    expect(error.cause).toBe(cause)
  })

  it('falls back to Unknown for unrecognised errors', () => {
    expect(toDoxorError(new TypeError('boom')).code).toBe('Unknown')
    expect(toDoxorError('boom').code).toBe('Unknown')
  })

  it('returns DoxorError instances unchanged', () => {
    const error = new DoxorError('Blocked', 'blocked')
    expect(toDoxorError(error)).toBe(error)
    expect(error.name).toBe('DoxorError')
  })
})
