import { describe, expectTypeOf, it } from 'vitest'
import { collection, createDB, type Table } from '../../src/index.js'

type User = { id: number; name: string; email: string; tags: string[] }
type Setting = { value: string }

const db = createDB({
  name: 'types',
  collections: {
    users: collection<User>().key('id', { autoIncrement: true }).index('email', { unique: true }),
    slugs: collection<{ slug: string; title: string }>().key('slug'),
    settings: collection<Setting>(),
  },
})

// These tests are checked by `tsc` (npm run typecheck); at runtime they only assert shapes.
describe('types', () => {
  it('exposes one typed table per collection', () => {
    expectTypeOf(db.users).toEqualTypeOf<Table<User, 'id', 'email', true>>()
    expectTypeOf(db.users.get).parameter(0).toEqualTypeOf<number>()
    expectTypeOf(db.users.get).returns.toEqualTypeOf<Promise<User | undefined>>()
    expectTypeOf(db.slugs.insert).returns.toEqualTypeOf<Promise<string>>()
  })

  it('makes auto-incremented keys optional on insert', () => {
    expectTypeOf(db.users.insert).parameter(0).toMatchTypeOf<Omit<User, 'id'>>()
    // @ts-expect-error a key property that is not auto-incremented is required
    db.slugs.insert({ title: 'x' }).catch(() => {})
  })

  it('takes a separate key for out-of-line collections only', () => {
    expectTypeOf(db.settings.insert).parameters.toEqualTypeOf<[Setting, IDBValidKey?]>()
    // @ts-expect-error inline-key collections take no key argument
    db.users.insert({ name: '', email: '', tags: [] }, 5).catch(() => {})
  })

  it('does not allow changing the key through update', () => {
    // @ts-expect-error `id` is the key
    db.users.update(1, { id: 2 }).catch(() => {})
    db.users.update(1, { name: 'x' }).catch(() => {})
  })

  it('types transaction tables and results', () => {
    const result = db.transaction(['users', 'slugs'], 'readwrite', async (tx) => {
      expectTypeOf(tx.users).toEqualTypeOf<Table<User, 'id', 'email', true>>()
      // @ts-expect-error not part of this transaction
      tx.settings
      return 42
    })
    expectTypeOf(result).toEqualTypeOf<Promise<number>>()
    result.catch(() => {})
  })

  it('rejects unknown collections at compile time', () => {
    // @ts-expect-error not declared
    db.posts
  })
})
