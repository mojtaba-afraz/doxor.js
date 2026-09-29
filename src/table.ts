import type { Collection, CollectionSchema } from './collection.js'
import type { Connection } from './connection.js'
import { DoxorError, toDoxorError } from './errors.js'
import { requestToPromise, transactionDone } from './idb.js'

/** The primary key type of a collection: the key property's type, or any valid key for out-of-line keys. */
export type KeyValue<T, K extends string> = [K] extends [never]
  ? IDBValidKey
  : K extends keyof T
    ? T[K]
    : IDBValidKey

/** What `insert`/`put` accept: the key property is optional when keys are auto-generated. */
export type InsertValue<T, K extends string, A extends boolean> = [K] extends [never]
  ? T
  : [A] extends [true]
    ? Omit<T, K> & Partial<Pick<T, K & keyof T>>
    : T

/** Out-of-line collections (declared without `.key()`) take the key as a separate argument. */
export type ExplicitKey<K extends string> = [K] extends [never] ? [key?: IDBValidKey] : []

/** A patch for `update`: any subset of the non-key properties, or a function returning the new record. */
export type Changes<T, K extends string> =
  | Partial<Omit<T, K>>
  // biome-ignore lint/suspicious/noConfusingVoidType: the updater may mutate in place and return nothing
  | ((value: T) => T | void)

/** Record operations on one collection. Every method returns a Promise and rejects with DoxorError. */
export interface Table<
  T,
  K extends string = never,
  I extends string = never,
  A extends boolean = false,
> {
  /** The collection name. */
  readonly name: string
  /** Adds a record and resolves with its key once it is committed. Rejects with `Constraint` if the key or a unique index value already exists. */
  insert(value: InsertValue<T, K, A>, ...key: ExplicitKey<K>): Promise<KeyValue<T, K>>
  /** Adds several records atomically: either all are added or none. */
  insertMany(values: readonly InsertValue<T, K, A>[]): Promise<KeyValue<T, K>[]>
  /** Adds or replaces a record (upsert) and resolves with its key. */
  put(value: InsertValue<T, K, A>, ...key: ExplicitKey<K>): Promise<KeyValue<T, K>>
  /** Adds or replaces several records atomically. */
  putMany(values: readonly InsertValue<T, K, A>[]): Promise<KeyValue<T, K>[]>
  /** Merges `changes` into an existing record in one transaction. Resolves `false` if there is no such record. */
  update(key: KeyValue<T, K>, changes: Changes<T, K>): Promise<boolean>
  /** Resolves with the record, or `undefined`. Keys are type-sensitive: `1` and `'1'` are different keys. */
  get(key: KeyValue<T, K>): Promise<T | undefined>
  /** Resolves with the records in the same order as `keys` (`undefined` for missing ones). */
  getMany(keys: readonly KeyValue<T, K>[]): Promise<(T | undefined)[]>
  /** Deletes a record. Deleting a missing key is not an error. */
  delete(key: KeyValue<T, K>): Promise<void>
  /** Deletes every record in the collection. */
  clear(): Promise<void>
  /** Counts the records in the collection. */
  count(): Promise<number>
  /** Resolves with every record, ordered by key. */
  toArray(): Promise<T[]>
}

/** The Table type for a collection declaration. */
export type TableOf<C> =
  C extends Collection<infer T, infer K, infer I, infer A> ? Table<T, K, I, A> : never

/** Runs `body` against one object store in a transaction of the given mode. */
export type Executor = <R>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => Promise<R>,
) => Promise<R>

function abort(transaction: IDBTransaction): void {
  try {
    transaction.abort()
  } catch {
    // Already committed or aborted.
  }
}

