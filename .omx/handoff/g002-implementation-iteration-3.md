# G002 Implementation Handoff — Iteration 3

## Outcome and bounded scope

- **Implementation commit:** `270d6033b01b6d0799e844fcd5b3276b00cee4b5`
- **Reworked commit:** `d0a51ae7e87ede2361f30cce30872eda3c03b001`
- **Reviewer input:** `.omx/handoff/g002-independent-verification-iteration-2.md`, verified SHA-256 `2fa6218880775449500653560542d44fa5f06056ab7b99fc932312536bd22767`.
- **Goal:** repair exactly the two remaining P1 verifier bypasses without expanding G002.
- **Implementation result:** both bypasses now fail closed. The final G002 run again proved the real iOS package/runtime path and stopped only at the declared Android offline dependency boundary.
- **Non-goals preserved:** no G003, product Host API, XMF renderer, UI, packaging-release, interpreter work, OS-selected product semantics, prohibited engine material, deployment, remote mutation, CDN mutation, FTP/SFTP, dependency install, or download.

## P1 closure evidence

| Reviewer finding | Minimal repair | Hostile evidence |
|---|---|---|
| G001 excluded every file under the pinned vendor prefix without proving the excluded tree | Before `pinnedThirdPartyRoot` exists or `isProductBehavioralFile()` can grant the exclusion, `verify-g001` reuses its existing recursive `inventory()` to compare the actual Lua vendor tree with all 57 manifest paths exactly. It then checks every entry's nonnegative byte count and SHA-256 against `native/lua-source-manifest.json`. Existing product hardcoding tripwires remain unchanged. | A detached worktree at the committed revision appended `CCS20000` to `src/lapi.h`; `npm run verify:g001` exited 1 with `pinned Lua vendor byte drift`. A separate extra `src/reviewer-extra.c` mutation exited 1 with `pinned Lua vendor inventory drift`. The detached worktree was removed. Baseline G001 and the full G001A story pass. |
| Exported `validateDevelopmentBuildResult()` approved a complete caller-forged PASS shape | The validator is now module-private. `run-gate0-development-build.mjs` exports only `runGate0DevelopmentBuild`, the actual build/package/runtime entrypoint. No token or secondary framework was added. `verify-native` constructs the complete tracked golden/cycles/provider PASS object before native compilation and proves the module has exactly the one real execution export and no callable validator. | On the committed tree, the exact complete forged object—tracked golden, `cycles: 3`, iOS/Android `luaProviderCount: 1`—cannot call an approval function. `Object.keys(module)` is exactly `['runGate0DevelopmentBuild']`, and the forged validator call throws. The canonical G002 native check executes the same hostile assertion before expensive work. |

## Changed paths and deterministic ownership

- `scripts/verify-g001.mjs`: pre-exclusion exact vendor inventory/bytes/hash gate.
- `scripts/run-gate0-development-build.mjs`: validator made module-private; real runner remains the sole export.
- `scripts/verify-native.mjs`: complete forged-PASS hostile public-surface check and sole-entrypoint invocation.
- `docs/testing.md`: canonical verification contract documents both boundaries.
- `test/oracles/manifest.json`: changed only the existing `scripts/verify-g001.mjs` artifact entry to `bytes=23737`, SHA-256 `818926711abdebb5416081c748d2cb6d606620ff10fd739aa8a621dcbdd90f59`.
- `verification/manifest.json`: refreshed integrity hashes for the three changed owned files (`docs/testing.md`, runner, and native verifier).

No oracle source, golden trace, provenance record, Lua vendor byte, native source manifest, compiled/generated asset, or semantic expectation changed. `node scripts/generate-native-assets.mjs` reported both checked-in files stable.

## Verification record

