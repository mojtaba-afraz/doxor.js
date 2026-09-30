---
title: Reading and writing
description: Insert, get, update, put and delete IndexedDB records with doxor.js. Every write resolves after the transaction commits, and batch writes are atomic.
---

# Reading and writing

Each collection is available as `db.<name>`, with methods for reading and writing single records or batches.

```ts twoslash
import { collection, createDB } from 'doxor.js'
type User = { id: number; name: string; email: string; age: number; tags: string[] }
type Setting = { value: string }
const db = createDB({
  name: 'app',
  collections: {
    users: collection<User>().key('id', { autoIncrement: true }).index('email', { unique: true }),
    settings: collection<Setting>(),
  },
})
const sara = { name: 'Sara', email: 'sara@example.com', age: 25, tags: [] }
const reza = { name: 'Reza', email: 'reza@example.com', age: 41, tags: [] }
// ---cut---
const id = await db.users.insert({ name: 'Ali', email: 'ali@example.com', age: 30, tags: ['admin'] })
await db.users.insertMany([sara, reza]) // atomic: all or nothing

const user = await db.users.get(id) // User | undefined
const some = await db.users.getMany([1, 2, 3]) // (User | undefined)[]
const all = await db.users.toArray()
const total = await db.users.count()

await db.users.update(id, { name: 'Ali R.' }) // merge a patch; false if the record is missing
await db.users.update(id, (u) => ({ ...u, tags: [...u.tags, 'dev'] }))
await db.users.put({ id, name: 'Ali', email: 'ali@example.com', age: 30, tags: [] }) // insert or replace
await db.users.delete(id)
await db.users.clear()

await db.settings.insert({ value: 'dark' }, 'theme') // out-of-line key
await db.settings.get('theme')
```

## What to expect

- Writes resolve **after** the transaction commits. `insert` and `put` resolve with the key.
- `insertMany` and `putMany` run in one transaction: either every record is written, or none is.
- `insert` rejects with the code `Constraint` when the key or a unique index value already exists. `put` replaces
  the record with the same key instead.
- `update` resolves with `false` when there is no record with that key, and does not create one.
- Keys are type-sensitive: `1` and `'1'` are different keys.

## What can be stored

Values are stored with the browser's structured clone algorithm. Plain objects, arrays, `Date`, `Map`, `Set`,
`Blob`, `File` and typed arrays work. Functions, class methods, DOM nodes and framework proxies do not; storing
them rejects with the code `DataClone`. With Vue or MobX, store plain data (see
[SSR, frameworks and tests](./ssr-and-testing#vue-and-mobx)).

To write to several collections at once, all or nothing, use a [transaction](./transactions).
