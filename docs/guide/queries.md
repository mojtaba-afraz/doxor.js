---
title: Queries
description: Query IndexedDB by index with doxor.js. Typed ranges (between, startsWith, anyOf), reverse order, offset, limit and filter, with results in index order.
---

# Queries

Queries run over a declared [index](./collections#indexes) or the key property. Start one with
`where(index)`, pick a range, add modifiers, and finish with a result method:

```ts twoslash
import { collection, createDB } from 'doxor.js'
type User = { id: number; name: string; email: string; age: number; tags: string[] }
const db = createDB({
  name: 'app',
  collections: {
    users: collection<User>()
      .key('id', { autoIncrement: true })
      .index('name')
      .index('age')
      .index('tags', { multiEntry: true }),
  },
})
// ---cut---
await db.users.where('age').gte(18).toArray()
await db.users.where('age').between(18, 65).reverse().limit(10).toArray() // [18, 65)
await db.users.where('name').startsWith('A').first()
await db.users.where('tags').anyOf(['admin', 'dev']).count() // each user once
await db.users.where('id').between(100, 200).keys()
await db.users.where('age').lt(13).filter((u) => u.tags.length === 0).delete() // resolves with the count
```

| Ranges | Modifiers | Results |
|---|---|---|
| `equals` `gt` `gte` `lt` `lte` `between` `startsWith` `anyOf` | `reverse` `offset` `limit` `filter` | `toArray` `first` `count` `keys` `delete` |

## How queries behave

- Results are ordered by the indexed value, then by key.
- `between(a, b)` includes `a` and excludes `b`. Pass `{ includeLower, includeUpper }` to change that.
- `filter()` runs in JavaScript after the index range, so put the most selective condition in the range.
- On a `multiEntry` index, a record that matches several values is returned once.
- Queries are immutable: every method returns a new query, so you can build on a shared base query.
- Nothing runs until a result method (`toArray`, `first`, `count`, `keys` or `delete`) is called.

## Typed values

The value types come from the index. `where('age')` accepts numbers, `where('name')` accepts strings, and an index
name that was not declared is a compile error:

```ts twoslash
// @errors: 2345
import { collection, createDB } from 'doxor.js'
type User = { id: number; name: string; age: number }
const db = createDB({
  name: 'app',
  collections: { users: collection<User>().key('id', { autoIncrement: true }).index('age') },
})
// ---cut---
db.users.where('agee')
```

To run a query and other operations in one transaction, call it on `tx.users` inside
[`db.transaction()`](./transactions).