/** Opens a transaction on the cached connection, reopening once if the connection went stale. */
export async function openTransaction(
  connection: Connection,
  stores: string[],
  mode: IDBTransactionMode,
): Promise<IDBTransaction> {
  for (let attempt = 0; ; attempt++) {
    const db = await connection.get()
    if (mode !== 'readonly' && connection.outdated) {
      throw new DoxorError(
        'Outdated',
        'The database was upgraded by newer code; reload the page before writing',
      )
    }
    try {
      return db.transaction(stores, mode)
    } catch (error) {
      if (attempt === 0 && (error as Error | null)?.name === 'InvalidStateError') {
        connection.invalidate(db)
        continue
      }
      throw toDoxorError(error)
    }
  }
}

/** Each standalone operation gets its own transaction and resolves after it commits. */
export function standaloneExecutor(connection: Connection, name: string): Executor {
  return async <R>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => Promise<R>) => {
    const transaction = await openTransaction(connection, [name], mode)
    const done = transactionDone(transaction)
    let result: Promise<R>
    try {
      result = body(transaction.objectStore(name))
    } catch (error) {
      result = Promise.reject(error)
    }
    const value = result.catch((error: unknown) => {
      abort(transaction)
      throw toDoxorError(error)
    })
    const [resolved] = await Promise.all([value, done])
    return resolved as R
  }
}

/** Operations inside `db.transaction()` share its transaction and resolve on request success. */
export function transactionExecutor(transaction: IDBTransaction, name: string): Executor {
  // Using a transaction after it committed throws InvalidStateError (from objectStore()) or
  // TransactionInactiveError (from a request); both mean the callback awaited something else.
  const fail = (error: unknown): Promise<never> =>
    Promise.reject(
      (error as Error | null)?.name === 'InvalidStateError'
        ? new DoxorError('TransactionInactive', 'The transaction already committed', {
            cause: error,
          })
        : toDoxorError(error),
    )
  return (_mode, body) => {
    try {
      return body(transaction.objectStore(name)).catch(fail)
    } catch (error) {
      return fail(error)
    }
  }
}

// Internal, untyped view of a table; the public Table type is applied by createDB.
type Value = Record<string, unknown>
type Key = IDBValidKey

export function createTable(
  name: string,
  schema: CollectionSchema,
  exec: Executor,
): Table<Value, never, string, boolean> {
  const add = (store: IDBObjectStore, value: unknown, key?: Key) =>
    requestToPromise(key === undefined ? store.add(value) : store.add(value, key))
  const put = (store: IDBObjectStore, value: unknown, key?: Key) =>
    requestToPromise(key === undefined ? store.put(value) : store.put(value, key))

  return {
    name,
    insert: (value, ...[key]: [Key?]) => exec('readwrite', (store) => add(store, value, key)),
    insertMany: (values) =>
      exec('readwrite', (store) => Promise.all(values.map((value) => add(store, value)))),
    put: (value, ...[key]: [Key?]) => exec('readwrite', (store) => put(store, value, key)),
    putMany: (values) =>
      exec('readwrite', (store) => Promise.all(values.map((value) => put(store, value)))),
    update: (key, changes) =>
      exec('readwrite', async (store) => {
        const current = await requestToPromise<Value | undefined>(store.get(key))
        if (current === undefined) return false
        const next =
          typeof changes === 'function' ? (changes(current) ?? current) : { ...current, ...changes }
        await put(store, next, schema.keyPath === null ? key : undefined)
        return true
      }),
    get: (key) => exec('readonly', (store) => requestToPromise(store.get(key))),
    getMany: (keys) =>
      exec('readonly', (store) => Promise.all(keys.map((key) => requestToPromise(store.get(key))))),
    delete: (key) =>
      exec('readwrite', async (store) => {
        await requestToPromise(store.delete(key))
      }),
    clear: () =>
      exec('readwrite', async (store) => {
        await requestToPromise(store.clear())
      }),
    count: () => exec('readonly', (store) => requestToPromise(store.count())),
    toArray: () => exec('readonly', (store) => requestToPromise(store.getAll())),
  }
}
