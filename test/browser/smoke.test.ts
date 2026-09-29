import { expect, it } from 'vitest'
import { requestToPromise, transactionDone } from '../../src/idb.js'

it('round-trips a record through the real IndexedDB engine', async () => {
  const name = `smoke-${crypto.randomUUID()}`
  const open = indexedDB.open(name, 1)
  open.addEventListener('upgradeneeded', () => {
    open.result.createObjectStore('items', { keyPath: 'id', autoIncrement: true })
  })
  const db = await requestToPromise(open)
  const tx = db.transaction('items', 'readwrite')
  const key = requestToPromise(tx.objectStore('items').add({ name: 'a' }))
  await transactionDone(tx)
  const read = db
    .transaction('items', 'readonly')
    .objectStore('items')
    .get(await key)
  expect(await requestToPromise(read)).toEqual({ id: 1, name: 'a' })
  db.close()
  await requestToPromise(indexedDB.deleteDatabase(name))
})
