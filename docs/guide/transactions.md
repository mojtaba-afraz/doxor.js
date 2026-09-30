---
title: Transactions
description: Group IndexedDB writes across collections into one atomic transaction with doxor.js, and avoid the common "transaction inactive" pitfall.
---

# Transactions

Standalone operations each run in their own transaction. To write to several collections together, all or
nothing, use `db.transaction()`:

```ts twoslash
import { collection, createDB } from 'doxor.js'
type User = { id: number; name: string; email: string; age: number; tags: string[] }
type Note = { slug: string; userId: number; body: string }
const db = createDB({
  name: 'app',
  collections: {
    users: collection<User>().key('id', { autoIncrement: true }),
    notes: collection<Note>().key('slug').index('userId'),
  },
})
// ---cut---
const userId = await db.transaction(['users', 'notes'], 'readwrite', async (tx) => {
  const id = await tx.users.insert({ name: 'Sara', email: 'sara@example.com', age: 25, tags: [] })
  await tx.notes.insert({ slug: `welcome-${id}`, userId: id, body: 'Hello!' })
  return id
})
```

`db.transaction()` resolves with the callback's return value, after the transaction commits.

## Rules

- **Everything commits together, or nothing does.** If the callback throws, or any request fails (even one you
  catch), the whole transaction is rolled back.
- **Only await operations on `tx` inside the callback.** IndexedDB commits a transaction as soon as it has no
  pending requests, so awaiting `fetch()`, timers or other I/O ends it early. doxor detects this and rejects with
  the code `TransactionInactive`. Do that work before or after the transaction.
- **Use `tx`, not `db`.** `db.users` inside the callback runs outside the transaction.
- A `readonly` transaction rejects writes with the code `ReadOnly`.

Every doxor operation is available on `tx.<collection>`, including [queries](./queries).
