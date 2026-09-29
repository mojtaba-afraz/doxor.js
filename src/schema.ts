import type { AnyCollection, CollectionSchema, IndexOptions } from './collection.js'
import type { OpenHooks, OpenStrategy } from './connection.js'
import { DoxorError, toDoxorError } from './errors.js'
import { requestToPromise } from './idb.js'

/** Name of the hidden store where doxor records the applied migration level. */
export const META_STORE = '__doxor__'
const META_KEY = 'meta'
const MAX_ATTEMPTS = 3

interface Meta {
  level: number
  dirty: boolean
}

/** A data migration. It runs inside the upgrade transaction: only await doxor/IndexedDB work. */
export type Migration = (m: MigrationContext) => void | Promise<void>

/** Schema operations available to a migration. */
export interface MigrationContext {
  createStore(name: string, options?: { keyPath?: string; autoIncrement?: boolean }): void
  deleteStore(name: string): void
  renameStore(from: string, to: string): void
  createIndex(store: string, index: string, options?: IndexOptions): void
  deleteIndex(store: string, index: string): void
  collection<T = unknown>(name: string): MigrationCollection<T>
}

/** Data operations on one store inside a migration. */
export interface MigrationCollection<T> {
  get(key: IDBValidKey): Promise<T | undefined>
  put(value: T, key?: IDBValidKey): Promise<IDBValidKey>
  delete(key: IDBValidKey): Promise<void>
  toArray(): Promise<T[]>
  /** Rewrites every record: return a new value, or mutate the given one and return nothing. */
  // biome-ignore lint/suspicious/noConfusingVoidType: callers may mutate in place and return nothing
  modify(update: (value: T) => T | void): Promise<number>
}

/** The validated, runtime form of a database declaration. */
export interface Schema {
  readonly collections: Readonly<Record<string, CollectionSchema>>
  /** `migrations[i]` upgrades the data to level `i + 1`. */
  readonly migrations: readonly Migration[]
}

type KeyPath = string | string[] | null

interface ActualStore {
  keyPath: KeyPath
  autoIncrement: boolean
  indexes: Map<string, { keyPath: KeyPath; unique: boolean; multiEntry: boolean }>
}

export interface SchemaDiff {
  missingStores: string[]
  missingIndexes: Array<[store: string, index: string]>
  conflicts: string[]
}

/** Validates a declaration. Throws a TypeError for programmer mistakes. */
export function buildSchema(
  collections: Readonly<Record<string, AnyCollection>> = {},
  migrations: Readonly<Record<number, Migration>> = {},
): Schema {
  const schemas: Record<string, CollectionSchema> = {}
  for (const [name, declaration] of Object.entries(collections)) {
    if (!name || name === META_STORE) throw new TypeError(`Invalid collection name "${name}"`)
    schemas[name] = declaration.schema
  }
  const levels = Object.keys(migrations)
    .map(Number)
    .sort((a, b) => a - b)
  levels.forEach((level, index) => {
    if (level !== index + 1) {
      throw new TypeError('Migration keys must be the consecutive integers 1, 2, 3, …')
    }
  })
  return { collections: schemas, migrations: levels.map((level) => migrations[level] as Migration) }
}

function normalizeKeyPath(keyPath: unknown): KeyPath {
  if (keyPath === null || keyPath === undefined || keyPath === '') return null
  if (typeof keyPath === 'string') return keyPath
  return Array.from(keyPath as Iterable<string>)
}

function sameKeyPath(a: KeyPath, b: KeyPath): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Reads the physical schema of the given stores through a transaction that covers them. */
export function readStores(
  transaction: IDBTransaction,
  names: Iterable<string>,
): Map<string, ActualStore> {
  const stores = new Map<string, ActualStore>()
  for (const name of names) {
    if (name === META_STORE) continue
    const store = transaction.objectStore(name)
    const indexes: ActualStore['indexes'] = new Map()
    for (const indexName of Array.from(store.indexNames)) {
      const index = store.index(indexName)
      indexes.set(indexName, {
        keyPath: normalizeKeyPath(index.keyPath),
        unique: index.unique,
        multiEntry: index.multiEntry,
      })
    }
    stores.set(name, {
      keyPath: normalizeKeyPath(store.keyPath),
      autoIncrement: store.autoIncrement,
      indexes,
    })
  }
  return stores
}

