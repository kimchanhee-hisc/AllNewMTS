# G002 Independent Verification — Iteration 3

## Outcome

- **Implementation verdict:** `APPROVE`
- **Architectural status:** `CLEAR`
- **Story readiness:** `ENVIRONMENT BLOCKED`
- **Reviewed commit:** `270d6033b01b6d0799e844fcd5b3276b00cee4b5`
- **Parent commit:** `d0a51ae7e87ede2361f30cce30872eda3c03b001`
- **Implementer handoff:** `.omx/handoff/g002-implementation-iteration-3.md`, verified SHA-256 `0928798fc8b55cdcfba1d52a54f2f3776e9d98396847a3a19f371f142e671263`
- **Prior independent review:** `.omx/handoff/g002-independent-verification-iteration-2.md`, verified SHA-256 `2fa6218880775449500653560542d44fa5f06056ab7b99fc932312536bd22767`

Both iteration-2 P1 bypasses are closed with fresh fail-closed hostile evidence. The previously closed Pod/mechanics/provider and generated-resource boundaries did not regress. No blocking or non-blocking code finding remains in the reviewed scope.

G002 cannot honestly become story-ready on this machine: the exact offline Gradle 9.3.1 distribution cache is absent, and `adb devices` exposes zero runtime targets. These are external environment blockers, not code defects. No Android build, APK, or runtime approval is inferred from host/NDK checks.

## Iteration-2 P1 closure

### CLOSED — Vendor exclusion is granted only after exact manifest verification

**Code:** `scripts/verify-g001.mjs:47-57`.

Before `pinnedThirdPartyRoot` exists and can exclude upstream Lua from the product hardcoding scan, the verifier now:

1. fixes the allowed vendor root;
2. recursively compares the actual tree with all manifest paths exactly;
3. rejects symlinks and extra files;
4. validates every manifest byte count; and
5. validates every SHA-256 value.

Fresh baseline evidence independently found exactly 57 actual and 57 manifest entries, no extras, and exact bytes/SHA-256 for every entry. `npm run verify:g001` passed on the clean commit.

Fresh detached-worktree hostile evidence at the reviewed commit:

```text
BYTE_APPEND_EXIT=1
AssertionError [ERR_ASSERTION]: pinned Lua vendor byte drift: src/lapi.h

EXTRA_FILE_EXIT=1
AssertionError [ERR_ASSERTION]: pinned Lua vendor inventory drift

PRODUCT_HARDCODING_EXIT=1
AssertionError [ERR_ASSERTION]: production static anti-hardcoding tripwire (CCS20000): App.tsx
```

Thus an appended byte in a committed vendor file and an untracked extra vendor file both fail before exclusion can conceal them, while product-authored hardcoding remains covered.

### CLOSED — Forged result objects have no public approval surface

**Code:** real entrypoint at `scripts/run-gate0-development-build.mjs:191`; private validator at `scripts/run-gate0-development-build.mjs:374-394`; hostile contract at `scripts/verify-native.mjs:265-279`.

Fresh ESM namespace inspection proved the module exports exactly one callable symbol:

```json
{"exports":["runGate0DevelopmentBuild"],"validatorCallable":false,"forgedAccepted":false,"error":"runner.validateDevelopmentBuildResult is not a function"}
```

The probe constructed the full prior bypass payload with the tracked golden, `cycles: 3`, and both platforms reporting `luaProviderCount: 1`. It cannot call a validator or obtain PASS. The only public entrypoint performs the actual preflight/build/package/runtime workflow; the result-shape validator remains module-private. No speculative token or secondary framework was introduced.

## Regression checks for previously closed boundaries

### Pod graph, mechanics adapter, and sole provider

- `pod ipc spec` ran inside a local macOS deny-network sandbox.
- Evaluated graph: exactly 58 sources and the sole dependency `ExpoModulesCore`.
- `allnewmts_lua_ios_adapter.c` is present with exactly one create/evaluate/destroy definition.
- `src/lua.c` remains excluded; adding it produces a graph mismatch.
- A hypothetical second Lua dependency produces a dependency mismatch.
- The compiled-source allowlist contains exactly one `lua_newstate` definition file, `src/lstate.c`.
- Podspec, Expo config, shared/iOS/Android native trees, native manifest, and native asset generator are byte-identical to the already-approved iteration-2 parent surfaces.

