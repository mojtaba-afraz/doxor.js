---
title: Multiple tabs
description: How doxor.js handles IndexedDB across browser tabs, including versionchange, blocked upgrades and tabs running outdated code.
---

# Multiple tabs

All tabs of your site share one database. In raw IndexedDB, an open tab can block another tab's upgrade, and a tab
running old code can keep writing data in an old shape. doxor handles these cases and tells you through events:

```ts twoslash
import { collection, createDB } from 'doxor.js'
type User = { id: number; name: string }
const db = createDB({ name: 'app', collections: { users: collection<User>().key('id') } })
declare function showBanner(message: string): void
// ---cut---
db.on('versionchange', () => {
  // Another tab upgraded or deleted the database. doxor already closed this tab's connection
  // and reopens it on the next operation.
})
db.on('outdated', ({ databaseLevel, codeLevel }) => {
  // This tab runs older code than the database. Reads keep working; writes reject with `Outdated`.
  showBanner('A new version is available. Reload to continue.')
})
db.on('blocked', () => {
  // An upgrade or delete is waiting for another tab that uses IndexedDB without doxor.
})
db.on('close', () => {
  // The browser closed the connection (e.g. site data was cleared). It reopens on the next operation.
})
```

`db.on()` returns a function that removes the listener.

## What doxor does for you

- **A tab never blocks another tab's upgrade.** When another tab upgrades the database, doxor closes this tab's
  connection and reopens it on the next operation.
- **Old code cannot overwrite newer data.** A tab whose declaration is older than the database keeps reading, but
  its writes reject with the code `Outdated`. Listen for `outdated` and ask the user to reload.
- **Lost connections recover.** If the browser closes the connection, for example when site data is cleared, the
  next operation reopens it.
