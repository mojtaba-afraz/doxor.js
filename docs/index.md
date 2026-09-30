---
layout: home
title: 'doxor.js: a typed IndexedDB wrapper for TypeScript'
titleTemplate: false
description: Typed collections for IndexedDB. Declare your data once and get TypeScript types, indexes, schema upgrades and migrations. 4.4 kB, zero dependencies.
hero:
  name: doxor.js
  text: Typed collections for IndexedDB
  tagline: Declare your collections once. doxor infers the types, creates the indexes and upgrades the database for you.
  image:
    src: /logo.webp
    alt: doxor.js logo
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Open the playground
      link: /playground/
      target: _self
    - theme: alt
      text: View on GitHub
      link: https://github.com/mojtaba-afraz/doxor.js
---

<div class="home-section">

## One declaration, all the types

Describe each collection with its key and indexes. Everything after that is typed: what you insert, the keys
you get back, the indexes you can query and the records a query returns.

```ts twoslash
import { collection, createDB } from 'doxor.js'

type User = { id: number; name: string; email: string; age: number }

const db = createDB({
  name: 'app',
  collections: {
    users: collection<User>()
      .key('id', { autoIncrement: true })
      .index('email', { unique: true })
      .index('age'),
  },
})

const id = await db.users.insert({ name: 'Ali', email: 'ali@example.com', age: 30 })
//    ^?

const adults = await db.users.where('age').gte(18).limit(20).toArray()
//    ^?
```

</div>

<div class="home-section">

## Why doxor

<ul class="home-points">
  <li>
    <strong>Typed from one declaration</strong>
    <span>Record types, key types, index names and query values all come from <code>collection&lt;User&gt;()</code>. A typo in a collection or index name is a compile error.</span>
  </li>
  <li>
    <strong>No version numbers to manage</strong>
    <span>Add a collection or an index and doxor upgrades the database on the next load. Data changes go in numbered migrations that run exactly once.</span>
  </li>
  <li>
    <strong>Promises that resolve after commit</strong>
    <span>Every operation resolves once the data is committed, or rejects with a <code>DoxorError</code> that has a stable <code>code</code>.</span>
  </li>
  <li>
    <strong>Safe across tabs</strong>
    <span>A tab never blocks another tab's upgrade, and a tab running old code is told it is outdated instead of writing over newer data.</span>
  </li>
</ul>

<dl class="home-facts">
  <div><dt>min + brotli</dt><dd>4.4 kB</dd></div>
  <div><dt>dependencies</dt><dd>0</dd></div>
  <div><dt>browser engines tested on every change</dt><dd>3</dd></div>
</dl>

</div>

<div class="home-section">

## When doxor is not the right choice

doxor sits between raw IndexedDB and a full client-side database. If you only store a few values by key,
[idb-keyval](https://github.com/jakearchibald/idb-keyval) is smaller. If you need live queries or sync between
devices, [Dexie.js](https://dexie.org) does more. If you want thin promises over the raw API,
[idb](https://github.com/jakearchibald/idb) is the closest to the metal.
[See the full comparison](/compare).

</div>
