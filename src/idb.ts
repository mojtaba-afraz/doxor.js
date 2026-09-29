import { DoxorError, toDoxorError } from './errors.js'

/** Resolves with the request's result, or rejects with a DoxorError. */
export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(toDoxorError(request.error)), { once: true })
  })
}

/** Resolves when the transaction commits; rejects if it errors or aborts. */
export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener('error', () => reject(toDoxorError(transaction.error)), {
      once: true,
    })
    transaction.addEventListener(
      'abort',
      () =>
        reject(
          transaction.error
            ? toDoxorError(transaction.error)
            : new DoxorError('Aborted', 'The transaction was aborted'),
        ),
      { once: true },
    )
  })
}

/** Returns the IndexedDB factory, or throws `Unavailable` (e.g. during SSR). */
export function getFactory(factory?: IDBFactory): IDBFactory {
  const resolved = factory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB
  if (!resolved) {
    throw new DoxorError('Unavailable', 'IndexedDB is not available in this environment')
  }
  return resolved
}
