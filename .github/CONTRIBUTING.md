# Contributing to doxor.js

Thanks for helping! Bug reports, docs fixes and pull requests are all welcome.
By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- **Bugs:** open an issue with a minimal reproduction. Forking the
  [StackBlitz example](https://stackblitz.com/github/mojtaba-afraz/doxor.js/tree/main/examples/vanilla) is the
  fastest way to make one.
- **Features and API changes:** open an issue first to agree on the design. doxor aims to stay small
  (the bundle budget is enforced in CI), so not every feature fits.
- **Security issues:** do not open a public issue; see [SECURITY.md](SECURITY.md).

## Setup

You need Node.js 22.19+ (24 LTS recommended) and npm.

```sh
git clone https://github.com/mojtaba-afraz/doxor.js.git
cd doxor.js
npm ci
npx playwright install      # browsers for the real-engine tests (once)
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests on [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB), with coverage |
| `npm run test:browser` | The same core scenarios in real Chromium, Firefox and WebKit |
| `npm run typecheck` | TypeScript, including the type tests |
| `npm run lint` / `npm run lint:fix` | Lint and format with Biome |
| `npm run build` | Build `dist/` with tsdown |
| `npm run check:pkg` | Validate the package with publint and Are the Types Wrong |
| `npm run size` | Check the bundle size budget |

## Project layout

```
src/
  index.ts        public exports
  db.ts           createDB, transactions
  collection.ts   collection() declarations and their types
  schema.ts       schema diff, automatic upgrades, migrations
  connection.ts   the cached connection and database events
  table.ts        record operations
  query.ts        where() queries
  errors.ts       DoxorError and error codes
  idb.ts          small promise helpers over IndexedDB
test/
  unit/           fast tests on fake-indexeddb, plus type tests checked by tsc
  browser/        tests in real browsers (Vitest browser mode + Playwright)
```

## Pull requests

- Keep each pull request focused on one change.
- Add or update tests for every behavior change. Bug fixes need a test that fails without the fix.
- Behavior that depends on the browser engine (upgrades, blocking, transaction timing) needs a test in
  `test/browser/` too, because fake-indexeddb does not reproduce every engine detail.
- Update the README when you change the public API, and add a line under `## [Unreleased]` in
  [CHANGELOG.md](../CHANGELOG.md).
- CI must be green: lint, typecheck, unit tests, build, package checks, size budget and the three browsers.
- Pull requests are squash-merged, so the pull request title becomes the commit message. Use the
  [Conventional Commits](https://www.conventionalcommits.org/) style, e.g. `fix: reject empty anyOf()`.
- If you used an AI assistant, you are still responsible for understanding and testing every line you submit.

## Releases

Releases are published by the maintainers from GitHub Actions, using npm trusted publishing with provenance.
Contributors never need npm access. The release steps are documented in [RELEASING.md](RELEASING.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](../LICENSE).
