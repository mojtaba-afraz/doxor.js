import { expect, it } from 'vitest'
import { collection, createDB } from '../../src/index.js'

type Item = { id: number; name: string }
const items = collection<Item>().key('id', { autoIncrement: true })
const notes = collection<{ id: string }>().key('id')

// Two createDB() instances with the same name behave like two tabs sharing one database.
it('old and new code share a database across "tabs" in a real engine', async () => {
  const name = `tabs-${crypto.randomUUID()}`
  const oldTab = createDB({ name, collections: { items } })
  const events: string[] = []
  oldTab.on('versionchange', () => events.push('versionchange'))
  await oldTab.items.insert({ name: 'a' })

  const newTab = createDB({
    name,
    collections: { items, notes },
    migrations: {
      1: async (m) =>
        void (await m
          .collection<Item>('items')
          .modify((i) => ({ ...i, name: i.name.toUpperCase() }))),
    },
  })
  expect(await newTab.items.toArray()).toEqual([{ id: 1, name: 'A' }])
  expect(events).toEqual(['versionchange'])

  const outdated: unknown[] = []
  oldTab.on('outdated', (info) => outdated.push(info))
  expect(await oldTab.items.count()).toBe(1)
  expect(outdated).toEqual([{ databaseLevel: 1, codeLevel: 0 }])
  await expect(oldTab.items.insert({ name: 'b' })).rejects.toMatchObject({ code: 'Outdated' })

  oldTab.close()
  await newTab.delete()
})

it('reports blocked while another connection holds the database', async () => {
  const name = `blocked-${crypto.randomUUID()}`
  const holder = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const db = createDB({ name })
  let blocked = false
  db.on('blocked', () => {
    blocked = true
    holder.close()
  })
  await db.delete()
  expect(blocked).toBe(true)
})
