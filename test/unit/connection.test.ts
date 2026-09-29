import { IDBKeyRange as FakeKeyRange, forceCloseDatabase } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { Connection } from '../../src/connection.js'
import { requestToPromise } from '../../src/idb.js'
import { createDB } from '../../src/index.js'

function openRaw(name: string, version?: number): Promise<IDBDatabase> {
  return requestToPromise(indexedDB.open(name, version))
}

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((info) => info.name ?? '')
}

describe('createDB', () => {
  it('does no I/O until the first operation', async () => {
    const open = vi.spyOn(indexedDB, 'open')
    const db = createDB({ name: 'lazy' })
    expect(open).not.toHaveBeenCalled()
    expect(await databaseNames()).toEqual([])
    await db.ready()
    expect(open).toHaveBeenCalledTimes(1)
    db.close()
  })

  it('B10: can be created without IndexedDB (SSR) and rejects with Unavailable', async () => {
    const original = globalThis.indexedDB
    // @ts-expect-error simulate a server environment
    delete globalThis.indexedDB
    try {
      const db = createDB({ name: 'ssr' })
      await expect(db.ready()).rejects.toMatchObject({ code: 'Unavailable' })
    } finally {
      globalThis.indexedDB = original
    }
  })

  it('requires indexedDB and IDBKeyRange to be injected together', () => {
    expect(() => createDB({ name: 'x', indexedDB })).toThrow(TypeError)
  })
})

describe('Connection', () => {
  it('shares one open between concurrent callers', async () => {
    const open = vi.spyOn(indexedDB, 'open')
    const connection = new Connection({ name: 'shared' })
    const [a, b] = await Promise.all([connection.get(), connection.get()])
    expect(a).toBe(b)
    expect(open).toHaveBeenCalledTimes(1)
    connection.close()
  })

  it('uses the injected factory and key range', async () => {
    const factory = indexedDB
    const connection = new Connection({
      name: 'injected',
      indexedDB: factory,
      IDBKeyRange: FakeKeyRange,
    })
    expect(connection.factory).toBe(factory)
    expect(connection.keyRange).toBe(FakeKeyRange)
    await connection.get()
    connection.close()
  })

  it('does not cache a failed open', async () => {
    const real = indexedDB
    const factory = {
      open: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new DOMException('disk error', 'UnknownError')
        })
        .mockImplementation((name: string) => real.open(name)),
      deleteDatabase: real.deleteDatabase.bind(real),
    } as unknown as IDBFactory
    const connection = new Connection({
      name: 'retry',
      indexedDB: factory,
      IDBKeyRange: FakeKeyRange,
    })
    await expect(connection.get()).rejects.toMatchObject({ code: 'Unknown' })
    await expect(connection.get()).resolves.toBeDefined()
    connection.close()
  })

  it('B1: does not block another connection that upgrades the database', async () => {
    const db = createDB({ name: 'upgrade' })
    const versionchange = vi.fn()
    db.on('versionchange', versionchange)
    await db.ready()

    const other = await openRaw('upgrade', 2)
    expect(other.version).toBe(2)
    expect(versionchange).toHaveBeenCalledWith({ oldVersion: 1, newVersion: 2 })
    other.close()

    await db.ready()
  })

  it('reopens after versionchange at the new version', async () => {
    const connection = new Connection({ name: 'reopen' })
    const first = await connection.get()
    const other = await openRaw('reopen', 3)
    other.close()
    const second = await connection.get()
    expect(second).not.toBe(first)
    expect(second.version).toBe(3)
    connection.close()
  })

  it('emits close and reopens after the browser force-closes the connection', async () => {
    const connection = new Connection({ name: 'forced' })
    const onClose = vi.fn()
    connection.on('close', onClose)
    const first = await connection.get()
    forceCloseDatabase(first as never)
    expect(onClose).toHaveBeenCalledTimes(1)
    const second = await connection.get()
    expect(second).not.toBe(first)
    connection.close()
  })

  it('aborts an open that is closed before it finishes', async () => {
    const connection = new Connection({ name: 'closing' })
    const pending = connection.get()
    connection.close()
    await expect(pending).rejects.toMatchObject({ code: 'Aborted' })
    await expect(connection.get()).resolves.toBeDefined()
    connection.close()
  })

  it('stops calling a listener after unsubscribe', async () => {
    const connection = new Connection({ name: 'unsubscribe' })
    const listener = vi.fn()
    const off = connection.on('versionchange', listener)
    off()
    await connection.get()
    const other = await openRaw('unsubscribe', 2)
    other.close()
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps notifying listeners when one throws, and rethrows asynchronously', async () => {
    const rethrow = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(() => {})
    const connection = new Connection({ name: 'throwing' })
    const second = vi.fn()
    connection.on('versionchange', () => {
      throw new Error('listener failed')
    })
    connection.on('versionchange', second)
    await connection.get()
    const other = await openRaw('throwing', 2)
    other.close()
    expect(second).toHaveBeenCalledTimes(1)
    expect(rethrow).toHaveBeenCalledTimes(1)
    rethrow.mockRestore()
  })
})

describe('delete', () => {
  it('deletes the database without being blocked by its own connection', async () => {
    const db = createDB({ name: 'doomed' })
    await db.ready()
    expect(await databaseNames()).toContain('doomed')
    await db.delete()
    expect(await databaseNames()).not.toContain('doomed')
  })

  it('emits blocked while another connection holds the database', async () => {
    const db = createDB({ name: 'held' })
    const blocked = vi.fn()
    db.on('blocked', blocked)
    const other = await openRaw('held')
    const deleting = db.delete()
    await vi.waitFor(() => expect(blocked).toHaveBeenCalled())
    other.close()
    await deleting
    expect(await databaseNames()).not.toContain('held')
  })

  it('rejects with Unavailable without IndexedDB', async () => {
    const original = globalThis.indexedDB
    // @ts-expect-error simulate a server environment
    delete globalThis.indexedDB
    try {
      await expect(createDB({ name: 'ssr' }).delete()).rejects.toMatchObject({
        code: 'Unavailable',
      })
    } finally {
      globalThis.indexedDB = original
    }
  })
})
