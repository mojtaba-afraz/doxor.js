import { expect, it } from 'vitest'
import { collection, createDB } from '../../src/index.js'

type Post = { id: number; title: string; score: number; tags: string[] }

it('queries behave the same in a real engine', async () => {
  const db = createDB({
    name: `query-${crypto.randomUUID()}`,
    collections: {
      posts: collection<Post>()
        .key('id', { autoIncrement: true })
        .index('title')
        .index('score')
        .index('tags', { multiEntry: true }),
    },
  })
  await db.posts.insertMany([
    { title: 'IndexedDB basics', score: 5, tags: ['db', 'web'] },
    { title: 'Intro to TS', score: 9, tags: ['ts'] },
    { title: 'Offline apps', score: 7, tags: ['db', 'pwa', 'web'] },
  ])
  const titles = (posts: Post[]) => posts.map((post) => post.title)
  expect(titles(await db.posts.where('score').gte(7).reverse().toArray())).toEqual([
    'Intro to TS',
    'Offline apps',
  ])
  expect(titles(await db.posts.where('title').startsWith('In').toArray())).toEqual([
    'IndexedDB basics',
    'Intro to TS',
  ])
  expect(await db.posts.where('tags').anyOf(['db', 'web']).count()).toBe(2)
  expect(await db.posts.where('score').offset(1).limit(1).keys()).toEqual([3])
  expect(await db.posts.where('tags').equals('pwa').delete()).toBe(1)
  expect(await db.posts.count()).toBe(2)
  await db.delete()
})
