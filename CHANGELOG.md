# Changelog

All notable changes to doxor.js are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.0.0-alpha.0] - 2026-09-29

First prerelease of doxor.js 2.0, a complete rewrite. Install it with `npm i doxor.js@next`. See [Migrating from 1.x](README.md#migrating-from-1x).

### Added

- `createDB({ name, collections, migrations })` with one typed table per collection (`db.users`, …).
- `collection<T>().key(property, { autoIncrement }).index(property, { unique, multiEntry })` declarations.
- Automatic, additive schema upgrades: new collections and indexes are created on the next open.
- Numbered `migrations` that run once, in order, inside the upgrade transaction, with rollback on failure.
- Table methods: `insert`, `insertMany`, `put`, `putMany`, `update`, `get`, `getMany`, `delete`, `clear`,
  `count`, `toArray`.
- Queries: `where(index)` with `equals`, `gt`, `gte`, `lt`, `lte`, `between`, `startsWith`, `anyOf`, `reverse`,
  `offset`, `limit`, `filter`, and `toArray`, `first`, `count`, `keys`, `delete`.
- `db.transaction(collections, mode, callback)` for atomic work across collections.
- `DoxorError` with stable codes (`Constraint`, `Outdated`, `SchemaConflict`, …).
- Events: `versionchange`, `outdated`, `blocked`, `close`.
- TypeScript types, ESM build, zero dependencies.

### Changed

- **Breaking:** the API is Promise-based. `new Doxor(name)`, `Store`, `CreateCollection`, `Insert`, `get`,
  `getAll` and `remove` are replaced by `createDB()` and table methods.
- The database is opened lazily on the first operation, so importing doxor during SSR is safe.

### Fixed

- Operations failing silently with `VersionError` on a user's first visit.
- Schema upgrades blocked by a connection the constructor never closed.
- `store()` re-creating stores and bumping the version on reloads.
- Errors being swallowed instead of reaching the caller.
- `get()` resolving before the data arrived.
- Reads locking the store in `readwrite` mode.

## [1.0.0-beta-1] - 2022-07-18

### Changed

- Package metadata and README updates.

## [1.0.0-beta] - 2022-07-18

### Added

- First beta: `new Doxor(name)` with `Store`, `CreateCollection`, `Insert`, `get`, `getAll` and `remove`
  (callback API).

## 0.9.0 to 0.9.5 - 2022-07-17 to 2022-07-18

Early experimental releases. `0.9.0` contains no code; do not use these versions.

[Unreleased]: https://github.com/mojtaba-afraz/doxor.js/compare/v2.0.0-alpha.0...HEAD
[2.0.0-alpha.0]: https://github.com/mojtaba-afraz/doxor.js/compare/v1.0.0-beta-1...v2.0.0-alpha.0
[1.0.0-beta-1]: https://github.com/mojtaba-afraz/doxor.js/compare/v1.0.0-beta...v1.0.0-beta-1
[1.0.0-beta]: https://github.com/mojtaba-afraz/doxor.js/releases/tag/v1.0.0-beta
