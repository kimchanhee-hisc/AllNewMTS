# G001A Independent Verification — Iteration 1

## Verdict

- **Review verdict:** `REQUEST CHANGES`
- **Architectural status:** `BLOCK`
- **Reviewed commit:** `eb9c61eed67b437ea1554901b7d566cd3944d79c`
- **Parent:** `260c28750fbd4c716106f3959e02367f29b71c7a`
- **Tree:** `c2dba05260b2d29c2f09524d389197685bc01d60`
- **Diff:** 15 files changed, 885 insertions, 12 deletions
- **Completed:** `2026-07-21T02:09:52Z` (`2026-07-21T11:09:52+09:00`)
- **Independence:** this reviewer did not implement the commit. Review was limited to the 15 repository target files, approved current plans/steering, and approved oracle verification. No prohibited-engine or legacy-engine artifact was inspected.

The committed snapshot is small, readable, dependency-free, and passes its declared G001A story. Its current canonical content is mostly correct. Approval is blocked because hostile tests show that the foundation does not yet fail closed: an activated story with zero checks is accepted, canonical owners and integrity entries can escape through symlinks/`..`, an unapproved control can be activated without canonical prose, package command drift passes, and several explicitly prohibited policy variants are missed.

## Commit and reviewed files

| File | SHA-256 | Review |
|---|---|---|
| `AGENTS.md` | `92312dc8813739f8da300f7690ba7ff94f70838b6dcfff37809f1c5c8bfbf494` | Concise tracked router; correct canonical links, tier rule, and prohibitions. |
| `README.md` | `b595c86be427ee2dfa2ee54cb1e9fe223bbb3a1128ce06584cedde556dcc50f9` | Correctly delegates to `AGENTS.md`; removes stale implementation direction. |
| `contracts/control-registry.json` | `424f1a6307448bd2052e66c50f44e8d61e39c3710a604eb5baadce5fa7482639` | Current XMF/XMS and control decisions are correct; broadening is not fail-closed. |
| `contracts/control-registry.schema.json` | `9b9315bb7c657727144a8f147f1479f19b28ec093e4794d51a2980951dd35157` | Current shape validates; semantic uniqueness/activation constraints are missing. |
| `contracts/host-api.json` | `4e746e02795ba93c468172c3b923fd333458d1f857cf5e5ec6e6a408755c4841` | Honestly deferred with an empty public API inventory. |
| `contracts/host-api.schema.json` | `087884c3a03ff65871e46085e9ba0c2bd966989a33b92a70c005e1917a12f69e` | Current shape validates; later public-name uniqueness should be enforced before activation. |
| `docs/adr/0001-official-lua-5.1.5.md` | `31f3152029b8921516c666ddbe7fef5d6710878986ee1e26b52f9ff24a13ff14` | Correctly records official unmodified Lua adoption and deferred implementation. |
| `docs/specs/runtime-contract.md` | `b436e8eab809f1f41559aca98cbd1c15f92b2ad34b062e71e50cb1088e381e8d` | Correct single semantic contract, ledger, lifecycle/limit ownership, and no-interpreter boundary. |
| `docs/specs/xmf-lua-runtime.md` | `64a61539140cc03410fc706aba18f0fed73103eac2a786d12eada2a03d54e27a` | Correct XMF-first role, XMS/CtlImage deferment, mapping, no identity/OS behavior, and no deployment claim. |
| `docs/testing.md` | `b10274b72f0bf6568b0c0502cdc71774031a13959ca1aa45971fbd90bef9c890` | Correct fast/story/milestone intent and bootstrap/network boundary; executable fail-closed gaps remain below it. |
| `package.json` | `fd6ddd03a693e6bf4325fe1470ced36bc5929c5bf367cf0b8bced28f8da93dff` | Adds only scripts, no dependency/framework; CI delegates milestone once. Script/argv drift is not checked. |
| `scripts/verify-foundation.mjs` | `b84caed429291db530ade0b06eeba97f379323d37f9deef20a3fcea32f8f34fb` | One stdlib verifier is appropriately minimal, but fail-closed and policy predicates are incomplete. |
| `test/foundation.test.mjs` | `6927f64a7673f4f7f72e88ac8c7c6646287abae8adc8e0d431c856208c1dbd24` | Uses built-in `node:test`; current single test covers only happy/obvious negatives and misses demonstrated bypasses. |
| `verification/manifest.json` | `11055ad86a0c8095724c7c9fd0b13599d60858ed8172385eaac5a85f6b9986d1` | Current ownership/activation/budgets are honest; empty active stories and incomplete integrity inventory are allowed. |
| `verification/manifest.schema.json` | `4d8fe967e8e2feca4e1f838391851eb664fca12a89e1148edd5db2102ebd2aa1` | Current manifest validates; paths and active-story non-emptiness are not constrained. |