/** Compares the declared schema with the physical one. Undeclared stores and indexes are ignored. */
export function diffSchema(
  declared: Schema['collections'],
  actual: Map<string, ActualStore>,
): SchemaDiff {
  const diff: SchemaDiff = { missingStores: [], missingIndexes: [], conflicts: [] }
  for (const [name, schema] of Object.entries(declared)) {
    const store = actual.get(name)
    if (!store) {
      diff.missingStores.push(name)
      continue
    }
    if (
      !sameKeyPath(store.keyPath, schema.keyPath) ||
      store.autoIncrement !== schema.autoIncrement
    ) {
      diff.conflicts.push(`collection "${name}": key path or autoIncrement changed`)
    }
    for (const [indexName, options] of Object.entries(schema.indexes)) {
      const index = store.indexes.get(indexName)
      if (!index) {
        diff.missingIndexes.push([name, indexName])
      } else if (
        !sameKeyPath(index.keyPath, indexName) ||
        index.unique !== options.unique ||
        index.multiEntry !== options.multiEntry
      ) {
        diff.conflicts.push(`index "${name}.${indexName}": options changed`)
      }
    }
  }
  return diff
}

/** Creates every declared store and index that does not exist yet. Must run in an upgrade. */
function applyAdditive(
  db: IDBDatabase,
  transaction: IDBTransaction,
  declared: Schema['collections'],
): void {
  for (const [name, schema] of Object.entries(declared)) {
    const store = db.objectStoreNames.contains(name)
      ? transaction.objectStore(name)
      : db.createObjectStore(name, {
          ...(schema.keyPath === null ? {} : { keyPath: schema.keyPath }),
          autoIncrement: schema.autoIncrement,
        })
    for (const [indexName, options] of Object.entries(schema.indexes)) {
      if (!store.indexNames.contains(indexName)) store.createIndex(indexName, indexName, options)
    }
  }
}

function migrationContext(db: IDBDatabase, transaction: IDBTransaction): MigrationContext {
  return {
    createStore: (name, options) => {
      db.createObjectStore(name, options)
    },
    deleteStore: (name) => db.deleteObjectStore(name),
    renameStore: (from, to) => {
      transaction.objectStore(from).name = to
    },
    createIndex: (store, index, options) => {
      transaction.objectStore(store).createIndex(index, index, options)
    },
    deleteIndex: (store, index) => transaction.objectStore(store).deleteIndex(index),
    collection: <T>(name: string): MigrationCollection<T> => {
      const store = () => transaction.objectStore(name)
      return {
        get: (key) => requestToPromise(store().get(key)),
        put: (value, key) => requestToPromise(store().put(value, key)),
        delete: async (key) => {
          await requestToPromise(store().delete(key))
        },
        toArray: () => requestToPromise(store().getAll()),
        modify: (update) =>
          new Promise((resolve, reject) => {
            const request = store().openCursor()
            let count = 0
            request.addEventListener('success', () => {
              const cursor = request.result
              if (!cursor) return resolve(count)
              try {
                const value = cursor.value as T
                cursor.update(update(value) ?? value)
                count++
                cursor.continue()
              } catch (error) {
                reject(toDoxorError(error))
              }
            })
            request.addEventListener('error', () => reject(toDoxorError(request.error)))
          }),
      }
    },
  }
}

/** Runs inside `upgradeneeded`: additive changes, pending migrations, conflict check, level bookkeeping. */
async function runUpgrade(
  db: IDBDatabase,
  transaction: IDBTransaction,
  schema: Schema,
  fresh: boolean,
): Promise<void> {
  if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE)
  const meta = transaction.objectStore(META_STORE)
  const target = schema.migrations.length
  let level = target
  if (!fresh) {
    const current = await requestToPromise<Meta | undefined>(meta.get(META_KEY))
    if (current?.dirty) throw incompleteUpgrade()
    level = current?.level ?? 0
  }
  // Mark the upgrade as in progress: if a migration lets the transaction commit early, the
  // marker stays behind and the next open refuses to re-run migrations on half-migrated data.
  const marked = requestToPromise(meta.put({ level, dirty: true } satisfies Meta, META_KEY))
  if (level < target) {
    await marked
    const context = migrationContext(db, transaction)
    for (let next = level + 1; next <= target; next++) {
      try {
        await (schema.migrations[next - 1] as Migration)(context)
      } catch (error) {
        throw new DoxorError('Migration', `Migration ${next} failed`, { cause: error })
      }
    }
  }
  // Additive changes run after migrations, so a migration can rename or drop a store or index
  // and have it re-created here with the declared options.
  applyAdditive(db, transaction, schema.collections)
  await marked
  const { conflicts } = diffSchema(schema.collections, readStores(transaction, db.objectStoreNames))
  if (conflicts.length) throw schemaConflict(conflicts)
  await requestToPromise(
    meta.put({ level: Math.max(level, target), dirty: false } satisfies Meta, META_KEY),
  )
}

