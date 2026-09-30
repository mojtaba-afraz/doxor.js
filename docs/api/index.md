---
title: API reference
description: The complete doxor.js API. createDB options, collection declarations, table methods, queries, transactions and database events.
---

# API reference

## `createDB(options)`

| Option | Type | |
|---|---|---|
| `name` | `string` | The IndexedDB database name. |
| `collections` | `Record<string, Collection>` | The collections and their indexes. See [Declaring a database](/guide/collections). |
| `migrations` | `Record<number, (m) => void \| Promise<void>>` | Data migrations, numbered from 1. See [Migrations](/guide/migrations). |
| `indexedDB`, `IDBKeyRange` | | A custom implementation (both or neither). See [Tests](/guide/ssr-and-testing#tests). |

Returns a database with one table per collection, plus:

| Member | |
|---|---|
| `db.<collection>` | The collection's [table](#tables). |
| `db.transaction(names, mode, callback)` | Runs `callback(tx)` in one transaction. Resolves with its return value. See [Transactions](/guide/transactions). |
| `db.on(event, listener)` | `versionchange`, `outdated`, `blocked`, `close`. Returns an unsubscribe function. See [Multiple tabs](/guide/multiple-tabs). |
| `db.ready()` | Opens the database now, to surface errors early. |
| `db.close()` | Closes the connection; the next operation reopens it. |
| `db.delete()` | Deletes the whole database. |

## `collection<T>()`

| Method | |
|---|---|
| `.key(property, { autoIncrement? })` | Use a property as the primary key. Without `.key()`, keys are passed separately. |
| `.index(property, { unique?, multiEntry? })` | Add a queryable index. |

## Tables

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
| `where(index)` | A [query](#queries) |

`key` is only accepted for collections declared without `.key()`.

## Queries

| Kind | Methods |
|---|---|
| Ranges | `equals(value)`, `gt(value)`, `gte(value)`, `lt(value)`, `lte(value)`, `between(lower, upper, { includeLower?, includeUpper? })`, `startsWith(prefix)`, `anyOf(values)` |
| Modifiers | `reverse()`, `offset(n)`, `limit(n)`, `filter(predicate)` |
| Results | `toArray()`, `first()`, `count()`, `keys()`, `delete()` |

See [Queries](/guide/queries) for ordering and behavior.

## `DoxorError`

Every rejection is a `DoxorError` with a stable `code` and the original error in `cause`. See
[Errors](/guide/errors) for the list of codes.
