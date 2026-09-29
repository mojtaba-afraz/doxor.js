import type { AnyCollection } from './collection.js'
import {
  Connection,
  type ConnectionOptions,
  type DatabaseEventName,
  type DatabaseListener,
} from './connection.js'
import { buildSchema, type Migration, schemaOpen } from './schema.js'

export interface CreateDBOptions extends ConnectionOptions {
  /**
   * The collections (object stores) and their indexes. Adding a collection or an index is
   * applied automatically on the next open; nothing is ever deleted automatically.
   */
  collections?: Readonly<Record<string, AnyCollection>>
  /**
   * Data migrations, keyed by the consecutive integers 1, 2, 3, … Each runs once per database,
   * in order, inside the upgrade transaction. Never remove or renumber a published migration.
   */
  migrations?: Readonly<Record<number, Migration>>
}

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
 * export const db = createDB({
 *   name: 'app',
 *   collections: {
 *     users: collection<User>().key('id', { autoIncrement: true }).index('email', { unique: true }),
 *   },
 * })
 * db.on('versionchange', () => showReloadBanner())
 * ```
 */
export function createDB(options: CreateDBOptions): Database {
  const schema = buildSchema(options.collections, options.migrations)
  const connection = new Connection(options, schemaOpen(schema))
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
