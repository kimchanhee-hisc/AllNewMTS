# G001A Independent Verification — Iteration 2

## Verdict

- **Review verdict:** `REQUEST CHANGES`
- **Architectural status:** `BLOCK`
- **Reviewed commit:** `fc88f2ec4dc719622b2eb4f7b5830c8a41318979`
- **Parent:** `eb9c61eed67b437ea1554901b7d566cd3944d79c`
- **Tree:** `77a18a35bc3eddadd4651334994fa3753db76fa4`
- **Diff:** 4 files changed, 336 insertions, 70 deletions
- **Completed:** `2026-07-21T02:31:37Z` (`2026-07-21T11:31:37+09:00`)
- **Independence:** this reviewer did not implement the commit. Only repository target files, approved contracts, and synthetic in-memory/detached fixtures were inspected. No prohibited-engine or legacy-engine artifact was accessed.

Iteration 2 closes the story-activation and focused-command findings and substantially repairs integrity/policy/control gates. Four reproduced gaps still block G001A completion.

## Reviewed change

| File | SHA-256 |
|---|---|
| `scripts/verify-foundation.mjs` | `fc22d0a50e064e67fabc2fcfb625cce120cbd802a5c0738835325aa1e3e7a5ff` |
| `test/foundation.test.mjs` | `0258b4ecd24633fb1e08ce12c2b314e7c865609cdf9b2c1fdca0f2489ef6f0f5` |
| `verification/manifest.json` | `3226314346019729fffabde3287f851c8e28adb0cfadd650caa50e02166a33c4` |
| `verification/manifest.schema.json` | `c48458146ad1633de7284682cfdc632e9395e73ab2454338a637ab8f45671922` |

## Iteration-1 closure matrix

| Prior block | Result | Evidence |
|---|---|---|
| Active story empty/duplicate/missing/inactive/wrong-owner | **CLOSED** | Schema, docs, `storyChecks`, and `runChecks` rejected every requested mutation. |
| Safe paths and exact integrity inventory | **PARTIAL / BLOCK** | All requested forms except drive-relative paths rejected; exact inventory now includes package/verifier/test. |
| Objective policy/build/config/remote coverage and false positives | **PARTIAL / BLOCK** | Direct requested forms and named build/config extensions are covered; common JS CDN calls pass and build comments false-positive. |
| Exact controls and uniqueness | **PARTIAL / BLOCK** | Exact included controls and most uniqueness pass; deferred normalized types are not unique. |
| Focused package script equals manifest argv | **CLOSED** | Integrity-updated no-op drift still rejected. |

## Blocking findings

### P0 — JS CDN mutation calls pass policy

**Location:** `scripts/verify-foundation.mjs:319-339`, `347-359`

**Evidence:** `cdnClient.purge()`, `purgeCdn()`, and `deleteFromCdn()` reject, but all of these returned zero violations:

- `fetch(cdnUrl, { method: "DELETE" })`
- `fetch("https://cdn.invalid/x", { method: "DELETE" })`
- `axios.delete(cdnUrl)`

A detached `src/cdn.ts` containing the first and third forms made actual `verify:policy` exit `0`, `PASS`. The AST rule checks mutation words only in the callee name/base, while the broad CDN text rule runs only for non-JS build/config files.

**Required fix:** recognize mutation method/options on `fetch`, Axios-like calls, and equivalent reviewed clients only when the target/receiver/arguments identify CDN; cover method-before-CDN and CDN-before-method order. Preserve read-only `GET`/`HEAD`.

### P0 — Drive-relative paths pass the runtime path guard

**Location:** `scripts/verify-foundation.mjs:12-27`, `138-146`

**Evidence:** absolute POSIX, `C:/x`, `..`, `.`, empty, backslash, NUL, final symlink, and escaping realpath rejected. `safeRepoFile("C:drive")` accepted a real file named `C:drive`. In a detached copy, an integrity-updated README link to `C:drive.md` made `verify:docs` exit `0`, `PASS`.

The manifest schema rejects drive prefixes, but Markdown links call `safeRepoFile` directly. `path.win32.isAbsolute("C:drive")` is false.

**Required fix:** reject `/^[A-Za-z]:/` in `safeRepoFile` and test both `C:/x` and `C:x`.

### P1 — Deferred normalized control types are not unique

