// Mirrors the README examples so the documented API stays accurate (typechecked and executed).
import { expect, it } from 'vitest'
import { collection, createDB, DoxorError } from '../../src/index.js'

type User = { id: number; name: string; email: string; age: number; tags: string[] }
type Note = { slug: string; userId: number; body: string }
type Setting = { value: string }

function declare() {
  return createDB({
    name: 'readme',
    collections: {
      users: collection<User>()
        .key('id', { autoIncrement: true })
        .index('email', { unique: true })
        .index('name')
        .index('age')
        .index('tags', { multiEntry: true }),
      notes: collection<Note>().key('slug').index('userId'),
      settings: collection<Setting>(),
    },
  })
}

it('reading and writing', async () => {
  const db = declare()
  const id = await db.users.insert({
    name: 'Ali',
    email: 'ali@example.com',
    age: 30,
    tags: ['admin'],
  })
  await db.users.insertMany([
    { name: 'Sara', email: 'sara@example.com', age: 25, tags: [] },
    { name: 'Reza', email: 'reza@example.com', age: 12, tags: [] },
  ])
  expect((await db.users.get(id))?.name).toBe('Ali')
  expect(await db.users.getMany([1, 2, 99])).toHaveLength(3)
  expect(await db.users.toArray()).toHaveLength(3)
  expect(await db.users.count()).toBe(3)
  await db.users.update(id, { name: 'Ali R.' })
  await db.users.update(id, (u) => ({ ...u, tags: [...u.tags, 'dev'] }))
  await db.users.put({ id, name: 'Ali', email: 'ali@example.com', age: 30, tags: [] })
  await db.settings.insert({ value: 'dark' }, 'theme')
  expect(await db.settings.get('theme')).toEqual({ value: 'dark' })

  await db.users.where('age').gte(18).toArray()
  await db.users.where('age').between(18, 65).reverse().limit(10).toArray()
  await db.users.where('name').startsWith('A').first()
  await db.users.where('tags').anyOf(['admin', 'dev']).count()
  await db.users.where('id').between(100, 200).keys()
  expect(
    await db.users
      .where('age')
      .lt(13)
      .filter((u) => u.tags.length === 0)
      .delete(),
  ).toBe(1)

  const userId = await db.transaction(['users', 'notes'], 'readwrite', async (tx) => {
    const newId = await tx.users.insert({
      name: 'Mina',
      email: 'mina@example.com',
      age: 25,
      tags: [],
    })
    await tx.notes.insert({ slug: `welcome-${newId}`, userId: newId, body: 'Hello!' })
    return newId
  })
  expect(await db.notes.where('userId').equals(userId).count()).toBe(1)

  try {
    await db.users.insert({ name: 'Dup', email: 'ali@example.com', age: 1, tags: [] })
  } catch (error) {
    expect(error instanceof DoxorError && error.code === 'Constraint').toBe(true)
  }

  await db.users.delete(id)
  await db.users.clear()
})

it('migrations', async () => {
  const v1 = createDB({
    name: 'readme-migrations',
    collections: {
      users: collection<User>().key('id', { autoIncrement: true }).index('email', { unique: true }),
    },
  })
  await v1.users.insert({ name: 'Ali', email: 'ALI@example.com', age: 30, tags: [] })
  v1.close()

  const db = createDB({
    name: 'readme-migrations',
    collections: {
      users: collection<User>().key('id', { autoIncrement: true }).index('email'),
    },
    migrations: {
      1: async (m) => {
        await m.collection<User>('users').modify((user) => {
          user.email = user.email.toLowerCase()
        })
      },
      2: (m) => {
        m.deleteIndex('users', 'email')
      },
    },
  })
  expect(await db.users.where('email').equals('ali@example.com').count()).toBe(1)
  await db.users.insert({ name: 'Twin', email: 'ali@example.com', age: 30, tags: [] })
})
