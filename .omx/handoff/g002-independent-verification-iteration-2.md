# G002 Independent Verification — Iteration 2

## Verdict

- **Implementation verdict:** `REQUEST CHANGES`
- **Architectural status:** `BLOCK`
- **Story readiness:** `CODE BLOCKED`; after the two code findings below are repaired, the current machine remains `ENVIRONMENT BLOCKED` for Android because the exact Gradle 9.3.1 cache is absent and `adb devices` exposes no target.
- **Reviewed commit:** `d0a51ae7e87ede2361f30cce30872eda3c03b001`
- **Parent:** `083ebf8d6a4edac7d6eca3de7e09a5f4315a3a41`
- **Implementer handoff:** `.omx/handoff/g002-implementation-iteration-2.md`, SHA-256 `50c6f8662417b75a1a0af87a46070d59f1162adc5f069eade9ba50a57780eb5c`

The native graph, generated resources, normal-start flag boundary, and actual iOS runner path are materially improved. Two iteration-1 P1 requirements are nevertheless still bypassable, so this review cannot issue `APPROVE`/`CLEAR` or classify the story as only environment-blocked.

## Blocking findings

### P1 — G001 trusts a vendor path prefix without verifying the excluded bytes

**Location:** `scripts/verify-g001.mjs:47-65`, self-test at `scripts/verify-g001.mjs:303-307`.

`isProductBehavioralFile()` excludes every tracked file below the configured vendor prefix before the anti-hardcoding scan. It asserts only the manifest's root string; it does not first prove that the directory's exact inventory and bytes match the pinned manifest. The new self-test proves only that a path is excluded, not that only verified upstream content can receive the exclusion.

Fresh hostile evidence used a detached worktree, appended `CCS20000` to `vendor/lua-5.1.5/src/lapi.h`, and ran `npm run verify:g001`. The command still exited `0` and printed all G001 PASS lines:

```text
HOSTILE_VENDOR_MUTATION_VERIFY_G001_EXIT=0
```

The product-side tripwire remains active: the corresponding hostile mutation of `App.tsx` exited nonzero. The needed repair is narrow: exact inventory/size/hash verification of every file under the excluded root, with no extras, before granting the exclusion. Verified immutable upstream Lua should remain outside product hardcoding checks; unverified vendor bytes must fail G001.

### P1 — A complete-looking synthetic Development Build result is accepted

**Location:** `scripts/run-gate0-development-build.mjs:374-393`; insufficient hostile check at `scripts/verify-native.mjs:271`.

The runner itself performs real build/package/runtime work, but exported `validateDevelopmentBuildResult()` authenticates only caller-provided scalar/object values. `verify-native` tests only the incomplete object `{ status: 'PASS' }`. A caller can synthesize the complete expected shape and receive PASS without package or runtime provenance:

```text
{"syntheticAccepted":true,"status":"PASS"}
```

That result was reproduced by importing the validator and passing the tracked golden, `cycles: 3`, and `luaProviderCount: 1` for both platforms. This contradicts the stated iteration-1 closure condition that synthetic result objects cannot pass validation.

Repair with evidence the caller cannot manufacture from public shape alone—for example, keep validation private to the runner and return an opaque module-private token only after build/package/marker checks, or bind validation to runner-created immutable evidence artifacts. Add a hostile self-test using the complete-looking forged object above.

## Iteration-1 closure matrix

| Iteration-1 P1 | Status | Independent evidence |
|---|---|---|
| Evaluated iOS Pod graph omitted mechanics adapter / verifier compiled another graph | **CLOSED** | `pod ipc spec` under deny-network sandbox produced the exact 58-source set with only `ExpoModulesCore`; iOS mechanics C is included. The evaluated C/mm graph compiled and exposed exactly one create/evaluate/destroy provider and one `lua_newstate` provider. A hostile extra `lua.c`/second provider was rejected. |
| No genuine Expo Development Build runner/fixture; synthetic PASS possible | **PARTIAL — BLOCKING** | The real runner, three-cycle native fixture, package inspection, reserved Metro port, cleanup, and flag-gated import exist. Implementer evidence records a genuine iOS package/runtime PASS. However, the complete synthetic result above is accepted. |
| Vendor remediation could weaken G001/G001A | **PARTIAL — BLOCKING** | Product-authored hardcoding still fails and the baseline gate passes. A mutated file anywhere under the vendor prefix is excluded without byte verification and G001 passes. |
| Logical resource path/bytes/hash not bound to compiled C/generated TypeScript | **CLOSED** | The generator binds manifest paths, resource bytes, and hashes into deterministic C and the tracked fixture/golden into generated TypeScript. Path, bytes/hash, compiled-C, and generated-TS hostile drift were all rejected. |