## Blocking findings

### P0 — An activated story with zero checks passes acceptance

**Evidence**

- `verification/manifest.schema.json:52` allows an empty `stories[].checks` array.
- `scripts/verify-foundation.mjs:226-231` returns an active story's checks without requiring at least one check or validating each referenced check's activation/ownership.
- `scripts/verify-foundation.mjs:238-255` treats `runChecks([])` as success.
- `scripts/verify-foundation.mjs:132-137` validates only the current G001A story, not the fail-closed rule for every active story.
- In a detached temp worktree, changing only G003 from `deferred` to `active` produced:
  - `verify-foundation docs` — exit `0`, `PASS`.
  - `verify-foundation story G003-implement-bounded-native-runtime` — exit `0`, `{"status":"PASS",...,"checks":[]}`.

This violates Gate F's rule that an activated check/layer cannot silently skip or be an empty placeholder. It can falsely checkpoint later goals.

**Required fix**

1. Make every active story require at least one check.
2. In both docs validation and `storyChecks`, require every referenced check to exist, be active, be uniquely listed, and belong to the story (or an explicit reviewed shared owner).
3. Make story acceptance reject an empty resolved set before `runChecks`.
4. Add a hostile unit case that activates an empty deferred story and asserts both docs and story resolution fail.

### P0 — Canonical owner and manifest integrity paths can escape the repository

**Evidence**

- Schema path fields are only non-empty strings (`verification/manifest.schema.json:18,89`).
- `scripts/verify-foundation.mjs:90-97` and `153-157` follow paths/symlinks without `lstat`, repository-containment, file-mode, or exact-inventory checks.
- Detached temp tests:
  - Replacing `docs/specs/runtime-contract.md` with a symlink to identical bytes outside the worktree: `verify-foundation docs` exit `0`, `PASS`.
  - Replacing one integrity path with `../outside-readme.md` carrying identical bytes: exit `0`, `PASS`.
- Positive controls worked: appending bytes to a canonical document and adding an unknown manifest property each exited `1`.

This conflicts with tracked canonical ownership, deterministic local provenance, no hidden context, and the explicit symlink/path-escape expectation.

**Required fix**

1. Require normalized repository-relative paths: no absolute paths, `..`, backslashes, NULs, or empty segments.
2. Use `lstat` to reject symlinks and non-regular files for canonical owners, schemas, integrity entries, and foundation inputs; additionally verify `realpath` remains under the repository root.
3. Require the exact G001A integrity inventory rather than trusting an arbitrary subset. Include all non-self-referential foundation executables/configuration (`package.json`, verifier, and verifier test) or document and enforce a reviewed equivalent inventory.
4. Add symlink and `../` hostile tests using temp paths and assert rejection.

### P0 — Objective policy gates have trivial false negatives

**Evidence**

The in-memory hostile audit confirmed the documented forms are rejected: `Platform.OS`, `Platform.select`, `if(screenId)`, `switch(transactionId)`, `registerScreen`, FTP/SFTP URI, CDN `DELETE`, undeclared `Host.*`, undeclared `registerControl`, the forbidden wrapper dependency, and `eas update`.

The following equivalent prohibited forms returned **zero violations**:

- OS behavior: `Platform["OS"]`.
- Identity behavior: ternary on `screenId` and `screenHandlers[screenId]`.
- Screen registration: `addScreen("A", component)`.
- FTP capability dependency: `basic-ftp`.
- Remote deployment command: `rsync -a dist/ user@example:/srv`.
- CDN mutation identifiers: `cdnClient.purge()`, `purgeCdn()`, and `deleteFromCdn()`. Only the narrower standalone-word form `const cdn = ...; ... DELETE` was rejected.

There is also a scope hole:

- `scripts/verify-foundation.mjs:207-210` applies all file/path/evidence checks only after `productionFile` excludes `test/`, `scripts/`, `contracts/`, and `verification/`.
- A tracked synthetic `test/legacy-engine-evidence.txt` hostile marker passed `verify-foundation policy` with exit `0`. No real prohibited artifact was used.
- `productionFile` also excludes native build/config surfaces without one of its source extensions, including `CMakeLists.txt`, Podspecs, `.gradle`, `.pbxproj`, XML, and JSON configuration.
- A detached worktree with tracked synthetic `modules/a/CMakeLists.txt`, `modules/a/ios/a.podspec`, and `modules/a/android/build.gradle` containing prohibited protocol/evidence markers still reported `PASS policy: 2 product source files` and exited `0`.

