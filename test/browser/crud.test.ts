import { expect, it } from 'vitest'
import { collection, createDB } from '../../src/index.js'

type User = { id: number; name: string; email: string }

it('CRUD and transactions behave the same in a real engine', async () => {
  const db = createDB({
    name: `crud-${crypto.randomUUID()}`,
    collections: {
      users: collection<User>().key('id', { autoIncrement: true }).index('email', { unique: true }),
    },
  })
  const id = await db.users.insert({ name: 'Ali', email: 'a@x.io' })
  expect(await db.users.get(id)).toEqual({ id, name: 'Ali', email: 'a@x.io' })
  await expect(db.users.insert({ name: 'B', email: 'a@x.io' })).rejects.toMatchObject({
    code: 'Constraint',
  })
  await expect(
    db.transaction(['users'], 'readwrite', async (tx) => {
      await tx.users.insert({ name: 'C', email: 'c@x.io' })
      throw new Error('rollback')
    }),
  ).rejects.toThrow('rollback')
  await expect(
    db.transaction(['users'], 'readwrite', async (tx) => {
      await tx.users.insert({ name: 'D', email: 'd@x.io' })
      await new Promise((resolve) => setTimeout(resolve, 10))
      await tx.users.insert({ name: 'E', email: 'e@x.io' })
    }),
  ).rejects.toMatchObject({ code: 'TransactionInactive' })
  expect((await db.users.toArray()).map((user) => user.name)).toEqual(['Ali', 'D'])
  await db.delete()
})
