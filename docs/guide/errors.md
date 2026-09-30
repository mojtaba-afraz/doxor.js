---
title: Errors
description: Handle IndexedDB errors with doxor.js. Every rejection is a DoxorError with a stable code such as Constraint, Quota, Outdated or TransactionInactive.
---

# Errors

Every rejection is a `DoxorError`. Check `error.code`; the original error is in `error.cause`.

```ts twoslash
import { collection, createDB, DoxorError } from 'doxor.js'
type User = { id: number; name: string; email: string }
const db = createDB({
  name: 'app',
  collections: { users: collection<User>().key('id', { autoIncrement: true }).index('email', { unique: true }) },
})
declare const user: { name: string; email: string }
declare function showEmailTaken(): void
// ---cut---
try {
  await db.users.insert(user)
} catch (error) {
  if (error instanceof DoxorError && error.code === 'Constraint') showEmailTaken()
  else throw error
}
```

## Error codes

| Code | Meaning |
|---|---|
| `Constraint` | The key or a unique index value already exists. |
| `NotFound` | The collection or index does not exist. |
| `Data` | Not a valid key, or a required key is missing. |
| `DataClone` | The value cannot be stored (functions, DOM nodes, proxies). |
| `Quota` | The storage quota is exceeded. |
| `ReadOnly` | A write in a `readonly` transaction. |
| `TransactionInactive` | The transaction committed before the work finished (an `await` on non-IndexedDB work). |
| `Outdated` | Newer code upgraded the database; reload before writing. |
| `SchemaConflict` | An incompatible schema change without a migration. |
| `Migration` | A migration failed, or a previous upgrade did not finish. |
| `Version` | The database kept changing version during an upgrade (concurrent upgrades). |
| `Unavailable` | No IndexedDB in this environment (SSR, some private modes). |
| `Aborted` | The transaction or open was aborted. |
| `Unknown` | Anything else; see `cause`. |

The codes are stable, so it is safe to branch on them.

See also: [transactions](./transactions) for `TransactionInactive`, [migrations](./migrations) for
`SchemaConflict` and `Migration`, and [multiple tabs](./multiple-tabs) for `Outdated`.