The raw regex approach also risks false positives by scanning comments and string literals, while missing equivalent syntax. The gate therefore does not yet enforce the promised no-RN-OS behavior, no identity selection/registration, no prohibited evidence/dependency, and no remote deployment/FTP boundary.

**Required fix**

1. Split the scan: apply forbidden artifact/path/dependency/evidence, native build/link/config, protocol, and prohibited remote tooling rules to every candidate repository file/package entry; apply behavioral syntax checks only to production sources. Cover at least CMake, Pods, Gradle, Xcode project/config, XML, and JSON build surfaces before native goals activate.
2. Use the already installed TypeScript parser for JS/JSX/TS/TSX objective syntax checks, or add the smallest equivalent robust predicates for bracket access, ternaries, computed identity lookup, and registration aliases. Do not add a new framework/dependency.
3. Deny known FTP/SFTP client dependencies and common remote publication/mutation commands (`rsync`, `scp`, remote `curl` mutation, CDN client purge/delete/invalidate forms, and equivalent reviewed entries), or enforce a narrow allowlist of package scripts during this foundation stage.
4. Keep paths/comments from producing semantic false positives where an AST is available.
5. Add every demonstrated bypass to `test/foundation.test.mjs`.

### P1 — The control registry can silently activate an unapproved control

**Evidence**

- Current XMF/XMS roles, `Label`/`Edit`/`Button`, `CtlButton`, and deferred `CtlImage` are correct.
- `control-registry.schema.json` permits additional controls with any `include|exclude|defer` decision.
- `verifyDocs` asserts the known mappings but does not reject extra included entries or require their declaration in the canonical product contract.
- In a detached worktree, adding an `include` control named `Unapproved` and updating only its integrity hash still made `verify-foundation docs` exit `0`, `PASS`.
- The corresponding Host hostile control is stronger: adding a public Host API was correctly rejected because G001A requires `publicApis: []`.

**Required fix**

1. During G001A, assert the exact included control/source-tag/semantic-family set and that every other entry is deferred or excluded with a diagnostic.
2. Enforce uniqueness for input-role names, control IDs, normalized types, source tags/semantic families, Host API names, and decision IDs.
3. Require later activation to update the canonical product contract and a deterministic test in the same reviewed change.
4. Add an extra-included-control hostile test.

### P1 — Focused package-script command drift passes documentation checks

**Evidence**

- `scripts/verify-foundation.mjs:123-126` checks only that a package script exists and that the manifest's display command is `npm run <name>`; it never compares the package script body to `focusedChecks[].argv`.
- Changing `verify:policy` in `package.json` to a no-op while leaving manifest `argv` intact made `verify-foundation docs` exit `0`, `PASS`.
- The story aggregator directly executes manifest `argv`, so story safety remains, but the documented focused rerun can silently diverge and mislead agents.

**Required fix**

Make one executable representation canonical and deterministically compare the other representation to it. For the current minimal design, normalize and compare each package script to `focusedChecks[].argv`, include `package.json` in integrity ownership, and add a command-drift hostile test.

## Passed architecture and boundary audit

- Root `AGENTS.md` is tracked as regular mode `100644`, has 19 concise lines, routes to one canonical owner per domain, names the correct tier, and forbids self-attested approval.
- Canonical prose currently agrees on semantic reimplementation rather than code port, smallest evidence-backed cross-platform results, mechanics-only adapters, no RN/TS OS behavior, no screen/control/transaction/asset/layout behavior selection, and no authored interpreter.
- Official Lua 5.1.5 is only an accepted G002 decision; G001A adds no interpreter, wrapper, native runtime, or alternative Lua provider.
- Host public API inventory is honestly empty/deferred to G003.
- XMF is the only active input role. XMS returns `UNSUPPORTED_INPUT_ROLE`; `CtlImage` is deferred; the first mappings are `LABEL→Label`, `EDIT→Edit`, and `BUTTON`/`CtlButton→Button`.
- The current dependencies are unchanged; no new library, test framework, task framework, package manager, or speculative abstraction was added. Node stdlib, installed TypeScript, and built-in `node:test` are reused.
- The reviewed code performs no deployment, remote mutation, FTP/SFTP, CDN access, native build, UI test, or screenshot. Only explicit dependency bootstrap is documented as credential-free read-only HTTPS; every executed review check was local/networkless.
- `verify:ci` is exactly `npm run verify:milestone`; docs validation asserts that literal, and the fresh CI trace showed one milestone invocation.
- Milestone and CI honestly exited `2`, printed `DEFERRED(...)` for native/runtime/UI/package owners, and emitted machine-readable `{"status":"DEFERRED"}` without executing a deferred native/UI/package check.

