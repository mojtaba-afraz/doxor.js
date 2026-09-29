/**
 * Stable error codes exposed by doxor. Check `error.code` instead of the message.
 *
 * - `Constraint`: the key or a unique index value already exists.
 * - `NotFound`: the collection or index does not exist in the database.
 * - `Version`: the database changed version while opening (e.g. concurrent upgrades in other tabs).
 * - `Quota`: the browser's storage quota is exceeded.
 * - `DataClone`: the value cannot be stored (functions, DOM nodes, framework proxies such as Vue `reactive()`; store `toRaw()` / plain copies instead).
 * - `Data`: the key or query value is not a valid IndexedDB key, or a required key is missing.
 * - `Unavailable`: there is no IndexedDB in this environment (SSR, some private modes).
 * - `SchemaConflict`: the declared schema changes a key or index incompatibly; add a migration that rebuilds it.
 * - `Migration`: a migration failed, or a previous upgrade did not finish.
 * - `Outdated`: newer code upgraded the database; writes are refused until the page reloads.
 * - `TransactionInactive`: the transaction committed before the work finished (usually an `await` on non-IndexedDB work inside `db.transaction()`).
 * - `ReadOnly`: a write was attempted in a `readonly` transaction.
 * - `Aborted`: the transaction or open was aborted.
 * - `Unknown`: anything else; see `cause`.
 */
export type DoxorErrorCode =
  | 'Constraint'
  | 'NotFound'
  | 'Version'
  | 'Quota'
  | 'DataClone'
  | 'Data'
  | 'Unavailable'
  | 'SchemaConflict'
  | 'Migration'
  | 'Outdated'
  | 'TransactionInactive'
  | 'ReadOnly'
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
  ReadOnlyError: 'ReadOnly',
  AbortError: 'Aborted',
}

/**
 * The only error type doxor rejects with. The original error, if any, is in `cause`.
 *
 * @example
 * ```ts
 * try {
 *   await db.users.insert(user)
 * } catch (error) {
 *   if (error instanceof DoxorError && error.code === 'Constraint') showEmailTaken()
 *   else throw error
 * }
 * ```
 */
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
