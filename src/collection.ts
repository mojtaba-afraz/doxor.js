/** Options for a secondary index. */
export interface IndexOptions {
  /** Reject records whose indexed value already exists. */
  unique?: boolean
  /** For array values, index every element instead of the array as a whole. */
  multiEntry?: boolean
}

/** Runtime description of one collection, as stored in IndexedDB. */
export interface CollectionSchema {
  /** The property holding the primary key, or `null` for out-of-line keys. */
  readonly keyPath: string | null
  readonly autoIncrement: boolean
  readonly indexes: Readonly<Record<string, Required<IndexOptions>>>
}

type StringKeys<T> = Extract<keyof T, string>

/**
 * A collection declaration. Build one with {@link collection}; the type parameters track the
 * record type, key property, declared indexes and whether keys are auto-generated.
 */
export class Collection<
  T,
  Key extends string = never,
  Index extends string = never,
  Auto extends boolean = false,
> {
  readonly schema: CollectionSchema
  declare readonly '~types'?: { record: T; key: Key; index: Index; autoIncrement: Auto }

  constructor(schema: CollectionSchema) {
    this.schema = schema
  }

  /**
   * Uses a record property as the primary key.
   * With `autoIncrement: true` the key is generated and becomes optional on insert.
   */
  key<P extends StringKeys<T>, A extends boolean = false>(
    path: P,
    options?: { autoIncrement?: A },
  ): Collection<T, P, Index, A> {
    return new Collection({
      ...this.schema,
      keyPath: path,
      autoIncrement: options?.autoIncrement ?? false,
    })
  }

  /** Adds a secondary index on a record property, so it can be queried with `where()`. */
  index<P extends StringKeys<T>>(
    path: P,
    options?: IndexOptions,
  ): Collection<T, Key, Index | P, Auto> {
    return new Collection({
      ...this.schema,
      indexes: {
        ...this.schema.indexes,
        [path]: { unique: options?.unique ?? false, multiEntry: options?.multiEntry ?? false },
      },
    })
  }
}

/** Any collection declaration, regardless of its record type. */
export type AnyCollection = Collection<unknown, string, string, boolean>

/**
 * Declares a collection of `T` records.
 *
 * @example
 * ```ts
 * const users = collection<User>()
 *   .key('id', { autoIncrement: true })
 *   .index('email', { unique: true })
 * ```
 */
export function collection<T>(): Collection<T> {
  return new Collection({ keyPath: null, autoIncrement: false, indexes: {} })
}