## Architectural verification that passed

- The Podspec now belongs to the Expo module root and its evaluated graph, rather than a hand-maintained substitute, is compiled and provider-counted.
- The shared C core, official Lua 5.1.5 provider, and both thin mechanics adapters remain the native boundary. No `MVigsEngine`, new interpreter, OS-selected React Native semantics, Host API, or G003 behavior was introduced by the reviewed diff.
- Normal app startup uses a flag-guarded dynamic import; static inspection confirmed the false path does not load the Expo native module.
- Generated native resources are byte-compared with checked-in outputs and were stable under `node scripts/generate-native-assets.mjs`.
- The runner uses a reserved loopback port, network-denied CocoaPods with `--no-repo-update`, direct cached Gradle with offline flags, refusal checks for pre-existing targets, and ownership-scoped cleanup.
- Implementer evidence records actual iOS Development Build/package/runtime PASS for three create/evaluate/destroy cycles with the exact tracked golden and one packaged Lua provider. This independent review did not repeat that expensive story execution.
- Android host/NDK mechanics evidence passes, but no Android Expo integration/package/runtime claim is accepted on this machine.

## Verification record

This reviewer intentionally did **not** run the canonical G002 story, `verify:native`, a Development Build, UI, milestone, release/package, deployment, CDN mutation, FTP/SFTP, or any remote-changing operation.

| Check | Result |
|---|---|
| `npm run verify:fast` | PASS, exit 0, 1.26 s; format/docs/policy/type and 2/2 unit tests. |
| `npm run verify:g001` | PASS, exit 0, 0.78 s on the unmodified tree. |
| `npm run verify:type` | PASS, exit 0, 0.51 s. |
| `npm run verify:unit` | PASS, exit 0, 0.25 s, 2/2. |
| `git diff --check 083ebf8 d0a51ae` | PASS, exit 0, 0.01 s. |
| `node scripts/generate-native-assets.mjs` | PASS, exit 0, 0.02 s; checked-in generated outputs unchanged. |
| Evaluated Pod graph + local compile/provider inspection | PASS: exact 58-source graph; exactly one iOS adapter implementation and one `lua_newstate`. |
| Hostile Pod extra-source/provider mutation | PASS as a negative test: rejected. |
| Hostile manifest path, resource bytes/hash, compiled-C, generated-TS drift | PASS as negative tests: each rejected. |
| Hostile product `App.tsx` hardcoding | PASS as a negative test: rejected. |
| Hostile vendor `lapi.h` hardcoding | **FAIL as a negative test:** `verify:g001` exited 0. |
| Complete-looking forged runtime result | **FAIL as a negative test:** validator returned PASS. |

## Environment and safety boundary

- `$HOME/.gradle/wrapper/dists/gradle-9.3.1-bin` is absent.
- `adb devices` reports zero usable targets.
- Generated root `ios/` and `android/` directories are absent after cleanup; no simulator was left booted.
- The independent review used no network/install/download operation. It did not inspect or touch `/Users/chanheekim/Dev/Plus`, did not use or alter port 8081, and did not mutate any remote/CDN/FTP/SFTP destination.
- The detached hostile worktree and temporary output were removed. The repository worktree was clean before this report was written, apart from this required handoff artifact.

## Stop condition

Re-review after both P1 bypasses have fail-closed hostile coverage. If they close and all fast/native static checks remain green, the implementation can be `APPROVE`/`CLEAR` while the G002 story remains honestly `ENVIRONMENT BLOCKED` until an explicitly provisioned exact offline Gradle 9.3.1 cache and an Android target are available.