## Fresh command evidence

| Command | Duration | Exit/result |
|---|---:|---|
| `npm run verify:story -- G001A-establish-ai-native-foundation` | 1.36 s | `0`, PASS. Run exactly once. Seven activated checks each reported `invocationCount: 1`. |
| `npm run verify:g001` | 0.80 s | `0`, PASS: 10 immutable sources, six goldens, provenance/generator/negative/tripwire checks. |
| `npx tsc --noEmit` | 0.48 s | `0`, PASS. |
| `npm run verify:unit` | 0.14 s | `0`, one test passed. |
| `git diff --check eb9c61e^ eb9c61e` | 0.01 s | `0`, PASS. |
| tracked/regular/nonempty `AGENTS.md` routing check | 0.01 s | `0`, PASS; Git mode `100644`. |
| `npm run verify:milestone` | 1.35 s | expected `2`, machine-readable `DEFERRED`; no deferred layer ran. |
| `npm run verify:ci` | 1.48 s | expected `2`, delegated to milestone exactly once; no deferred layer ran. |
| In-memory policy/CDN/unknown-story hostile audit | <1 s | Standalone `cdn ... DELETE` and other obvious negatives rejected; common CDN client mutation and equivalent policy bypasses listed above reproduced. Unknown story correctly rejected. |
| Detached temp drift/path/policy audit | <1 s | Hash/schema drift rejected; symlink, `..`, evidence, FTP dependency, remote command, and package-command drift bypasses reproduced. |
| Detached active-story/control audit | <1 s | Empty active story and extra included control incorrectly passed; added Host public API correctly failed. |
| Detached native build/config coverage audit | <1 s | Tracked CMake/Podspec/Gradle hostile markers were not scanned; policy exited `0`. |

Story evidence durations were: format 28 ms, docs 28 ms, policy 39 ms, type 337 ms, unit 65 ms, fixtures 724 ms, provenance 27 ms. These are well inside the declared budget.

## Correctness, security, maintainability, and Ponytail assessment

- **Correctness:** current data and docs are coherent, but acceptance correctness is blocked by empty-active-story and silent-control-activation paths.
- **Security/boundaries:** the current tree contains no prohibited capability, but the enforcement can be bypassed with common syntax, repository-scope exclusions, symlinks, path traversal, FTP dependencies, and remote commands.
- **Maintainability:** one 307-line stdlib verifier and one built-in test file are simpler than a new framework. Keep this shape; strengthen predicates and tests in place rather than adding infrastructure.
- **False negatives:** demonstrated for bracket OS access, ternary/computed identity dispatch, registration aliases, test/evidence paths, FTP dependencies, remote commands, active empty stories, path escapes, command drift, and added controls.
- **False positives:** raw whole-text regexes can match comments/strings and can associate unrelated `cdn`/mutation words. Prefer AST predicates for installed JS/TS and tightly scoped path/package allow/deny lists.
- **Minimality:** no speculative dependency or framework was introduced. The repair should remain in the existing verifier, schemas/manifests, and single test file.

## Exact re-review gate

Return for independent verification only after all five findings have hostile regression tests and the single G001A story passes again. Re-run the same required commands, milestone/CI deferred proof, temp symlink/`..` checks, active-empty story, extra-control activation, command drift, all policy syntax/dependency/remote variants, and clean-tree/worktree cleanup evidence.

No G001A completion checkpoint, G002 activation, or implementation handoff is safe from this verdict.

## Cleanup and clean-tree evidence

- Both detached hostile-test worktrees and their external temp files were removed.
- `git worktree list --porcelain` showed only `/Users/chanheekim/Dev/AllNewMTS` at the reviewed commit.
- `git status --short` was empty before this report was written.
- No tracked implementation file was edited by this reviewer.

The detached SHA-256 of this report is recorded in the verifier's parent handoff after the file is closed, avoiding a self-referential hash field.
