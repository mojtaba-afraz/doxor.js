import { describe, expect, it, vi } from 'vitest'
import { requestToPromise } from '../../src/idb.js'
import { collection, createDB, type Migration } from '../../src/index.js'
import { buildSchema, META_STORE } from '../../src/schema.js'

type User = { id: number; name: string; email: string; age: number; tags: string[] }
type Note = { id: string; body: string; createdAt: string | Date }

const users = collection<User>()
  .key('id', { autoIncrement: true })
  .index('email', { unique: true })
  .index('tags', { multiEntry: true })

async function rawOpen(name: string, version?: number): Promise<IDBDatabase> {
  return requestToPromise(indexedDB.open(name, version))
}

/** Reads the physical schema of a database through a fresh connection. */
async function describeDB(name: string) {
  const db = await rawOpen(name)
  const names = Array.from(db.objectStoreNames)
  const tx = db.transaction(names, 'readonly')
  const stores = Object.fromEntries(
    names.map((store) => {
      const s = tx.objectStore(store)
      const indexes = Object.fromEntries(
        Array.from(s.indexNames).map((i) => {
          const index = s.index(i)
          return [i, { unique: index.unique, multiEntry: index.multiEntry }]
        }),
      )
      return [store, { keyPath: s.keyPath, autoIncrement: s.autoIncrement, indexes }]
    }),
  )
  const meta = names.includes(META_STORE)
    ? await requestToPromise(tx.objectStore(META_STORE).get('meta'))
    : undefined
  db.close()
  return { version: db.version, stores, meta }
}

async function seed(name: string, store: string, records: unknown[]): Promise<void> {
  const db = await rawOpen(name)
  const tx = db.transaction(store, 'readwrite')
  for (const record of records) tx.objectStore(store).add(record)
  await new Promise((resolve) => tx.addEventListener('complete', resolve))
  db.close()
}

async function readAll(name: string, store: string): Promise<unknown[]> {
  const db = await rawOpen(name)
  const all = await requestToPromise(db.transaction(store, 'readonly').objectStore(store).getAll())
  db.close()
  return all
}

describe('collection()', () => {
  it('builds the runtime schema', () => {
    expect(users.schema).toEqual({
      keyPath: 'id',
      autoIncrement: true,
      indexes: {
        email: { unique: true, multiEntry: false },
        tags: { unique: false, multiEntry: true },
      },
    })
    expect(collection<{ k: string }>().schema).toEqual({
      keyPath: null,
      autoIncrement: false,
      indexes: {},
    })
  })

  it('is immutable', () => {
    const base = collection<User>().key('id')
    base.index('age')
    expect(base.schema.indexes).toEqual({})
  })
})

describe('buildSchema validation', () => {
  it('rejects the reserved collection name', () => {
    expect(() => buildSchema({ [META_STORE]: users as never })).toThrow(TypeError)
  })

  it('requires migration keys to be 1..N', () => {
    const noop: Migration = () => {}
    expect(() => buildSchema({}, { 2: noop })).toThrow(TypeError)
    expect(() => buildSchema({}, { 1: noop, 3: noop })).toThrow(TypeError)
    expect(buildSchema({}, { 2: noop, 1: noop }).migrations).toHaveLength(2)
  })
})

describe('first visit', () => {
  it('B2: creates every collection and index in a single open, without VersionError', async () => {
    const open = vi.spyOn(indexedDB, 'open')
    const migration = vi.fn()
    const db = createDB({ name: 'fresh', collections: { users }, migrations: { 1: migration } })
    await db.ready()
    db.close()
    expect(open).toHaveBeenCalledTimes(1)
    expect(migration).not.toHaveBeenCalled()
    const actual = await describeDB('fresh')
    expect(actual.version).toBe(1)
    expect(actual.stores.users).toEqual({
      keyPath: 'id',
      autoIncrement: true,
      indexes: {
        email: { unique: true, multiEntry: false },
        tags: { unique: false, multiEntry: true },
      },
    })
    expect(actual.meta).toEqual({ level: 1, dirty: false })
  })
})

describe('reload', () => {
  it('B3: is idempotent: the same schema never bumps the version', async () => {
    for (let visit = 0; visit < 3; visit++) {
      const db = createDB({ name: 'reload', collections: { users } })
      await db.ready()
      db.close()
    }
    expect((await describeDB('reload')).version).toBe(1)
  })
})

