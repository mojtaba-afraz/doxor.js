---
title: Getting started
description: Install doxor.js and create your first typed IndexedDB database in TypeScript. Works with npm, pnpm, yarn, bun or a CDN, with no dependencies.
---

# Getting started

doxor.js is a small TypeScript library for IndexedDB. You declare your collections once, with their keys and
indexes, and doxor gives you typed reads, writes and queries, creates the indexes and upgrades the database when
the declaration changes.

## Install

::: code-group

```sh [npm]
npm i doxor.js
```

```sh [pnpm]
pnpm add doxor.js
```

```sh [yarn]
yarn add doxor.js
```

```sh [bun]
bun add doxor.js
```

:::

doxor.js is ESM-only, has no dependencies and ships its own TypeScript types.

### From a CDN

Without a bundler, import it from a CDN in a module script:

```html
<script type="module">
  import { collection, createDB } from 'https://cdn.jsdelivr.net/npm/doxor.js@2/+esm'
</script>
```

## Your first database

Declare the collections, then use them. The types of every call below come from the declaration. Hover over any
name to see them.

```ts twoslash
import { collection, createDB } from 'doxor.js'

type User = { id: number; name: string; email: string; age: number }

export const db = createDB({
  name: 'app',
  collections: {
    users: collection<User>()
      .key('id', { autoIncrement: true })
      .index('email', { unique: true })
      .index('age'),
  },
})

// `id` is optional on insert because it is auto-incremented.
const id = await db.users.insert({ name: 'Ali', email: 'ali@example.com', age: 30 })

const ali = await db.users.get(id)
//    ^?

const adults = await db.users.where('age').gte(18).toArray()
```

`createDB()` does not touch IndexedDB. The database opens on the first operation, so it is safe to create at
module level. Create one instance per database and import it where you need it.

## Browser support

doxor targets ES2022: Chrome and Edge 94+, Firefox 93+ and Safari 15.4+. It is tested on Chromium, Firefox and
WebKit on every change. IndexedDB also works in Web Workers, and so does doxor.

## Next steps

- [Declaring a database](./collections): keys, indexes and key-value collections.
- [Reading and writing](./reading-writing): insert, update, put and delete.
- [Queries](./queries): index ranges, filters and limits.
- [Schema changes and migrations](./migrations): what happens when the declaration changes.
- <a href="/doxor.js/playground/" target="_self">The playground</a>: try doxor in your browser without
  installing anything.