| Command / check | Duration / exit | Result |
|---|---:|---|
| `npm run verify:fast` | about 1.3 s / 0 | PASS on final code: format, docs, policy, type, and 2/2 unit tests. |
| `npm run verify:g001` | <1 s / 0 | PASS baseline after the vendor gate; immutable oracles, provenance, generator, negative checks, and product hardcoding tripwires remain active. |
| Hostile vendor byte mutation | <1 s / 1 | PASS as a negative check: rejected with `pinned Lua vendor byte drift: src/lapi.h`. |
| Hostile vendor extra-file mutation | <1 s / 1 | PASS as a negative check: rejected with `pinned Lua vendor inventory drift`. |
| Detached committed hostile mutations | <1 s each / 1 each | PASS: both byte append and extra-file cases failed at commit `270d603`; temporary worktree removed. |
| Complete forged PASS public-surface probe | <1 s / 0 | PASS: sole export is the real runner; forged validation call throws. |
| `node scripts/generate-native-assets.mjs` | <1 s / 0 | PASS; 2 generated files stable. |
| `npm run verify:type` | <1 s / 0 | PASS. |
| `npm run verify:unit` | <1 s / 0 | PASS, 2/2. |
| `npm run verify:story -- G002-embed-official-lua-5-1-5` | 139.83 s / 1 | **Executed exactly once on final code.** Native source/contracts/host/evaluated Pod/Android NDK/autolinking and actual iOS package/runtime passed. Native returned 2 for the honest Android offline block, so the story aggregator rejected readiness. |
| `npm run verify:story -- G001A-establish-ai-native-foundation` | 2.19 s / 0 | PASS; all seven owned checks ran once. |
| `git diff --check` | <1 s / 0 | PASS. |

The changed-files-only AI slop inspection was a no-op: no duplicate framework, dead code, needless abstraction, masking fallback, or UI surface was introduced. The pre-existing offline `BLOCKED` branches are explicit fail-closed dependency/target boundaries and retain their evidence.

## Actual native evidence and remaining environment block

- Official archive/inventory: PASS, 221213 archive bytes and 57 zero-diff Lua files.
- Shared native host: PASS, 118 Lua symbols from the sole official provider and guarded adapter fixture.
- Evaluated Apple Pod graph: PASS, exact 58 sources, only `ExpoModulesCore`, one adapter and one Lua provider.
- Android mechanics: PASS, arm64-v8a NDK/JNI build and no second Lua dependency.
- iOS Development Build: PASS, bundle `com.anonymous.allnewmts`; exactly one Lua provider in `AllNewMTS.debug.dylib`.
- iOS runtime: PASS, three real JS-to-native create/evaluate/destroy cycles with golden `Lua 5.1|7|env|true|meta|true|yield|true|done|uv|STRING|3|resource51|global|form|data|property|method`.
- Android Expo integration: `BLOCKED`, `OFFLINE_DEPENDENCY_UNAVAILABLE`; exact `gradle-9.3.1-bin.zip` is absent locally and network access is forbidden. No Android build, APK, or runtime claim is made.

## Safety, cleanup, rollback, and review boundary

- Iteration 3 performed no network, install, download, deployment, publication, credential operation, remote/CDN mutation, or FTP/SFTP access.
- Generated root `ios/` and `android/` are absent; no simulator remains booted; a fresh boot/query returned status 2 for `com.anonymous.allnewmts`, then shutdown restored the simulator state.
- The runner-created Metro process is absent. Unrelated `/Users/chanheekim/Dev/Plus` listener PID `67162` remains on port 8081 and was never reused, signaled, or changed.
- No Gradle 9.3.1 executable/cache was created. The exact missing distribution remains the external blocker.
- Repository worktree is clean at the implementation commit. Temporary detached hostile worktree and mutation files were removed.
- **Rollback:** `git revert 270d6033b01b6d0799e844fcd5b3276b00cee4b5`; no remote rollback is required.
- This implementer does not issue `APPROVE` or `CLEAR`. A separate non-implementing reviewer owns the iteration-3 verdict and may classify code readiness separately from the honest Android environment block.
