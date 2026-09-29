import { expect, it } from 'vitest'
import { requestToPromise } from '../../src/idb.js'
import { collection, createDB } from '../../src/index.js'

type Item = { id: number; name: string; tag: string }

const items = collection<Item>().key('id', { autoIncrement: true }).index('name')

async function version(name: string): Promise<number> {
  const db = await requestToPromise(indexedDB.open(name))
  db.close()
  return db.version
}

it('creates, grows and migrates a schema in a real engine', async () => {
  const name = `schema-${crypto.randomUUID()}`
  const v1 = createDB({ name, collections: { items } })
  await v1.ready()
  v1.close()
  expect(await version(name)).toBe(1)

  const raw = await requestToPromise(indexedDB.open(name))
  const tx = raw.transaction('items', 'readwrite')
  tx.objectStore('items').add({ name: 'a', tag: 'x' })
  await new Promise((resolve) => tx.addEventListener('complete', resolve))
  raw.close()

  const v2 = createDB({
    name,
    collections: { items: items.index('tag') },
    migrations: {
      1: async (m) => {
        await m
          .collection<Item>('items')
          .modify((item) => ({ ...item, name: item.name.toUpperCase() }))
      },
    },
  })
  await v2.ready()
  v2.close()
  expect(await version(name)).toBe(2)

  const check = await requestToPromise(indexedDB.open(name))
  const byTag = await requestToPromise(
    check.transaction('items', 'readonly').objectStore('items').index('tag').getAll('x'),
  )
  check.close()
  expect(byTag).toEqual([{ id: 1, name: 'A', tag: 'x' }])
  await createDB({ name }).delete()
})

it('refuses a migration that awaits non-IndexedDB work, and does not re-run it', async () => {
  const name = `early-${crypto.randomUUID()}`
  const v1 = createDB({ name, collections: { items } })
  await v1.ready()
  v1.close()
  let runs = 0
  const make = () =>
    createDB({
      name,
      collections: { items },
      migrations: {
        1: async () => {
          runs++
          await new Promise((resolve) => setTimeout(resolve, 10))
        },
      },
    })
  await expect(make().ready()).rejects.toMatchObject({ code: 'Migration' })
  await expect(make().ready()).rejects.toMatchObject({ code: 'Migration' })
  expect(runs).toBe(1)
  await createDB({ name }).delete()
})
