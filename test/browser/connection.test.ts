import { expect, it } from 'vitest'
import { requestToPromise } from '../../src/idb.js'
import { createDB } from '../../src/index.js'

it('B1: an upgrade from another connection is not blocked by an idle doxor connection', async () => {
  const name = `upgrade-${crypto.randomUUID()}`
  const db = createDB({ name })
  const events: unknown[] = []
  db.on('versionchange', (payload) => events.push(payload))
  await db.ready()

  const other = await requestToPromise(indexedDB.open(name, 2))
  expect(other.version).toBe(2)
  expect(events).toEqual([{ oldVersion: 1, newVersion: 2 }])
  other.close()

  await db.ready()
  await db.delete()
})
