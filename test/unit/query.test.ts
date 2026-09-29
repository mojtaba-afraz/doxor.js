import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { collection, createDB } from '../../src/index.js'

type User = { id: number; name: string; age: number; tags: string[]; joined: Date }

const users = collection<User>()
  .key('id', { autoIncrement: true })
  .index('name')
  .index('age')
  .index('tags', { multiEntry: true })
  .index('joined')

const people: Omit<User, 'id'>[] = [
  { name: 'Ali', age: 30, tags: ['admin', 'dev'], joined: new Date('2024-01-01') },
  { name: 'Amir', age: 17, tags: ['dev'], joined: new Date('2024-06-01') },
  { name: 'Sara', age: 25, tags: ['admin', 'design'], joined: new Date('2025-01-01') },
  { name: 'Reza', age: 40, tags: [], joined: new Date('2025-06-01') },
  { name: 'Mina', age: 25, tags: ['design', 'dev'], joined: new Date('2026-01-01') },
]

let db: ReturnType<typeof makeDB>
function makeDB() {
  return createDB({ name: 'query', collections: { users } })
}

const names = (list: User[]) => list.map((user) => user.name)

beforeEach(async () => {
  db = makeDB()
  await db.users.insertMany(people)
})

describe('ranges', () => {
  it('equals / gt / gte / lt / lte', async () => {
    expect(names(await db.users.where('age').equals(25).toArray())).toEqual(['Sara', 'Mina'])
    expect(names(await db.users.where('age').gt(25).toArray())).toEqual(['Ali', 'Reza'])
    expect(names(await db.users.where('age').gte(25).toArray())).toEqual([
      'Sara',
      'Mina',
      'Ali',
      'Reza',
    ])
    expect(names(await db.users.where('age').lt(25).toArray())).toEqual(['Amir'])
    expect(names(await db.users.where('age').lte(25).toArray())).toEqual(['Amir', 'Sara', 'Mina'])
  })

  it('between includes the lower bound and excludes the upper one by default', async () => {
    expect(names(await db.users.where('age').between(17, 30).toArray())).toEqual([
      'Amir',
      'Sara',
      'Mina',
    ])
    expect(
      names(
        await db.users
          .where('age')
          .between(17, 30, { includeLower: false, includeUpper: true })
          .toArray(),
      ),
    ).toEqual(['Sara', 'Mina', 'Ali'])
  })

  it('startsWith matches string prefixes', async () => {
    expect(names(await db.users.where('name').startsWith('A').toArray())).toEqual(['Ali', 'Amir'])
    expect(await db.users.where('name').startsWith('Z').toArray()).toEqual([])
  })

  it('anyOf matches any value, in index order, without duplicates', async () => {
    expect(names(await db.users.where('age').anyOf([40, 17, 17]).toArray())).toEqual([
      'Amir',
      'Reza',
    ])
    expect(await db.users.where('age').anyOf([]).toArray()).toEqual([])
    expect(await db.users.where('age').anyOf([]).count()).toBe(0)
  })

  it('queries Date indexes', async () => {
    const since = new Date('2025-01-01')
    expect(names(await db.users.where('joined').gte(since).toArray())).toEqual([
      'Sara',
      'Reza',
      'Mina',
    ])
  })

  it('queries the primary key', async () => {
    expect(await db.users.where('id').between(2, 4).keys()).toEqual([2, 3])
  })

  it('without a range, iterates the whole index in order', async () => {
    expect(names(await db.users.where('age').toArray())).toEqual([
      'Amir',
      'Sara',
      'Mina',
      'Ali',
      'Reza',
    ])
  })
})

