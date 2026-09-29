import { requestToPromise } from './idb.js'
import type { Executor } from './table.js'

/** The value type an index is queried with; array properties (multiEntry) are queried by element. */
export type IndexValue<T, P> = P extends keyof T
  ? T[P] extends readonly (infer E)[]
    ? E
    : T[P]
  : IDBValidKey

/** Access to the factory-specific IndexedDB helpers, resolved lazily (SSR-safe). */
export interface QueryEnv {
  keyRange(): typeof IDBKeyRange
  cmp(a: unknown, b: unknown): number
}

/**
 * A query over one index (or the primary key). Range methods replace the range; modifiers
 * combine. Nothing runs until a terminal method (`toArray`, `first`, `count`, `keys`, `delete`).
 */
export interface Query<T, K, V> {
  /** Records whose indexed value equals `value`. */
  equals(value: V): Query<T, K, V>
  /** Indexed value greater than `value`. */
  gt(value: V): Query<T, K, V>
  /** Indexed value greater than or equal to `value`. */
  gte(value: V): Query<T, K, V>
  /** Indexed value less than `value`. */
  lt(value: V): Query<T, K, V>
  /** Indexed value less than or equal to `value`. */
  lte(value: V): Query<T, K, V>
  /** Indexed value between `lower` and `upper` (lower included, upper excluded by default). */
  between(
    lower: V,
    upper: V,
    options?: { includeLower?: boolean; includeUpper?: boolean },
  ): Query<T, K, V>
  /** String values starting with `prefix`. */
  startsWith(prefix: V & string): Query<T, K, V>
  /** Indexed value equal to any of `values`. */
  anyOf(values: readonly V[]): Query<T, K, V>
  /** Iterate from the highest indexed value to the lowest. */
  reverse(): Query<T, K, V>
  /** Skip the first `count` matches. */
  offset(count: number): Query<T, K, V>
  /** Return at most `count` matches. */
  limit(count: number): Query<T, K, V>
  /** Keep only records matching `predicate` (evaluated in JavaScript, after the index range). */
  filter(predicate: (value: T) => boolean): Query<T, K, V>
  /** The matching records, ordered by the indexed value, then by primary key. */
  toArray(): Promise<T[]>
  /** The first matching record, or `undefined`. */
  first(): Promise<T | undefined>
  /** The number of matching records. */
  count(): Promise<number>
  /** The primary keys of the matching records. */
  keys(): Promise<K[]>
  /** Deletes the matching records and resolves with how many were deleted. */
  delete(): Promise<number>
}

// [lower, upper, lowerOpen, upperOpen]; `undefined` bounds are open-ended.
type Bounds = [unknown, unknown, boolean, boolean]

interface State {
  ranges: Bounds[]
  reverse: boolean
  offset: number
  limit: number
  filters: ((value: unknown) => boolean)[]
}

const ALL: Bounds = [undefined, undefined, false, false]

function toRange(KeyRange: typeof IDBKeyRange, [lower, upper, lowerOpen, upperOpen]: Bounds) {
  if (lower === undefined) {
    return upper === undefined ? undefined : KeyRange.upperBound(upper, upperOpen)
  }
  return upper === undefined
    ? KeyRange.lowerBound(lower, lowerOpen)
    : KeyRange.bound(lower, upper, lowerOpen, upperOpen)
}

function count(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError('offset() and limit() take a non-negative integer')
  }
  return value
}

/** Stable identity for a primary key, used to de-duplicate multiEntry matches. */
function identity(key: unknown): string {
  if (key instanceof Date) return `d${key.getTime()}`
  if (Array.isArray(key)) return `[${key.map(identity).join()}]`
  if (ArrayBuffer.isView(key) || key instanceof ArrayBuffer) {
    const view = ArrayBuffer.isView(key) ? key : new Uint8Array(key)
    return `b${new Uint8Array(view.buffer, view.byteOffset, view.byteLength).join()}`
  }
  return `${typeof key}${key}`
}

/** Iterates a cursor request; `visit` returns false to stop. Resolves when done. */
function iterate(
  request: IDBRequest<IDBCursorWithValue | null>,
  visit: (cursor: IDBCursorWithValue) => boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => {
      const cursor = request.result
      try {
        if (cursor && visit(cursor)) cursor.continue()
        else resolve()
      } catch (error) {
        reject(error)
      }
    })
    request.addEventListener('error', () => reject(request.error))
  })
}

