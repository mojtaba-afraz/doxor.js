---
title: doxor.js vs idb, Dexie.js and localForage
description: An honest comparison of doxor.js with idb, idb-keyval, Dexie.js and localForage for IndexedDB, including when another library is the better choice.
---

# Comparison

doxor sits between raw IndexedDB and a full client-side database. This page compares it with the libraries people
usually consider, and says when one of them is the better choice.

| | Size (min+gzip) | Types from | Schema changes | Queries | Live queries / sync |
|---|---|---|---|---|---|
| **doxor.js** | ~4.9 kB | One declaration | Automatic + numbered migrations | Index ranges, filter | No |
| [idb](https://github.com/jakearchibald/idb) | ~1.4 kB | A `DBSchema` interface | Manual `upgrade` callback | Raw IndexedDB | No |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | ~0.8 kB | Generics per call | None (key-value only) | None | No |
| [Dexie.js](https://dexie.org) | ~31 kB | `Table<T>` declarations | Manual version bumps | Rich query API | Yes (liveQuery, Dexie Cloud) |
| [localForage](https://github.com/localForage/localForage) | ~9 kB | Generics per call | None (key-value only) | None | No |

Sizes are approximate, minified and gzipped. doxor is about 4.4 kB with brotli.

## When not to use doxor

- **You only need to store a few values by key.** Use idb-keyval.
- **You need live queries, complex queries or sync between devices.** Use Dexie.js, RxDB or TanStack DB.
- **You want full control over raw IndexedDB with thin promises.** Use idb.
- **You have large relational data or need SQL.** Consider SQLite (WASM) on OPFS.

## doxor vs idb

idb wraps the raw IndexedDB API in promises and stays close to it: you write the `upgrade` callback and manage
version numbers yourself, and you describe the schema's types in a separate `DBSchema` interface. doxor derives the
types from the same declaration that creates the schema, upgrades the database when the declaration changes, and
adds a query builder and multi-tab handling, at about 3.5 times idb's size.

## doxor vs Dexie.js

Dexie is a full client-side database: a rich query API, live queries, hooks and an optional sync service. doxor
does less and is several times smaller. Its types come from one declaration instead of separate `Table<T>`
declarations, and it needs no version bumps for new collections and indexes. If you need live queries or sync, Dexie is the better
choice today.

## doxor vs localForage and idb-keyval

Both are key-value stores: they have no indexes or queries. If that is all you need, they are simpler. doxor also
supports key-value collections (a collection without `.key()`), next to indexed ones in the same database.

Ready to try it? [Get started](/guide/getting-started) or
<a href="/doxor.js/playground/" target="_self">open the playground</a>.
