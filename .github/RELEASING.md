# Releasing doxor.js

Releases are built and staged by [`.github/workflows/release.yml`](workflows/release.yml) when a `vX.Y.Z` tag is
pushed. Nothing is published from a laptop and no npm token exists anywhere: the workflow authenticates with
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC) and stages the package, and a
maintainer approves it on npm with 2FA.

## One-time setup (already done)

- **npm (doxor.js → Settings):**
  - Trusted publisher: GitHub Actions, repository `mojtaba-afraz/doxor.js`, workflow `release.yml`, environment
    `npm`, allowed action **stage publish** only.
  - Publishing access: *Require two-factor authentication and disallow tokens*.
- **GitHub:**
  - Environment `npm`, deployable only from `v*` tags.
  - Tag ruleset protecting `v*` tags from updates and deletion.
  - Immutable releases.
- **Maintainer:** 2FA with a passkey on both npm and GitHub. Use Node 24 (`nvm use`, npm 11.15+) for
  `npm stage` commands.

## Versions

- Follow [SemVer](https://semver.org/). Always set the version explicitly: `npm version 2.1.0`, never
  `npm version prerelease --preid=…` on a version you have not checked.
- Prereleases use a dot and a number: `2.1.0-beta.0`, `2.1.0-rc.1`. They are published under the `next` dist-tag;
  stable versions go to `latest`. The workflow chooses the tag from the version.
- Never reuse or unpublish a version. If a release is broken, publish a fix and deprecate the bad version.

## Releasing

1. **Prepare a release pull request.**
   ```sh
   git switch main && git pull
   git switch -c release/v2.1.0
   npm version 2.1.0 --no-git-tag-version
   ```
   In `CHANGELOG.md`, rename `## [Unreleased]` to `## [2.1.0] - YYYY-MM-DD`, add a new empty `## [Unreleased]`
   above it, and update the compare links at the bottom. Open the pull request, wait for CI and squash-merge it.

2. **Tag the merged commit.**
   ```sh
   git switch main && git pull
   git tag -a v2.1.0 -m "v2.1.0"
   git push origin v2.1.0
   ```

3. **Watch the Release workflow** (Actions tab). It checks that the tag matches `package.json`, runs every check,
   packs the tarball, stages it on npm and drafts a GitHub Release. If a check fails, nothing reaches npm: fix
   it, delete the tag (`git push origin :refs/tags/v2.1.0 && git tag -d v2.1.0`) and start again.

4. **Approve on npm.** npmjs.com → doxor.js → **Staged** tab → review the files and approve with your passkey
   (or `npm stage list doxor.js` and `npm stage approve <id>`). Approval is only possible after npm's malware scan
   finishes.

5. **Verify.**
   ```sh
   npm view doxor.js dist-tags
   npm view doxor.js@2.1.0 dist.attestations   # provenance present
   ```
   Then install it in a fresh project (`npm create vite@latest`, `npm i doxor.js@2.1.0`) and run a quick
   insert/get in the browser.

6. **Publish the GitHub Release.** Edit the draft, add highlights and migration notes above the generated notes,
   and publish.

## If something goes wrong

- **Wrong version on `latest`:** `npm dist-tag add doxor.js@<good-version> latest`.
- **Broken version:** publish a fix, then `npm deprecate doxor.js@<bad-version> "Broken; use <fix-version>"`.
- **Rejected stage:** `npm stage reject <id>` (or reject it on npmjs.com), fix, delete the tag and release again.
  If npm refuses to reuse the version, release the next patch or prerelease number instead.

`dist-tag`, `deprecate` and `owner` commands need an interactive `npm login` with 2FA. Never create a token that
bypasses 2FA.
