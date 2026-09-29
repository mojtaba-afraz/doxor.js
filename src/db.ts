import {
  Connection,
  type ConnectionOptions,
  type DatabaseEventName,
  type DatabaseListener,
} from './connection.js'

export interface CreateDBOptions extends ConnectionOptions {}

export interface Database {
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
}

/**
 * Declares a database. Nothing is opened until the first operation (or `ready()`),
 * so it is safe to call during SSR and at module load.
 *
 * @example
 * ```ts
 * export const db = createDB({ name: 'app' })
 * db.on('versionchange', () => showReloadBanner())
 * ```
 */
export function createDB(options: CreateDBOptions): Database {
  const connection = new Connection(options)
  return {
    name: options.name,
    ready: async () => {
      await connection.get()
    },
    close: () => connection.close(),
    delete: () => connection.deleteDatabase(),
    on: (event, listener) => connection.on(event, listener),
  }
}