describe('modifiers', () => {
  it('reverse / offset / limit', async () => {
    expect(names(await db.users.where('age').reverse().limit(2).toArray())).toEqual(['Reza', 'Ali'])
    expect(names(await db.users.where('age').offset(1).limit(2).toArray())).toEqual([
      'Sara',
      'Mina',
    ])
    expect(names(await db.users.where('age').anyOf([17, 40]).reverse().toArray())).toEqual([
      'Reza',
      'Amir',
    ])
    expect(await db.users.where('age').limit(0).toArray()).toEqual([])
  })

  it('filter runs in JavaScript after the range', async () => {
    const query = db.users
      .where('age')
      .gte(20)
      .filter((user) => user.name.includes('a'))
    expect(names(await query.toArray())).toEqual(['Sara', 'Mina', 'Reza'])
    expect(await query.count()).toBe(3)
    expect(names(await query.filter((user) => user.age > 30).toArray())).toEqual(['Reza'])
  })

  it('is immutable', async () => {
    const adults = db.users.where('age').gte(18)
    adults.limit(1)
    expect(await adults.count()).toBe(4)
  })

  it('rejects invalid offsets and limits', () => {
    expect(() => db.users.where('age').limit(-1)).toThrow(RangeError)
    expect(() => db.users.where('age').offset(1.5)).toThrow(RangeError)
  })
})

describe('terminals', () => {
  it('first / count / keys', async () => {
    expect((await db.users.where('age').gte(25).first())?.name).toBe('Sara')
    expect(await db.users.where('age').gte(100).first()).toBeUndefined()
    expect(await db.users.where('age').equals(25).count()).toBe(2)
    expect(await db.users.where('age').equals(25).limit(1).count()).toBe(1)
    expect(await db.users.where('age').equals(25).keys()).toEqual([3, 5])
  })

  it('delete removes the matching records', async () => {
    expect(await db.users.where('age').lt(25).delete()).toBe(1)
    expect(await db.users.where('tags').equals('design').delete()).toBe(2)
    expect(names(await db.users.toArray())).toEqual(['Ali', 'Reza'])
  })
})

describe('multiEntry indexes', () => {
  it('match by element and return each record once', async () => {
    expect(names(await db.users.where('tags').equals('dev').toArray())).toEqual([
      'Ali',
      'Amir',
      'Mina',
    ])
    const tagged = db.users.where('tags').anyOf(['admin', 'dev'])
    expect(names(await tagged.toArray())).toEqual(['Ali', 'Sara', 'Amir', 'Mina'])
    expect(await tagged.count()).toBe(4)
    expect(await db.users.where('tags').toArray()).toHaveLength(4)
  })
})

describe('multiEntry with non-numeric primary keys', () => {
  it('de-duplicates records keyed by arrays, dates and binary data', async () => {
    const items = createDB({
      name: 'keys',
      collections: {
        items: collection<{ tags: string[] }>().index('tags', { multiEntry: true }),
      },
    })
    await items.items.insert({ tags: ['a', 'b'] }, [1, 'x'])
    await items.items.insert({ tags: ['a', 'b'] }, new Date('2026-01-01'))
    await items.items.insert({ tags: ['a', 'b'] }, new Uint8Array([1, 2]))
    await items.items.insert({ tags: ['a', 'b'] }, new Uint8Array([1, 2]).buffer.slice(0, 1))
    expect(await items.items.where('tags').anyOf(['a', 'b']).count()).toBe(4)
  })
})

describe('inside transactions', () => {
  it('queries and deletes atomically with other operations', async () => {
    await db.transaction(['users'], 'readwrite', async (tx) => {
      const minors = await tx.users.where('age').lt(18).toArray()
      expect(names(minors)).toEqual(['Amir'])
      await tx.users.where('age').lt(18).delete()
      await tx.users.insert({ name: 'New', age: 20, tags: [], joined: new Date() })
    })
    expect(await db.users.where('age').lt(18).count()).toBe(0)
    expect(await db.users.count()).toBe(5)
  })
})

describe('types', () => {
  it('only allows declared indexes and the key, with typed values', () => {
    expectTypeOf(db.users.where('age').gte).parameter(0).toEqualTypeOf<number>()
    expectTypeOf(db.users.where('tags').equals).parameter(0).toEqualTypeOf<string>()
    expectTypeOf(db.users.where('joined').gte).parameter(0).toEqualTypeOf<Date>()
    expectTypeOf(db.users.where('age').keys).returns.toEqualTypeOf<Promise<number[]>>()
    // @ts-expect-error `email` is not an index
    db.users.where('email')
    // @ts-expect-error `age` is a number
    db.users.where('age').equals('25')
    // @ts-expect-error startsWith needs a string index
    db.users.where('age').startsWith('1')
  })
})
