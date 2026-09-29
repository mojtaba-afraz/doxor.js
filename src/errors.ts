/** Stable error codes exposed by doxor. */
export type DoxorErrorCode =
  | 'Constraint'
  | 'NotFound'
  | 'Version'
  | 'Blocked'
  | 'Quota'
  | 'DataClone'
  | 'Data'
  | 'Unavailable'
  | 'SchemaConflict'
  | 'Migration'
  | 'Outdated'
  | 'TransactionInactive'
  | 'Aborted'
  | 'Unknown'

const DOM_EXCEPTION_CODES: Readonly<Record<string, DoxorErrorCode>> = {
  ConstraintError: 'Constraint',
  NotFoundError: 'NotFound',
  VersionError: 'Version',
  QuotaExceededError: 'Quota',
  DataCloneError: 'DataClone',
  DataError: 'Data',
  TransactionInactiveError: 'TransactionInactive',
  AbortError: 'Aborted',
}

/** The only error type doxor rejects with. The original error, if any, is in `cause`. */
export class DoxorError extends Error {
  override readonly name = 'DoxorError'
  readonly code: DoxorErrorCode

  constructor(code: DoxorErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.code = code
  }
}

/** Wraps any thrown value (usually a DOMException from IndexedDB) in a DoxorError. */
export function toDoxorError(error: unknown): DoxorError {
  if (error instanceof DoxorError) return error
  const name = error instanceof Error || isDomException(error) ? error.name : undefined
  const code = (name && DOM_EXCEPTION_CODES[name]) || 'Unknown'
  const message = error instanceof Error ? error.message : String(error)
  return new DoxorError(code, message, { cause: error })
}

function isDomException(error: unknown): error is DOMException {
  return typeof DOMException !== 'undefined' && error instanceof DOMException
}
