import type { AnyCollection } from './collection.js'
import {
  Connection,
  type ConnectionOptions,
  type DatabaseEventName,
  type DatabaseListener,
} from './connection.js'
import { DoxorError } from './errors.js'
import { transactionDone } from './idb.js'
import { buildSchema, type Migration, schemaOpen } from './schema.js'
import {
  createTable,
  openTransaction,
  standaloneExecutor,
  type TableOf,
  transactionExecutor,
} from './table.js'

/** A map of collection names to their declarations. */
export type Collections = Readonly<Record<string, AnyCollection>>

export interface CreateDBOptions<C extends Collections = Collections> extends ConnectionOptions {
  /**
   * The collections (object stores) and their indexes. Adding a collection or an index is
   * applied automatically on the next open; nothing is ever deleted automatically.
   */
  collections?: C
  /**
   * Data migrations, keyed by the consecutive integers 1, 2, 3, … Each runs once per database,
   * in order, inside the upgrade transaction. Never remove or renumber a published migration.
   */
  migrations?: Readonly<Record<number, Migration>>
}

/** The tables available inside `db.transaction()` for the chosen collections. */
export type TransactionTables<C extends Collections, S extends keyof C> = {
  readonly [N in S]: TableOf<C[N]>
}

export interface DatabaseApi<C extends Collections> {
  /** The IndexedDB database name. */
  readonly name: string
  /** Opens the database now instead of on the first operation, surfacing errors early. */
  ready(): Promise<void>
  /** Closes the connection. The next operation reopens it. */
  close(): void
  /** Closes the connection and deletes the whole database. */
  delete(): Promise<void>
  /** Subscribes to a database event. Returns an unsubscribe function. */
  on<E extends DatabaseEventName>(event: E, listener: DatabaseListener<E>): () => void
  /**
   * Runs `callback` in one transaction over `collections`: either every write commits or none does.
   *
   * Only await operations on `tx` inside the callback. Awaiting anything else (fetch, timers)
   * lets IndexedDB commit early; doxor then rejects with `TransactionInactive`. Operations on
   * `db.<collection>` inside the callback are separate transactions. If the callback throws,
   * the transaction is rolled back and the error is rethrown.
   */
  transaction<S extends keyof C & string, R>(
    collections: readonly S[],
    mode: IDBTransactionMode,
    callback: (tx: TransactionTables<C, S>) => Promise<R> | R,
  ): Promise<R>
}

/** A database: its lifecycle API plus one table per declared collection (`db.users`, …). */
export type Database<C extends Collections = Record<never, AnyCollection>> = DatabaseApi<C> & {
  readonly [N in keyof C]: TableOf<C[N]>
}

const RESERVED = new Set(['name', 'ready', 'close', 'delete', 'on', 'transaction'])
const OUT_OF_LINE = { keyPath: null, autoIncrement: false, indexes: {} }

function abort(transaction: IDBTransaction): void {
  try {
    transaction.abort()
  } catch {
    // Already committed or aborted.
  }
}

/**
 * Declares a database. Nothing is opened until the first operation (or `ready()`),
 * so it is safe to call during SSR and at module load.
 *
 * @example
 * ```ts
 * export const db = createDB({
 *   name: 'app',
 *   collections: {
 *     users: collection<User>().key('id', { autoIncrement: true }).index('email', { unique: true }),
 *   },
 * })
 * const id = await db.users.insert({ name: 'Ali', email: 'ali@example.com' })
 * ```
 */
export function createDB<const C extends Collections = Record<never, AnyCollection>>(
  options: CreateDBOptions<C>,
): Database<C> {
  for (const name of Object.keys(options.collections ?? {})) {
    if (RESERVED.has(name))
      throw new TypeError(`"${name}" is reserved and cannot name a collection`)
  }
  const schema = buildSchema(options.collections, options.migrations)
  const connection = new Connection(options, schemaOpen(schema))
  const env = {
    keyRange: () => connection.keyRange,
    cmp: (a: unknown, b: unknown) => connection.factory.cmp(a, b),
  }

  const api: DatabaseApi<Collections> = {
    name: options.name,
    ready: async () => {
      await connection.get()
    },
    close: () => connection.close(),
    delete: () => connection.deleteDatabase(),
    on: (event, listener) => connection.on(event, listener),
    transaction: async (collections, mode, callback) => {
      const transaction = await openTransaction(connection, [...collections], mode)
      const done = transactionDone(transaction)
      let committed = false
      transaction.addEventListener('complete', () => {
        committed = true
      })
      const tables = Object.fromEntries(
        collections.map((name) => [
          name,
          createTable(
            name,
            schema.collections[name] ?? OUT_OF_LINE,
            transactionExecutor(transaction, name),
            env,
          ),
        ]),
      )
      let result: Awaited<ReturnType<typeof callback>>
      try {
        result = await callback(tables as never)
      } catch (error) {
        abort(transaction)
        done.catch(() => {})
        throw error
      }
      if (committed) {
        throw new DoxorError(
          'TransactionInactive',
          'The transaction committed before the callback finished; only await operations on `tx` inside db.transaction()',
        )
      }
      await done
      return result
    },
  }

  const tables = Object.fromEntries(
    Object.entries(schema.collections).map(([name, collectionSchema]) => [
      name,
      createTable(name, collectionSchema, standaloneExecutor(connection, name), env),
    ]),
  )
  return { ...tables, ...api } as unknown as Database<C>
}
