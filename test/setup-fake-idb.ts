import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach } from 'vitest'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})
