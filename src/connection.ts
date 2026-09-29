import { DoxorError, toDoxorError } from './errors.js'
import { getFactory, requestToPromise } from './idb.js'

/** Payloads of the events a database emits. */
export interface DatabaseEvents {
  /** Another connection (usually another tab) wants to upgrade or delete the database. Doxor has already closed its connection; the next operation reopens it. */
  versionchange: { oldVersion: number; newVersion: number | null }
  /** An open or delete is waiting for other connections (usually other tabs) to close. */
  blocked: { oldVersion: number; newVersion: number | null }
  /** The browser closed the connection abnormally (e.g. site data was cleared). The next operation reopens it. */
  close: undefined
}

export type DatabaseEventName = keyof DatabaseEvents
export type DatabaseListener<E extends DatabaseEventName> = (payload: DatabaseEvents[E]) => void

export interface ConnectionOptions {
  name: string
  indexedDB?: IDBFactory
  IDBKeyRange?: typeof IDBKeyRange
}

/** Opens the database. Later phases replace this with a schema-aware strategy. */
export type OpenStrategy = (
  factory: IDBFactory,
  name: string,
  onBlocked: (event: IDBVersionChangeEvent) => void,
) => Promise<IDBDatabase>

const openLatest: OpenStrategy = (factory, name, onBlocked) => {
  const request = factory.open(name)
  request.addEventListener('blocked', onBlocked)
  return requestToPromise(request)
}

/**
 * Owns the single cached IDBDatabase connection for one database name.
 * Opening is lazy, concurrent callers share one open, and failed opens are not cached.
 */
export class Connection {
  readonly name: string
  readonly #options: ConnectionOptions
  readonly #open: OpenStrategy
  readonly #listeners = new Map<DatabaseEventName, Set<DatabaseListener<DatabaseEventName>>>()
  #pending: Promise<IDBDatabase> | null = null
  #db: IDBDatabase | null = null
  #generation = 0

  constructor(options: ConnectionOptions, open: OpenStrategy = openLatest) {
    if ((options.indexedDB === undefined) !== (options.IDBKeyRange === undefined)) {
      throw new TypeError('Pass `indexedDB` and `IDBKeyRange` together, or neither')
    }
    this.name = options.name
    this.#options = options
    this.#open = open
  }

  /** The IndexedDB factory. Throws `Unavailable` when there is none (e.g. during SSR). */
  get factory(): IDBFactory {
    return getFactory(this.#options.indexedDB)
  }

  /** The IDBKeyRange constructor that matches `factory`. */
  get keyRange(): typeof IDBKeyRange {
    const keyRange =
      this.#options.IDBKeyRange ?? (globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange
    if (!keyRange) {
      throw new DoxorError('Unavailable', 'IndexedDB is not available in this environment')
    }
    return keyRange
  }

  /** Returns the open connection, opening it on first use. */
  get(): Promise<IDBDatabase> {
    if (!this.#pending) {
      const pending = this.#connect()
      this.#pending = pending
      pending.catch(() => {
        if (this.#pending === pending) this.#pending = null
      })
    }
    return this.#pending
  }

  /** Drops the cached connection so the next `get()` reopens it. */
  invalidate(db: IDBDatabase): void {
    if (this.#db !== db) return
    this.#db = null
    this.#pending = null
  }

  /** Closes the connection. The next operation reopens it. */
  close(): void {
    this.#generation++
    const db = this.#db
    this.#db = null
    this.#pending = null
    db?.close()
  }

  /** Closes this connection, then deletes the whole database. */
  async deleteDatabase(): Promise<void> {
    this.close()
    try {
      const request = this.factory.deleteDatabase(this.name)
      request.addEventListener('blocked', (event) => this.#emitBlocked(event))
      await requestToPromise(request)
    } catch (error) {
      throw toDoxorError(error)
    }
  }

  on<E extends DatabaseEventName>(event: E, listener: DatabaseListener<E>): () => void {
    let listeners = this.#listeners.get(event)
    if (!listeners) {
      listeners = new Set()
      this.#listeners.set(event, listeners)
    }
    const stored = listener as DatabaseListener<DatabaseEventName>
    listeners.add(stored)
    return () => {
      listeners.delete(stored)
    }
  }

  async #connect(): Promise<IDBDatabase> {
    const generation = this.#generation
    let db: IDBDatabase
    try {
      db = await this.#open(this.factory, this.name, (event) => this.#emitBlocked(event))
    } catch (error) {
      throw toDoxorError(error)
    }
    if (generation !== this.#generation) {
      db.close()
      throw new DoxorError('Aborted', 'The database was closed while it was opening')
    }
    db.addEventListener('versionchange', (event) => {
      db.close()
      this.invalidate(db)
      this.#emit('versionchange', { oldVersion: event.oldVersion, newVersion: event.newVersion })
    })
    db.addEventListener('close', () => {
      this.invalidate(db)
      this.#emit('close', undefined)
    })
    this.#db = db
    return db
  }

  #emitBlocked(event: IDBVersionChangeEvent): void {
    this.#emit('blocked', { oldVersion: event.oldVersion, newVersion: event.newVersion })
  }

  #emit<E extends DatabaseEventName>(event: E, payload: DatabaseEvents[E]): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      try {
        listener(payload)
      } catch (error) {
        queueMicrotask(() => {
          throw error
        })
      }
    }
  }
}