### Generated resource binding

- `node scripts/generate-native-assets.mjs` passed without modifying either generated file.
- An independent in-memory check byte-compared both generated outputs.
- Logical-path drift changed the compiled C output.
- Resource byte/hash drift changed the compiled C output.
- A mismatched declared resource hash threw `resource hash drift`.

### Normal startup and scope

- TypeScript AST inspection found zero static imports and exactly one dynamic import of `gate0-runtime`.
- That import is dominated by the exact guard `process.env.EXPO_PUBLIC_G002_NATIVE_HARNESS === '1'`; the ordinary false path does not load the harness/native module.
- The iteration-3 diff changes only two verification scripts, the private/export boundary in the runner, testing documentation, and integrity manifests. No G003, XMF/XMS renderer, Host API, UI, OS-selected product semantics, interpreter, or prohibited engine scope was added.

### Networkless and reversible runner contract

Static checks confirmed all retained boundaries:

- Expo prebuild uses `--no-install`.
- CocoaPods runs through `sandbox-exec` with `deny network*` and `--no-repo-update`.
- Metro reserves its own loopback port and starts with `--offline`.
- Gradle uses only the directly selected cached binary with `--offline --no-daemon`; no wrapper process is spawned.
- Pre-existing iOS/Android apps and same-port adb reverse rules are refused.
- Only runner-owned apps, reverse rule, simulator boot state, Metro process group, and generated native trees are cleaned.

## Verification record

The reviewer intentionally did **not** run the canonical G002 story, `verify:native`, a Development Build, UI/milestone checks, dependency install/download, release/package deployment, or any remote-changing command.

| Check | Result |
|---|---|
| `npm run verify:fast` | PASS, exit 0. All five child checks ran once; reported child duration total 1.072 s. |
| `npm run verify:g001` | PASS, exit 0, under 1 s. |
| `npm run verify:type` | PASS, exit 0, under 1 s. |
| `npm run verify:unit` | PASS, exit 0, 2/2 tests, under 1 s. |
| `node scripts/generate-native-assets.mjs` | PASS, exit 0, 2 stable files. |
| `git diff --check d0a51ae..270d603` | PASS, exit 0. |
| Independent baseline vendor inventory/bytes/SHA | PASS, exact 57/57 entries and no extras. |
| Detached vendor byte append | PASS as a negative test: `verify:g001` exited 1. |
| Detached vendor extra file | PASS as a negative test: `verify:g001` exited 1. |
| Detached product hardcoding | PASS as a negative test: `verify:g001` exited 1. |
| Complete forged Development Build PASS object | PASS as a negative test: no public validator; forged result not accepted. |
| Sandboxed evaluated Pod/static provider regression | PASS: 58 exact sources, mechanics adapter present, sole dependency/provider, added provider/dependency rejected. |
| Generated resource drift matrix | PASS: stable baseline and path/bytes/hash binding retained. |
| Normal-entry AST and runner safety checks | PASS. |

## Environment, safety, and cleanup

- Exact cache `$HOME/.gradle/wrapper/dists/gradle-9.3.1-bin`: **absent**.
- `adb` usable target count: **0**.
- Root generated `ios/` and `android/` directories: **absent**.
- Booted simulator count after review: **0**.
- The independent review used no network, install, or download operation and made no deployment, publication, CDN mutation, FTP/SFTP, credential, or other remote change.
- `/Users/chanheekim/Dev/Plus` and port 8081 were not inspected, reused, signaled, or modified.
- The detached hostile worktree and all mutation/output files were removed. No implementation file was changed by this review.

## Final disposition

The code at `270d6033b01b6d0799e844fcd5b3276b00cee4b5` is independently `APPROVE` / `CLEAR` for G002. Story readiness remains exactly `ENVIRONMENT BLOCKED` until an explicitly provisioned, exact offline Gradle 9.3.1 cache is available and an Android emulator/device is attached; the offline restrictions must not be weakened to clear that block.