function incompleteUpgrade(): DoxorError {
  return new DoxorError(
    'Migration',
    'A previous upgrade did not finish (a migration probably awaited non-IndexedDB work), so the data may be half-migrated',
  )
}

function schemaConflict(conflicts: string[]): DoxorError {
  return new DoxorError(
    'SchemaConflict',
    `The declared schema conflicts with the database; add a migration that rebuilds it: ${conflicts.join('; ')}`,
  )
}

/** Opens at `version` (or the current version), running `runUpgrade` if an upgrade is needed. */
async function openVersion(
  factory: IDBFactory,
  name: string,
  version: number | undefined,
  schema: Schema,
  hooks: OpenHooks,
): Promise<{ db: IDBDatabase; upgraded: boolean }> {
  const request = version === undefined ? factory.open(name) : factory.open(name, version)
  let upgrade: { settled: boolean; error?: DoxorError } | undefined
  request.addEventListener('blocked', (event) => hooks.blocked(event))
  request.addEventListener('upgradeneeded', (event) => {
    const transaction = request.transaction as IDBTransaction
    const state: { settled: boolean; error?: DoxorError } = { settled: false }
    upgrade = state
    runUpgrade(request.result, transaction, schema, event.oldVersion === 0).then(
      () => {
        state.settled = true
      },
      (error: unknown) => {
        state.settled = true
        state.error =
          error instanceof DoxorError && error.code !== 'TransactionInactive'
            ? error
            : new DoxorError('Migration', 'The upgrade failed', { cause: error })
        try {
          transaction.abort()
        } catch {
          // The transaction already committed; the dirty marker protects the next open.
        }
      },
    )
  })
  let db: IDBDatabase
  try {
    db = await requestToPromise(request)
  } catch (error) {
    throw upgrade?.error ?? toDoxorError(error)
  }
  if (upgrade && (!upgrade.settled || upgrade.error)) {
    db.close()
    throw upgrade.error ?? incompleteUpgrade()
  }
  return { db, upgraded: upgrade !== undefined }
}

async function inspect(
  db: IDBDatabase,
): Promise<{ stores: Map<string, ActualStore>; meta?: Meta }> {
  const names = Array.from(db.objectStoreNames)
  if (!names.length) return { stores: new Map() }
  const transaction = db.transaction(names, 'readonly')
  const stores = readStores(transaction, names)
  if (!names.includes(META_STORE)) return { stores }
  const meta = await requestToPromise<Meta | undefined>(
    transaction.objectStore(META_STORE).get(META_KEY),
  )
  return meta ? { stores, meta } : { stores }
}

/**
 * The schema-aware open strategy:
 * 1. open the current version (a new database gets the whole schema in its first upgrade);
 * 2. compare the declared schema and migration level with the database;
 * 3. if anything is missing or pending, reopen at version + 1, run pending migrations, then
 *    create the missing stores and indexes.
 * Nothing is ever deleted automatically. Races with other tabs are retried.
 */
export function schemaOpen(schema: Schema): OpenStrategy {
  const target = schema.migrations.length
  return async (factory, name, hooks) => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const current = await openVersion(factory, name, undefined, schema, hooks)
      if (current.upgraded) return current.db
      const { db } = current
      let state: Awaited<ReturnType<typeof inspect>>
      try {
        state = await inspect(db)
      } catch (error) {
        db.close()
        throw toDoxorError(error)
      }
      if (state.meta?.dirty) {
        db.close()
        throw incompleteUpgrade()
      }
      const level = state.meta?.level ?? 0
      if (level > target) {
        hooks.outdated({ databaseLevel: level, codeLevel: target })
        return db
      }
      const diff = diffSchema(schema.collections, state.stores)
      const pending = level < target
      if (!pending && diff.conflicts.length) {
        db.close()
        throw schemaConflict(diff.conflicts)
      }
      if (!pending && !diff.missingStores.length && !diff.missingIndexes.length) return db

      const version = db.version + 1
      db.close()
      try {
        const next = await openVersion(factory, name, version, schema, hooks)
        if (next.upgraded) return next.db
        next.db.close() // another tab upgraded to this version first: inspect again
      } catch (error) {
        if (!(error instanceof DoxorError && error.code === 'Version')) throw error
      }
    }
    throw new DoxorError(
      'Version',
      'Could not upgrade the database because other tabs kept upgrading it at the same time',
    )
  }
}
