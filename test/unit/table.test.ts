import { describe, expect, it, vi } from 'vitest'
import { requestToPromise } from '../../src/idb.js'
import { collection, createDB, DoxorError } from '../../src/index.js'

type User = { id: number; name: string; email: string; age: number }
type Setting = { value: string }

const users = collection<User>().key('id', { autoIncrement: true }).index('email', { unique: true })
const settings = collection<Setting>()
const notes = collection<{ slug: string; body: string }>().key('slug')

function makeDB(name = 'crud') {
  return createDB({ name, collections: { users, settings, notes } })
}

const ali = { name: 'Ali', email: 'ali@x.io', age: 30 }
const sara = { name: 'Sara', email: 'sara@x.io', age: 25 }

describe('insert / get', () => {
  it('B5: insert resolves with the generated key after the write is committed', async () => {
    const db = makeDB()
    const id = await db.users.insert(ali)
    expect(id).toBe(1)
    expect(await db.users.get(id)).toEqual({ id: 1, ...ali })
  })

  it('B6: get resolves with the record, not undefined', async () => {
    const db = makeDB()
    await db.users.insert(ali)
    const user = await db.users.get(1)
    expect(user?.name).toBe('Ali')
    expect(await db.users.get(99)).toBeUndefined()
  })

  it('B12: keys are type-sensitive (1 is not "1")', async () => {
    const db = makeDB()
    await db.users.insert(ali)
    // @ts-expect-error the key is a number
    expect(await db.users.get('1')).toBeUndefined()
  })

  it('B13: supports custom key paths and out-of-line keys', async () => {
    const db = makeDB()
    expect(await db.notes.insert({ slug: 'hello', body: 'x' })).toBe('hello')
    expect(await db.settings.insert({ value: 'dark' }, 'theme')).toBe('theme')
    expect(await db.settings.get('theme')).toEqual({ value: 'dark' })
  })

  it('B4: rejects a duplicate unique value with a catchable Constraint error', async () => {
    const db = makeDB()
    await db.users.insert(ali)
    const duplicate = db.users.insert({ ...sara, email: ali.email })
    await expect(duplicate).rejects.toBeInstanceOf(DoxorError)
    await expect(duplicate).rejects.toMatchObject({ code: 'Constraint' })
    expect(await db.users.count()).toBe(1)
  })

  it('B4: rejects a missing collection-level key with Data, not an uncaught throw', async () => {
    const db = makeDB()
    await expect(db.settings.insert({ value: 'x' })).rejects.toMatchObject({ code: 'Data' })
  })

  it('rejects values that cannot be cloned with DataClone', async () => {
    const db = makeDB()
    const value = { ...ali, callback: () => {} }
    await expect(db.users.insert(value)).rejects.toMatchObject({ code: 'DataClone' })
  })
})

describe('bulk operations', () => {
  it('insertMany adds all records atomically', async () => {
    const db = makeDB()
    expect(await db.users.insertMany([ali, sara])).toEqual([1, 2])
    await expect(
      db.users.insertMany([
        { ...ali, email: 'new@x.io' },
        { ...sara, email: ali.email },
      ]),
    ).rejects.toMatchObject({ code: 'Constraint' })
    expect(await db.users.count()).toBe(2)
  })

  it('getMany keeps the order of the keys', async () => {
    const db = makeDB()
    await db.users.insertMany([ali, sara])
    const found = await db.users.getMany([2, 99, 1])
    expect(found.map((user) => user?.name)).toEqual(['Sara', undefined, 'Ali'])
  })

  it('putMany upserts', async () => {
    const db = makeDB()
    await db.users.insert(ali)
    await db.users.putMany([
      { id: 1, ...ali, age: 31 },
      { id: 2, ...sara },
    ])
    expect((await db.users.toArray()).map((user) => user.age)).toEqual([31, 25])
  })
})

describe('put / update / delete / clear / count / toArray', () => {
  it('put upserts and returns the key', async () => {
    const db = makeDB()
    const id = await db.users.put(ali)
    expect(await db.users.put({ id, ...ali, name: 'Ali R.' })).toBe(id)
    expect(await db.users.get(id)).toMatchObject({ name: 'Ali R.' })
  })

  it('update merges a patch and reports missing records', async () => {
    const db = makeDB()
    const id = await db.users.insert(ali)
    expect(await db.users.update(id, { age: 31 })).toBe(true)
    expect(await db.users.get(id)).toEqual({ id, ...ali, age: 31 })
    expect(await db.users.update(99, { age: 1 })).toBe(false)
  })

  it('update accepts an updater function that returns or mutates', async () => {
    const db = makeDB()
    const id = await db.users.insert(ali)
    await db.users.update(id, (user) => ({ ...user, age: user.age + 1 }))
    await db.users.update(id, (user) => {
      user.name = user.name.toUpperCase()
    })
    expect(await db.users.get(id)).toMatchObject({ name: 'ALI', age: 31 })
  })

  it('update works with out-of-line keys', async () => {
    const db = makeDB()
    await db.settings.insert({ value: 'dark' }, 'theme')
    await db.settings.update('theme', { value: 'light' })
    expect(await db.settings.get('theme')).toEqual({ value: 'light' })
  })

  it('delete, clear, count and toArray', async () => {
    const db = makeDB()
    await db.users.insertMany([ali, sara])
    expect(await db.users.count()).toBe(2)
    await db.users.delete(1)
    await db.users.delete(99)
    expect((await db.users.toArray()).map((user) => user.name)).toEqual(['Sara'])
    await db.users.clear()
    expect(await db.users.count()).toBe(0)
  })

  it('B11: reads use readonly transactions', async () => {
    const db = makeDB()
    await db.ready()
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction')
    await db.users.get(1)
    await db.users.toArray()
    await db.users.count()
    expect(spy.mock.calls.map((call) => call[1])).toEqual(['readonly', 'readonly', 'readonly'])
    spy.mockRestore()
  })
})