**Location:** `scripts/verify-foundation.mjs:177-197`, especially line 186; order-dependent lookup at lines 244-250.

**Evidence:** extra included controls and duplicate IDs/tags/families/roles/Host names/decision IDs reject. A second deferred control with a distinct ID/family but the same `normalizedType: "unsupported"` passed `verifyContractInventories`. Inserted before the expected deferred entry with a refreshed registry hash, actual `verify:docs` exited `0`, `PASS`.

**Required fix:** enforce a unique lookup key across every control, or stop indexing deferred entries by non-unique `normalizedType`. Test both duplicate orderings.

### P1 — Build/config comments cause policy false positives

**Location:** `scripts/verify-foundation.mjs:354-359`

**Evidence:** JS/TS comments and strings containing OS/identity/CDN examples correctly produced no violation. A harmless CMake `# ... cdnClient.purge() ...` comment and a Gradle `// ... cdnClient.purge() ...` comment were both reported as real CDN mutation; actual comment-only CMake `verify:policy` exited `1`.

**Required fix:** strip syntax-valid comments for the reviewed build/config types before behavioral CDN/remote matching, or match only executable assignment/call tokens. Keep conservative path/protocol/artifact checks.

## Passed hostile evidence

- **Stories:** active empty, duplicate, missing, inactive, wrong-owner, and unknown story all fail closed.
- **Paths/integrity:** absolute, drive-absolute, `..`, `.`, empty, backslash, NUL, final symlink, realpath escape, missing/extra/duplicate inventory, and canonical outside symlink all reject. Exact inventory contains 14 required non-self-referential files including package/verifier/test.
- **Policy:** bracket `Platform["OS"]`, identity ternary/computed dispatch, `addScreen`, named CDN mutation calls, `basic-ftp`/FTP dependencies, `rsync`, `scp`, remote `curl -X`, and synthetic prohibited markers across CMake, Podspec, Gradle, Xcode, XML, JSON, plist, properties, and mk reject. Read-only bootstrap/lookup forms remain allowed.
- **Controls:** exact included types are Label/Edit/Button with tags LABEL/EDIT/BUTTON and `CtlButton`; XMS and `CtlImage` remain deferred; an extra included control rejects.
- **Commands:** every focused package script equals manifest argv; a no-op drift rejects after updating its integrity hash.
- **Scope:** no dependency/framework/package manager/interpreter/native/UI/deployment/network capability was added or exercised.

## Fresh command evidence

| Command | Duration | Exit/result |
|---|---:|---|
| `npm run verify:story -- G001A-establish-ai-native-foundation` | 2.03 s | `0`, PASS; run exactly once, seven checks each invoked once. |
| `npm run verify:g001` | 0.79 s | `0`, PASS: 10 sources, six goldens, provenance/generator/negative/tripwire checks. |
| `npx tsc --noEmit` | 0.53 s | `0`, PASS. |
| `npm run verify:unit` | 0.24 s | `0`, two tests passed. |
| `git diff --check eb9c61e fc88f2e` | 0.01 s | `0`, PASS. |
| tracked regular nonempty `AGENTS.md` check | 0.02 s | `0`, mode `100644`. |
| `npm run verify:milestone` | 2.06 s | expected `2`, machine-readable `DEFERRED`; no deferred layer ran. |
| `npm run verify:ci` | 2.17 s | expected `2`, delegated milestone exactly once; no deferred layer ran. |

Story durations were format 126 ms, docs 129 ms, policy 163 ms, type 386 ms, unit 171 ms, fixtures 720 ms, and provenance 129 ms. Current policy scanned 50 repository paths and 34 text/build/config surfaces.

Milestone and CI emitted `DEFERRED` for G002 native, G003 runtime, G004 UI, and G006 package with exit `2`. No native, UI, screenshot, deployment, network, FTP/SFTP, CDN, or remote mutation operation ran.

## Re-review and cleanup

Repair the four findings in the existing verifier/test surface; no new dependency or framework is justified. Do not checkpoint G001A or activate G002 from this verdict.

All detached worktrees, synthetic files, symlinks, and temp directories were removed. `git worktree list` showed only the main worktree at the reviewed commit, and `git status --short` was empty before this report. No tracked implementation file was edited by this reviewer.

The detached report SHA-256 is recorded in the parent handoff after the file is closed.