describe('additive changes', () => {
  it('adds a new collection with one version bump and keeps existing data', async () => {
    const v1 = createDB({ name: 'grow', collections: { users } })
    await v1.ready()
    v1.close()
    await seed('grow', 'users', [{ name: 'a', email: 'a@x', age: 1, tags: [] }])

    const notes = collection<Note>().key('id')
    const v2 = createDB({ name: 'grow', collections: { users, notes } })
    await v2.ready()
    v2.close()

    const actual = await describeDB('grow')
    expect(actual.version).toBe(2)
    expect(Object.keys(actual.stores).sort()).toEqual([META_STORE, 'notes', 'users'])
    expect(await readAll('grow', 'users')).toHaveLength(1)
  })

  it('adds a new index and indexes existing records', async () => {
    const v1 = createDB({ name: 'index', collections: { users } })
    await v1.ready()
    v1.close()
    await seed('index', 'users', [{ name: 'a', email: 'a@x', age: 30, tags: [] }])

    const v2 = createDB({ name: 'index', collections: { users: users.index('age') } })
    await v2.ready()
    v2.close()

    const db = await rawOpen('index')
    const found = await requestToPromise(
      db.transaction('users', 'readonly').objectStore('users').index('age').getAll(30),
    )
    db.close()
    expect(found).toHaveLength(1)
  })

  it('never deletes undeclared collections', async () => {
    const v1 = createDB({ name: 'keep', collections: { users, legacy: collection<unknown>() } })
    await v1.ready()
    v1.close()
    const v2 = createDB({ name: 'keep', collections: { users } })
    await v2.ready()
    v2.close()
    expect(Object.keys((await describeDB('keep')).stores)).toContain('legacy')
  })

  it('accepts a database created by doxor 1.x with the same shape', async () => {
    const legacy = await requestToPromise(
      (() => {
        const request = indexedDB.open('v1-app', 2)
        request.addEventListener('upgradeneeded', () => {
          const store = request.result.createObjectStore('users', {
            keyPath: 'id',
            autoIncrement: true,
          })
          store.createIndex('email', 'email', { unique: true })
          store.createIndex('tags', 'tags', { multiEntry: true })
        })
        return request
      })(),
    )
    legacy.close()
    const db = createDB({ name: 'v1-app', collections: { users } })
    await db.ready()
    db.close()
    expect((await describeDB('v1-app')).version).toBe(2)
  })
})

describe('migrations', () => {
  it('run once, in order, on existing data', async () => {
    const v1 = createDB({ name: 'migrate', collections: { notes: collection<Note>().key('id') } })
    await v1.ready()
    v1.close()
    await seed('migrate', 'notes', [{ id: 'n1', body: 'x', createdAt: '2026-01-01' }])

    const order: number[] = []
    const migrations: Record<number, Migration> = {
      1: async (m) => {
        order.push(1)
        const changed = await m.collection<Note>('notes').modify((note) => {
          note.createdAt = new Date(note.createdAt)
        })
        expect(changed).toBe(1)
      },
      2: () => {
        order.push(2)
      },
    }
    for (let visit = 0; visit < 2; visit++) {
      const db = createDB({
        name: 'migrate',
        collections: { notes: collection<Note>().key('id') },
        migrations,
      })
      await db.ready()
      db.close()
    }
    expect(order).toEqual([1, 2])
    const [note] = (await readAll('migrate', 'notes')) as Note[]
    expect(note?.createdAt).toBeInstanceOf(Date)
    expect((await describeDB('migrate')).meta).toEqual({ level: 2, dirty: false })
  })

  it('offer store and index operations and data access', async () => {
    const v1 = createDB({ name: 'ops', collections: { users } })
    await v1.ready()
    v1.close()
    await seed('ops', 'users', [{ name: 'a', email: 'a@x', age: 1, tags: [] }])

    const db = createDB({
      name: 'ops',
      collections: { people: collection<User>().key('id', { autoIncrement: true }) },
      migrations: {
        1: async (m) => {
          m.renameStore('users', 'people')
          m.deleteIndex('people', 'email')
          m.createStore('tmp', { keyPath: 'k' })
          m.createIndex('tmp', 'v', { unique: true })
          const tmp = m.collection<{ k: string; v: number }>('tmp')
          await tmp.put({ k: 'a', v: 1 })
          expect(await tmp.get('a')).toEqual({ k: 'a', v: 1 })
          await tmp.delete('a')
          expect(await tmp.toArray()).toEqual([])
          m.deleteStore('tmp')
        },
      },
    })
    await db.ready()
    db.close()
    const actual = await describeDB('ops')
    expect(Object.keys(actual.stores).sort()).toEqual([META_STORE, 'people'])
    expect(await readAll('ops', 'people')).toHaveLength(1)
  })

  it('roll back everything when a migration throws', async () => {
    const v1 = createDB({ name: 'failing', collections: { users } })
    await v1.ready()
    v1.close()
    await seed('failing', 'users', [{ name: 'a', email: 'a@x', age: 1, tags: [] }])

    const db = createDB({
      name: 'failing',
      collections: { users, notes: collection<Note>().key('id') },
      migrations: {
        1: async (m) => {
          await m.collection<User>('users').modify((user) => ({ ...user, name: 'changed' }))
          throw new Error('bad migration')
        },
      },
    })
    await expect(db.ready()).rejects.toMatchObject({ code: 'Migration' })
    const actual = await describeDB('failing')
    expect(actual.version).toBe(1)
    expect(Object.keys(actual.stores)).not.toContain('notes')
    expect(await readAll('failing', 'users')).toMatchObject([{ name: 'a' }])
  })

  it('detect a migration that awaits non-IndexedDB work and never re-run it', async () => {
    const v1 = createDB({ name: 'early-commit', collections: { users } })
    await v1.ready()
    v1.close()

    const migration = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
    const make = () =>
      createDB({ name: 'early-commit', collections: { users }, migrations: { 1: migration } })
    await expect(make().ready()).rejects.toMatchObject({ code: 'Migration' })
    await expect(make().ready()).rejects.toMatchObject({ code: 'Migration' })
    expect(migration).toHaveBeenCalledTimes(1)
  })
})

