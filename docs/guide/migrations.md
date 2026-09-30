---
title: Schema changes and migrations
description: Upgrade an IndexedDB schema without version numbers. doxor.js adds new collections and indexes automatically and runs data migrations exactly once.
---

# Schema changes and migrations

In raw IndexedDB, every schema change means bumping a version number and writing an `onupgradeneeded` handler.
doxor compares your declaration with the database instead, and upgrades it for you.

## Adding collections and indexes

Adding a collection or an index needs no ceremony: change the declaration, and doxor applies it on the next load,
once, keeping the existing data.

## Changing data

Changing data, or removing and renaming things, goes in `migrations`, numbered from 1:

```ts twoslash
import { collection, createDB } from 'doxor.js'
type User = { id: number; name: string; email: string; age: number }
// ---cut---
export const db = createDB({
  name: 'app',
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
      m.deleteIndex('users', 'email') // re-created from the declaration (now without `unique`)
    },
  },
})
```

## Rules

- Each migration runs **once per database, in order**, inside the upgrade transaction. A new database gets the
  final schema directly and skips migrations, since there is no data to migrate.
- Keys must be `1, 2, 3, …`. **Never renumber or remove a published migration**: some users may not have run it
  yet. To retire one, replace its body with `() => {}`.
- If a migration throws, the whole upgrade (schema and data) is rolled back and the operation rejects with the code
  `Migration`. As with [transactions](./transactions), only await doxor operations inside a migration.
- doxor never deletes a collection or index on its own. Changing a key path, or an index's `unique` or
  `multiEntry` option, is rejected with the code `SchemaConflict` until a migration deletes the old one. It is then
  rebuilt from the declaration.

## The migration context

A migration receives `m`, with:

| Member | |
|---|---|
| `m.collection(name)` | `get`, `put`, `delete`, `toArray` and `modify` on a collection |
| `m.createStore`, `m.deleteStore`, `m.renameStore` | Create, delete or rename a collection |
| `m.createIndex`, `m.deleteIndex` | Create or delete an index |

When an upgrade happens while the site is open in other tabs, see [Multiple tabs](./multiple-tabs).
