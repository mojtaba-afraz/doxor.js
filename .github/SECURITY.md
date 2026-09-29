# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 2.x | ✅ |
| < 2.0 (1.0.0-beta*, 0.9.x) | ❌ |

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through
[GitHub's private vulnerability reporting](https://github.com/mojtaba-afraz/doxor.js/security/advisories/new).

Include what you found, how to reproduce it, and the affected versions. You can expect an acknowledgement
within 7 days. Once a fix is released, the advisory is published and you are credited unless you prefer not to be.

## Scope

doxor.js runs in the browser and stores data in the user's own IndexedDB, which the browser isolates per site.
Relevant reports include ways doxor could corrupt or leak stored data, or bypass the browser's isolation.
Data stored in IndexedDB is not encrypted and is readable by any script running on the same site, so do not
store secrets there.

Releases are published from GitHub Actions with npm trusted publishing, and carry a provenance attestation that
links each version to the commit and workflow that built it.
