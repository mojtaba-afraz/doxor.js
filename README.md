<p align="center">
  <img src="https://raw.githubusercontent.com/mojtaba-afraz/doxor.js/main/.github/assets/logo.png" width="200" alt="doxor.js logo">
</p>

<h1 align="center">doxor.js</h1>

<p align="center">
  <b>Typed collections for IndexedDB. Declare once, get types, indexes and migrations.</b>
</p>

<p align="center">
  <a href="https://github.com/mojtaba-afraz/doxor.js/actions/workflows/ci.yml"><img src="https://github.com/mojtaba-afraz/doxor.js/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/doxor.js"><img src="https://img.shields.io/npm/v/doxor.js" alt="npm version"></a>
  <img src="https://img.shields.io/badge/size-4.4%20kB%20brotli-brightgreen" alt="Bundle size">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="Zero dependencies">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/mojtaba-afraz/doxor.js" alt="MIT license"></a>
</p>

> [!IMPORTANT]
> **doxor.js 2.0 is a complete rewrite and is not on npm yet.** `npm i doxor.js` currently installs the legacy
> `1.0.0-beta-1` callback API. Prereleases of 2.0 will be published under the `next` tag
> (`npm i doxor.js@next`). See [Migrating from 1.x](#migrating-from-1x).

```ts
import { collection, createDB } from 'doxor.js'

type User = { id: number; name: string; email: string; age: number }

const db = createDB({
  name: 'app',
  collections: {
    users: collection<User>().key('id', { autoIncrement: true }).index('email', { unique: true }).index('age'),
  },
})

const id = await db.users.insert({ name: 'Ali', email: 'ali@example.com', age: 30 }) // number
const adults = await db.users.where('age').gte(18).limit(20).toArray()              // User[]
```

## Why doxor

- **Typed from one declaration.** Record types, key types, index names and query values all come from
  `collection<User>()`. Typos in collection or index names are compile errors.
- **No version bookkeeping.** Add a collection or an index and doxor upgrades the database on the next load.
  Data changes go in numbered migrations that run exactly once.
- **Promises and real errors.** Every operation returns a Promise that resolves after the data is committed,
  or rejects with a `DoxorError` that has a stable `code` (`Constraint`, `Outdated`, …).
- **Safe across tabs.** A tab never blocks another tab's upgrade, and a tab running old code is told it is
  outdated instead of corrupting newer data.
- **Small.** About 4.4 kB min+brotli, zero dependencies, ESM, tree-shakeable. Safe to import during SSR.

## Contents

- [Install](#install)
- [Declaring a database](#declaring-a-database)
- [Reading and writing](#reading-and-writing)
- [Queries](#queries)
- [Transactions](#transactions)
- [Schema changes and migrations](#schema-changes-and-migrations)
- [Multiple tabs](#multiple-tabs)
- [Errors](#errors)
- [SSR, frameworks and tests](#ssr-frameworks-and-tests)
- [API reference](#api-reference)
- [Browser support](#browser-support)
- [Comparison](#comparison)
- [Migrating from 1.x](#migrating-from-1x)

## Install

```sh
npm i doxor.js@next    # pnpm add doxor.js@next · yarn add doxor.js@next · bun add doxor.js@next
```

From a CDN, without a bundler:

```html
<script type="module">
  import { collection, createDB } from 'https://cdn.jsdelivr.net/npm/doxor.js@next/+esm'
</script>
```

doxor.js is ESM-only and ships its own TypeScript types.

## Declaring a database

```ts
import { collection, createDB } from 'doxor.js'

type User = { id: number; name: string; email: string; age: number; tags: string[] }
type Note = { slug: string; userId: number; body: string }
type Setting = { value: string }

export const db = createDB({
  name: 'app',
  collections: {
    // Auto-generated numeric keys: `id` is optional on insert.
    users: collection<User>()
      .key('id', { autoIncrement: true })
      .index('email', { unique: true })       // rejects duplicates
      .index('name')
      .index('age')
      .index('tags', { multiEntry: true }),   // query arrays by element
    // A key you provide yourself.
    notes: collection<Note>().key('slug').index('userId'),
    // No key property: pass the key separately (a key-value store).
    settings: collection<Setting>(),
  },
})
```

`createDB()` does not touch IndexedDB. The database is opened on the first operation (or `await db.ready()`), so
it is safe to create at module level. Create **one instance per database** and share it.

## Reading and writing

Each collection is available as `db.<name>`:

```ts
const id = await db.users.insert({ name: 'Ali', email: 'ali@example.com', age: 30, tags: ['admin'] })
await db.users.insertMany([sara, reza])              // atomic: all or nothing

const user = await db.users.get(id)                   // User | undefined
const some = await db.users.getMany([1, 2, 3])        // (User | undefined)[]
const all = await db.users.toArray()
const total = await db.users.count()

await db.users.update(id, { name: 'Ali R.' })          // merge a patch; false if the record is missing
await db.users.update(id, (u) => ({ ...u, tags: [...u.tags, 'dev'] }))
await db.users.put({ id, name: 'Ali', email: 'ali@example.com', age: 30, tags: [] }) // insert or replace
await db.users.delete(id)
await db.users.clear()

await db.settings.insert({ value: 'dark' }, 'theme')  // out-of-line key
await db.settings.get('theme')
```

- Writes resolve **after** the transaction commits; `insert` and `put` resolve with the key.
- Keys are type-sensitive: `1` and `'1'` are different keys.
- Values are stored with the structured clone algorithm: plain objects, arrays, `Date`, `Map`, `Blob`, … but not
  functions, class methods or framework proxies (see [Vue](#ssr-frameworks-and-tests)).

## Queries

Queries run over a declared index or the key property:

```ts
await db.users.where('age').gte(18).toArray()
await db.users.where('age').between(18, 65).reverse().limit(10).toArray()   // [18, 65)
await db.users.where('name').startsWith('A').first()
await db.users.where('tags').anyOf(['admin', 'dev']).count()                // each user once
await db.users.where('id').between(100, 200).keys()
await db.users.where('age').lt(13).filter((u) => u.tags.length === 0).delete() // resolves with the count
```

| Ranges | Modifiers | Results |
|---|---|---|
| `equals` `gt` `gte` `lt` `lte` `between` `startsWith` `anyOf` | `reverse` `offset` `limit` `filter` | `toArray` `first` `count` `keys` `delete` |

- Results are ordered by the indexed value, then by key.
- `between(a, b)` includes `a` and excludes `b`; pass `{ includeLower, includeUpper }` to change that.
- `filter()` runs in JavaScript after the index range, so put the most selective condition in the range.
- Queries are immutable, so you can build on a shared base query.

## Transactions

Standalone operations each run in their own transaction. Group writes across collections with
`db.transaction()`:

```ts
const userId = await db.transaction(['users', 'notes'], 'readwrite', async (tx) => {
  const id = await tx.users.insert({ name: 'Sara', email: 'sara@example.com', age: 25, tags: [] })
  await tx.notes.insert({ slug: `welcome-${id}`, userId: id, body: 'Hello!' })
  return id
})
```

- Everything commits together, or nothing does. If the callback throws, or any request fails (even one you
  catch), the whole transaction is rolled back.
- **Only await operations on `tx` inside the callback.** IndexedDB commits a transaction as soon as it has no
  pending requests, so awaiting `fetch()`, timers or other I/O ends it early. doxor detects this and rejects
  with `TransactionInactive`. Do that work before or after the transaction.
- `db.users` (not `tx.users`) inside the callback runs outside the transaction.

## Schema changes and migrations

**Adding** a collection or an index needs no ceremony: change the declaration and doxor applies it on the next
load, once, keeping the existing data.

**Changing data**, or removing and renaming things, goes in `migrations`, numbered from 1:

```ts
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

- Each migration runs **once per database, in order**, inside the upgrade transaction. A new database gets the
  final schema directly and skips migrations, since there is no data to migrate.
- Keys must be `1, 2, 3, …`. **Never renumber or remove a published migration**: old users may not have run it
  yet. To retire one, replace its body with `() => {}`.
- If a migration throws, the whole upgrade (schema and data) is rolled back and the operation rejects with
  `Migration`. Only await doxor operations inside a migration, as with transactions.
- doxor never deletes a collection or index on its own. Changing a key path or an index's `unique` / `multiEntry`
  is rejected with `SchemaConflict` until a migration deletes the old one; it is then rebuilt from the
  declaration.

Available in a migration: `m.collection(name)` (`get`, `put`, `delete`, `toArray`, `modify`), `m.createStore`,
`m.deleteStore`, `m.renameStore`, `m.createIndex`, `m.deleteIndex`.

## Multiple tabs

All tabs of your site share one database. doxor handles the hard cases, and tells you through events:

```ts
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

## Errors

Every rejection is a `DoxorError`. Check `error.code`; the original error is in `error.cause`.

```ts
import { DoxorError } from 'doxor.js'

try {
  await db.users.insert(user)
} catch (error) {
  if (error instanceof DoxorError && error.code === 'Constraint') showEmailTaken()
  else throw error
}
```

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

## SSR, frameworks and tests

**SSR (Next.js, Nuxt, SvelteKit, Astro).** Importing doxor and calling `createDB()` on the server is safe: nothing
runs until the first operation. Run operations in client-only code (effects, event handlers). On the server they
reject with `Unavailable`.

**Vue / MobX.** Reactive proxies cannot be stored. Store plain data: `db.todos.put(toRaw(todo))` or
`structuredClone(toRaw(todo))`.

**Persistence.** Browsers may evict site data under storage pressure. Call `navigator.storage.persist()` to ask
for durable storage.

**Tests.** doxor works with [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) in Node:

```ts
import 'fake-indexeddb/auto'                       // installs a global indexedDB
// or inject an implementation explicitly:
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
const db = createDB({ name: 'test', collections, indexedDB: new IDBFactory(), IDBKeyRange })
```

## API reference

### `createDB(options)`

| Option | Type | |
|---|---|---|
| `name` | `string` | The IndexedDB database name. |
| `collections` | `Record<string, Collection>` | The collections and their indexes. |
| `migrations` | `Record<number, (m) => void \| Promise<void>>` | Data migrations, numbered from 1. |
| `indexedDB`, `IDBKeyRange` | | A custom implementation (both or neither). |

Returns a database with one table per collection, plus:

| Member | |
|---|---|
| `db.<collection>` | The collection's table (below). |
| `db.transaction(names, mode, callback)` | Runs `callback(tx)` in one transaction. Resolves with its return value. |
| `db.on(event, listener)` | `versionchange`, `outdated`, `blocked`, `close`. Returns an unsubscribe function. |
| `db.ready()` | Opens the database now, to surface errors early. |
| `db.close()` | Closes the connection; the next operation reopens it. |
| `db.delete()` | Deletes the whole database. |

### `collection<T>()`

| Method | |
|---|---|
| `.key(property, { autoIncrement? })` | Use a property as the primary key. Without `.key()`, keys are passed separately. |
| `.index(property, { unique?, multiEntry? })` | Add a queryable index. |

### Tables

| Method | Returns |
|---|---|
| `insert(value, key?)` | `Promise<Key>`; rejects with `Constraint` on duplicates |
| `insertMany(values)` | `Promise<Key[]>`, atomic |
| `put(value, key?)` | `Promise<Key>`, insert or replace |
| `putMany(values)` | `Promise<Key[]>`, atomic |
| `update(key, patch \| (value) => value)` | `Promise<boolean>` |
| `get(key)` | `Promise<T \| undefined>` |
| `getMany(keys)` | `Promise<(T \| undefined)[]>` |
| `delete(key)` | `Promise<void>` |
| `clear()` | `Promise<void>` |
| `count()` | `Promise<number>` |
| `toArray()` | `Promise<T[]>` |
| `where(index)` | A query (see [Queries](#queries)) |

`key` is only accepted for collections declared without `.key()`.

## Browser support

doxor targets ES2022: Chrome and Edge 94+, Firefox 93+, Safari 15.4+. It is tested on Chromium, Firefox and WebKit
on every change.

## Comparison

| | Size (min+gzip) | Types from | Schema changes | Queries | Live queries / sync |
|---|---|---|---|---|---|
| **doxor.js** | ~4.9 kB | One declaration | Automatic + numbered migrations | Index ranges, filter | No |
| [idb](https://github.com/jakearchibald/idb) | ~1.4 kB | A `DBSchema` interface | Manual `upgrade` callback | Raw IndexedDB | No |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | ~0.8 kB | Generics per call | None (key-value only) | None | No |
| [Dexie.js](https://dexie.org) | ~31 kB | `Table<T>` declarations | Manual version bumps | Rich query API | Yes (liveQuery, Dexie Cloud) |
| [localForage](https://github.com/localForage/localForage) | ~9 kB | Generics per call | None (key-value only) | None | No |

**When not to use doxor:**
- You only need to store a few values by key: use **idb-keyval**.
- You need live queries, complex queries or sync between devices: use **Dexie.js**, **RxDB** or **TanStack DB**.
- You want full control over raw IndexedDB with thin promises: use **idb**.
- You have large relational data or need SQL: consider **SQLite (WASM) on OPFS**.

## Migrating from 1.x

doxor 2.0 replaces the 1.x callback API. 1.x is not maintained.

```ts
// 1.x
import Doxor from 'doxor.js'
const db = new Doxor('app')
db.Store({ name: 'users', indexes: [{ key: 'email', unique: true }] })
db.Insert('users', { name: 'Ali', email: 'ali@example.com' })
db.get('users', 1, (user) => console.log(user))
db.getAll('users', (users) => console.log(users))
db.remove('users', 1)

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

Databases created by 1.x open with 2.x when you declare the same shape: the same collection names, `key('id',
{ autoIncrement: true })` and the same indexes with the same `unique` settings. Existing data is kept.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for setup, tests and the
release process. Please report security issues privately, as described in [SECURITY.md](.github/SECURITY.md).

## Credits

Created by [Mojtaba Afraz](https://github.com/mojtaba-afraz). Thanks to
[Mostafa Saadatnia](https://github.com/MostafaSaadatnia) for the TypeScript port and to
[Arsham Arya](https://github.com/arshamalh) for early documentation.

## License

[MIT](LICENSE)