describe('transaction()', () => {
  it('commits every write together', async () => {
    const db = makeDB()
    const result = await db.transaction(['users', 'notes'], 'readwrite', async (tx) => {
      const id = await tx.users.insert(ali)
      await tx.notes.insert({ slug: `user-${id}`, body: 'welcome' })
      return id
    })
    expect(result).toBe(1)
    expect(await db.notes.get('user-1')).toEqual({ slug: 'user-1', body: 'welcome' })
  })

  it('rolls everything back when the callback throws', async () => {
    const db = makeDB()
    const failure = new Error('stop')
    await expect(
      db.transaction(['users', 'notes'], 'readwrite', async (tx) => {
        await tx.users.insert(ali)
        await tx.notes.insert({ slug: 'a', body: 'b' })
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(await db.users.count()).toBe(0)
    expect(await db.notes.count()).toBe(0)
  })

  it('rolls back when a request fails, even if the callback catches it', async () => {
    const db = makeDB()
    await db.users.insert(ali)
    await expect(
      db.transaction(['users'], 'readwrite', async (tx) => {
        await tx.users.insert({ ...sara, email: 'other@x.io' })
        await tx.users.insert({ ...sara, email: ali.email }).catch(() => {})
      }),
    ).rejects.toMatchObject({ code: 'Constraint' })
    expect(await db.users.count()).toBe(1)
  })

  it('detects a callback that awaits non-IndexedDB work', async () => {
    const db = makeDB()
    await expect(
      db.transaction(['users'], 'readwrite', async (tx) => {
        await tx.users.insert(ali)
        await new Promise((resolve) => setTimeout(resolve, 5))
        await tx.users.insert(sara)
      }),
    ).rejects.toMatchObject({ code: 'TransactionInactive' })
  })

  it('reports an early commit even when the callback does nothing afterwards', async () => {
    const db = makeDB()
    await expect(
      db.transaction(['users'], 'readwrite', async (tx) => {
        await tx.users.insert(ali)
        await new Promise((resolve) => setTimeout(resolve, 5))
      }),
    ).rejects.toMatchObject({ code: 'TransactionInactive' })
  })

  it('rejects writes in a readonly transaction', async () => {
    const db = makeDB()
    await expect(
      db.transaction(['users'], 'readonly', (tx) => tx.users.insert(ali)),
    ).rejects.toMatchObject({ code: 'ReadOnly' })
  })

  it('returns the callback value for reads', async () => {
    const db = makeDB()
    await db.users.insertMany([ali, sara])
    const names = await db.transaction(['users'], 'readonly', async (tx) =>
      (await tx.users.toArray()).map((user) => user.name),
    )
    expect(names).toEqual(['Ali', 'Sara'])
  })

  it('rejects an unknown collection with NotFound', async () => {
    const db = makeDB()
    await expect(
      // @ts-expect-error not a declared collection
      db.transaction(['missing'], 'readonly', () => {}),
    ).rejects.toMatchObject({ code: 'NotFound' })
  })
})

describe('database state', () => {
  it('rejects reserved collection names', () => {
    expect(() => createDB({ name: 'x', collections: { delete: users } })).toThrow(TypeError)
  })

  it('reopens when the cached connection became unusable', async () => {
    const db = makeDB()
    await db.users.insert(ali)
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('closing', 'InvalidStateError')
    })
    expect(await db.users.count()).toBe(1)
    spy.mockRestore()
  })

  it('blocks writes, but not reads, when the code is outdated', async () => {
    const newer = createDB({
      name: 'stale',
      collections: { users },
      migrations: { 1: () => {} },
    })
    await newer.users.insert(ali)
    newer.close()

    const older = createDB({ name: 'stale', collections: { users } })
    expect(await older.users.count()).toBe(1)
    await expect(older.users.insert(sara)).rejects.toMatchObject({ code: 'Outdated' })
    await expect(older.transaction(['users'], 'readwrite', () => {})).rejects.toMatchObject({
      code: 'Outdated',
    })
  })

  it('writes are visible to plain IndexedDB readers', async () => {
    const db = makeDB('interop')
    await db.users.insert(ali)
    db.close()
    const raw = await requestToPromise(indexedDB.open('interop'))
    const all = await requestToPromise(raw.transaction('users').objectStore('users').getAll())
    raw.close()
    expect(all).toEqual([{ id: 1, ...ali }])
  })
})
