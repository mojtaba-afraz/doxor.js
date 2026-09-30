---
title: Migrating from 1.x
description: Move from the doxor.js 1.x callback API to 2.x typed collections. Databases created by 1.x open with 2.x and keep their data.
---

# Migrating from 1.x

doxor 2.0 is a complete rewrite that replaces the 2022 callback API. 1.x is not maintained.

```ts
// 1.x
import Doxor from 'doxor.js'
const db = new Doxor('app')
db.Store({ name: 'users', indexes: [{ key: 'email', unique: true }] })
db.Insert('users', { name: 'Ali', email: 'ali@example.com' })
db.get('users', 1, (user) => console.log(user))
db.getAll('users', (users) => console.log(users))
db.remove('users', 1)
```

```ts twoslash
type User = { id: number; name: string; email: string }
// ---cut---
// 2.x
import { collection, createDB } from 'doxor.js'
const db = createDB({
  name: 'app',
  collections: {
    users: collection<User>().key('id', { autoIncrement: true }).index('email', { unique: true }),
  },
})
await db.users.insert({ name: 'Ali', email: 'ali@example.com' })
console.log(await db.users.get(1))
console.log(await db.users.toArray())
await db.users.delete(1)
```

## Existing data

Databases created by 1.x open with 2.x when you declare the same shape: the same collection names,
`key('id', { autoIncrement: true })`, and the same indexes with the same `unique` settings. Existing data is kept.

## What changed

- Callbacks are replaced by Promises that resolve after the data is committed.
- Stores are declared up front in `createDB()`, instead of created at runtime with `db.Store()`.
- Types come from the declaration, so collection names, index names and record shapes are checked by the
  compiler.
- Errors are [`DoxorError`s with stable codes](./errors).

Start with [Getting started](./getting-started) for the full 2.x setup.
