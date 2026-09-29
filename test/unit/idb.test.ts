import { describe, expect, it } from 'vitest'
import { DoxorError } from '../../src/errors.js'
import { getFactory, requestToPromise, transactionDone } from '../../src/idb.js'

async function openTestDB(): Promise<IDBDatabase> {
  const request = indexedDB.open('test', 1)
  request.addEventListener('upgradeneeded', () => {
    request.result.createObjectStore('items', { keyPath: 'id', autoIncrement: true })
  })
  return requestToPromise(request)
}

describe('requestToPromise / transactionDone', () => {
  it('resolves with the generated key after the transaction commits', async () => {
    const db = await openTestDB()
    const tx = db.transaction('items', 'readwrite')
    const key = requestToPromise(tx.objectStore('items').add({ name: 'a' }))
    await transactionDone(tx)
    expect(await key).toBe(1)
    db.close()
  })

  it('rejects with a Constraint DoxorError on duplicate keys', async () => {
    const db = await openTestDB()
    const tx = db.transaction('items', 'readwrite')
    const store = tx.objectStore('items')
    store.add({ id: 1 })
    const duplicate = requestToPromise(store.add({ id: 1 }))
    await expect(duplicate).rejects.toMatchObject({ code: 'Constraint' })
    await expect(transactionDone(tx)).rejects.toBeInstanceOf(DoxorError)
    db.close()
  })

  it('rejects with Aborted when the transaction is aborted', async () => {
    const db = await openTestDB()
    const tx = db.transaction('items', 'readwrite')
    const done = transactionDone(tx)
    tx.abort()
    await expect(done).rejects.toMatchObject({ code: 'Aborted' })
    db.close()
  })
})

describe('getFactory', () => {
  it('prefers an injected factory', () => {
    const factory = {} as IDBFactory
    expect(getFactory(factory)).toBe(factory)
  })

  it('throws Unavailable when IndexedDB is missing (SSR)', () => {
    const original = globalThis.indexedDB
    // @ts-expect-error simulate a server environment
    delete globalThis.indexedDB
    try {
      expect(() => getFactory()).toThrow(expect.objectContaining({ code: 'Unavailable' }))
    } finally {
      globalThis.indexedDB = original
    }
  })
})