export function createQuery(
  index: string,
  keyPath: string | null,
  multiEntry: boolean,
  exec: Executor,
  env: QueryEnv,
  state: State = { ranges: [ALL], reverse: false, offset: 0, limit: Infinity, filters: [] },
): Query<unknown, IDBValidKey, unknown> {
  const next = (changes: Partial<State>) =>
    createQuery(index, keyPath, multiEntry, exec, env, { ...state, ...changes })
  const range = (bounds: Bounds) => next({ ranges: [bounds] })

  const source = (store: IDBObjectStore) => (index === keyPath ? store : store.index(index))
  const simple = () =>
    state.ranges.length === 1 &&
    !state.reverse &&
    !state.offset &&
    !state.filters.length &&
    !multiEntry

  /** Walks every matching record in order, applying dedup, filters, offset and limit. */
  const scan = async (store: IDBObjectStore, visit: (cursor: IDBCursorWithValue) => void) => {
    const KeyRange = env.keyRange()
    const seen = new Set<string>()
    let skipped = 0
    let taken = 0
    const ranges = state.reverse ? [...state.ranges].reverse() : state.ranges
    for (const bounds of ranges) {
      if (taken >= state.limit) break
      await iterate(
        source(store).openCursor(toRange(KeyRange, bounds), state.reverse ? 'prev' : 'next'),
        (cursor) => {
          if (multiEntry) {
            const id = identity(cursor.primaryKey)
            if (seen.has(id)) return true
            seen.add(id)
          }
          if (!state.filters.every((predicate) => predicate(cursor.value))) return true
          if (skipped < state.offset) {
            skipped++
            return true
          }
          visit(cursor)
          return ++taken < state.limit
        },
      )
    }
  }

  const collect = <R>(read: (cursor: IDBCursorWithValue) => R) =>
    exec('readonly', async (store) => {
      const results: R[] = []
      await scan(store, (cursor) => results.push(read(cursor)))
      return results
    })

  const all = (kind: 'getAll' | 'getAllKeys', read: (cursor: IDBCursorWithValue) => unknown) => {
    // getAll(range, 0) means "no limit" in IndexedDB, so limit(0) is handled here.
    if (!state.ranges.length || !state.limit) return Promise.resolve([])
    if (!simple()) return collect(read)
    return exec('readonly', (store) => {
      const bounds = state.ranges[0] as Bounds
      const target = source(store)
      const limit = state.limit === Infinity ? undefined : state.limit
      const keyRange = toRange(env.keyRange(), bounds)
      return kind === 'getAll'
        ? requestToPromise<unknown[]>(target.getAll(keyRange, limit))
        : requestToPromise<IDBValidKey[]>(target.getAllKeys(keyRange, limit))
    })
  }

  const query: Query<unknown, IDBValidKey, unknown> = {
    equals: (value) => range([value, value, false, false]),
    gt: (value) => range([value, undefined, true, false]),
    gte: (value) => range([value, undefined, false, false]),
    lt: (value) => range([undefined, value, false, true]),
    lte: (value) => range([undefined, value, false, false]),
    between: (lower, upper, options) =>
      range([lower, upper, !(options?.includeLower ?? true), !(options?.includeUpper ?? false)]),
    startsWith: (prefix) => range([prefix, `${prefix}￿`, false, false]),
    anyOf: (values) =>
      next({
        ranges: [...values]
          .sort((a, b) => env.cmp(a, b))
          .filter((value, i, sorted) => i === 0 || env.cmp(value, sorted[i - 1]) !== 0)
          .map((value) => [value, value, false, false]),
      }),
    reverse: () => next({ reverse: !state.reverse }),
    offset: (value) => next({ offset: count(value) }),
    limit: (value) => next({ limit: count(value) }),
    filter: (predicate) =>
      next({ filters: [...state.filters, predicate as (value: unknown) => boolean] }),
    toArray: () => all('getAll', (cursor) => cursor.value),
    first: async () => (await query.limit(1).toArray())[0],
    keys: () => all('getAllKeys', (cursor) => cursor.primaryKey) as Promise<IDBValidKey[]>,
    count: async () => {
      if (!state.ranges.length) return 0
      if (simple() && state.limit === Infinity) {
        return exec('readonly', (store) =>
          requestToPromise(source(store).count(toRange(env.keyRange(), state.ranges[0] as Bounds))),
        )
      }
      return (await collect(() => 0)).length
    },
    delete: () =>
      exec('readwrite', async (store) => {
        let deleted = 0
        await scan(store, (cursor) => {
          cursor.delete()
          deleted++
        })
        return deleted
      }),
  }
  return query
}
