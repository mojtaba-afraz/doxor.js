---
title: SSR, frameworks and tests
description: Use doxor.js with Next.js, Nuxt, SvelteKit and Astro, store Vue or MobX state in IndexedDB, and test with fake-indexeddb in Node.
---

# SSR, frameworks and tests

## SSR

With Next.js, Nuxt, SvelteKit or Astro, importing doxor and calling `createDB()` on the server is safe: nothing
runs until the first operation. Run operations in client-only code, such as effects and event handlers. On the
server they reject with the code `Unavailable`.

## Vue and MobX

Reactive proxies cannot be stored in IndexedDB. Store plain data instead: `db.todos.put(toRaw(todo))`, or
`structuredClone(toRaw(todo))` for nested objects.

## Persistence

Browsers may evict site data under storage pressure. Call `navigator.storage.persist()` to ask for durable
storage.

## Tests

doxor works with [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) in Node. Either install it as a
global, or pass an implementation to `createDB()`:

```ts twoslash
import { collection, createDB } from 'doxor.js'
type User = { id: number; name: string }
const collections = { users: collection<User>().key('id', { autoIncrement: true }) }
// ---cut---
import 'fake-indexeddb/auto' // installs a global indexedDB
// or inject an implementation explicitly:
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
const db = createDB({ name: 'test', collections, indexedDB: new IDBFactory(), IDBKeyRange })
```

Passing an implementation gives each test its own isolated database factory.