describe('conflicts', () => {
  it('reject an incompatible change without a migration, and do not bump the version', async () => {
    const v1 = createDB({ name: 'conflict', collections: { users } })
    await v1.ready()
    v1.close()
    const changed = collection<User>()
      .key('id', { autoIncrement: true })
      .index('email')
      .index('tags', { multiEntry: true })
    const v2 = createDB({ name: 'conflict', collections: { users: changed } })
    await expect(v2.ready()).rejects.toMatchObject({ code: 'SchemaConflict' })
    expect((await describeDB('conflict')).version).toBe(1)
  })

  it('are resolved by a migration that drops the old index', async () => {
    const v1 = createDB({ name: 'rebuild', collections: { users } })
    await v1.ready()
    v1.close()
    const changed = collection<User>()
      .key('id', { autoIncrement: true })
      .index('email')
      .index('tags', { multiEntry: true })
    const v2 = createDB({
      name: 'rebuild',
      collections: { users: changed },
      migrations: { 1: (m) => m.deleteIndex('users', 'email') },
    })
    await v2.ready()
    v2.close()
    const actual = await describeDB('rebuild')
    expect(actual.stores.users?.indexes.email).toEqual({ unique: false, multiEntry: false })
  })

  it('abort the upgrade when a migration leaves a conflict behind', async () => {
    const v1 = createDB({ name: 'still-conflicting', collections: { users } })
    await v1.ready()
    v1.close()
    const changed = collection<User>().key('id')
    const v2 = createDB({
      name: 'still-conflicting',
      collections: { users: changed },
      migrations: { 1: () => {} },
    })
    await expect(v2.ready()).rejects.toMatchObject({ code: 'SchemaConflict' })
    expect((await describeDB('still-conflicting')).version).toBe(1)
  })
})

describe('multiple tabs', () => {
  it('B17: old code does not block new code, and reopens without re-upgrading', async () => {
    const oldTab = createDB({ name: 'tabs', collections: { users } })
    const versionchange = vi.fn()
    oldTab.on('versionchange', versionchange)
    await oldTab.ready()

    const newTab = createDB({
      name: 'tabs',
      collections: { users, notes: collection<Note>().key('id') },
    })
    await newTab.ready()
    expect(versionchange).toHaveBeenCalledTimes(1)

    await oldTab.ready()
    expect((await describeDB('tabs')).version).toBe(2)
    oldTab.close()
    newTab.close()
  })

  it('marks old code as outdated after newer migrations ran', async () => {
    const newTab = createDB({
      name: 'outdated',
      collections: { users },
      migrations: { 1: () => {}, 2: () => {} },
    })
    await newTab.ready()
    newTab.close()

    const oldTab = createDB({
      name: 'outdated',
      collections: { users },
      migrations: { 1: () => {} },
    })
    const outdated = vi.fn()
    oldTab.on('outdated', outdated)
    await oldTab.ready()
    oldTab.close()
    expect(outdated).toHaveBeenCalledWith({ databaseLevel: 2, codeLevel: 1 })
    expect((await describeDB('outdated')).version).toBe(1)
  })

  it('runs a migration once when two instances upgrade at the same time', async () => {
    const v1 = createDB({ name: 'race', collections: { users } })
    await v1.ready()
    v1.close()

    const migration = vi.fn()
    const make = () =>
      createDB({
        name: 'race',
        collections: { users, notes: collection<Note>().key('id') },
        migrations: { 1: migration },
      })
    const a = make()
    const b = make()
    await Promise.all([a.ready(), b.ready()])
    a.close()
    b.close()
    expect(migration).toHaveBeenCalledTimes(1)
    expect((await describeDB('race')).meta).toEqual({ level: 1, dirty: false })
  })
})
