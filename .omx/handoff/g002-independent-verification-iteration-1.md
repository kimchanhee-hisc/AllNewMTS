# G002 Independent Verification — Iteration 1

## Final split verdict

- **Implementation verdict:** `REQUEST CHANGES / BLOCK`
- **Story readiness:** `CODE BLOCKED`
- **Secondary environment blocker:** Android has zero attached emulator/device targets. This does not supersede the code blockers below.
- **Reviewed commit:** `083ebf8d6a4edac7d6eca3de7e09a5f4315a3a41`
- **Parent:** `708685ab30586ea9e9d84b137a87bc7f6966bcbc`
- **Tree:** `25859b1eca14193f9eb62c8cb8c9a2e3b2746e86`
- **Diff:** 98 files changed, 2,099 insertions, 40 deletions
- **Implementer handoff:** `.omx/handoff/g002-implementation-iteration-1.md`, SHA-256 `0b10fb9c62d5545efc8559e1b13c77bd15ef5ebff28c2098debf8fc700a00c0c`
- **Completed:** `2026-07-21T03:22:27Z` (`2026-07-21T12:22:27+09:00`)
- **Independence:** this reviewer did not implement or modify the commit. No prohibited engine material or external artifact was opened, inspected, or used.

The official-source/shared-host slice is credible, but the checked-in iOS package cannot link, the G002 runtime acceptance path is not implemented, two security/provenance mutations evade the native verifier, and G001/G001A regress. G002 cannot checkpoint.

## Blocking code findings

### P1 — The iOS Pod omits its mechanics adapter, while the verifier compiles a different source graph

**Evidence:** `modules/allnewmts-lua/ios/AllNewMTSLua.podspec:19-20`; `scripts/verify-native.mjs:145-165`; `modules/allnewmts-lua/ios/AllNewMTSLuaAdapter.mm:9-30`.

- The Podspec includes shared C, official Lua sources, and `*.{h,mm,swift}`, but not `ios/allnewmts_lua_ios_adapter.c`.
- Ruby expansion of the evaluated `source_files` resolved 57 files and confirmed `ios_adapter_c_included=false`.
- The Objective-C++ adapter object has unresolved `_allnewmts_lua_ios_create`, `_allnewmts_lua_ios_evaluate`, and `_allnewmts_lua_ios_destroy`; the omitted C file is their only provider.
- `compileApple` manually adds that C file and only syntax-evaluates the Podspec, so its `PASS native Apple compile` does not represent the actual Pod graph.
- A detached Podspec mutation adding excluded `lua.c`/`linit.c` plus a second Lua dependency still reached the ordinary environment `BLOCKED` result instead of being rejected. Thus G0.1/G0.9 iOS compiled-source and sole-provider evidence is also fail-open.

**Required repair:** include the mechanics adapter in the actual Pod target and compile/link/package-inspect the evaluated Pod graph. Reject any Pod source/dependency outside the exact approved list.

### P1 — G0.2/G0.10 has no executable Expo Development Build fixture or runner

**Evidence:** `scripts/verify-native.mjs:200-226`; `App.tsx:1-22`; repository root has no generated `ios/` or `android/` application project and no JS/native adapter-runtime fixture entrypoint.

- The verifier checks only target availability and then unconditionally appends `no Expo Development Build fixture was installed or executed on either platform`.
- A detached mutation reporting synthetic Android and iOS targets still exited `2` for that unconditional reason. There is no branch that executes the shared fixture/golden through the Swift/Expo and Kotlin/JNI/Expo surfaces.
- The host executable's two C forwarding wrappers are useful mechanics evidence, but they are not iOS/Android Expo adapter execution.

**Required repair:** add a deterministic local Development Build test entrypoint and a verifier-owned iOS/Android runner that executes the same tracked fixture/golden through each actual Expo module. Missing genuine runtime output must continue to block.

### P1 — Adding the official vendor tree breaks the preserved G001/G001A acceptance gate

**Evidence:** `scripts/verify-g001.mjs:44-55,199-206,289-292`.

- `productionFiles()` scans the newly added immutable vendor headers.
- The official `src/lapi.h` revision text compacts into the forbidden identity `1200`, so both the G001A story fixture step and direct `npm run verify:g001` fail with `production static anti-hardcoding tripwire (1200)`.
- This is a fresh integration regression, not a G002 source-integrity failure. The implementer handoff's G001 PASS claim is not reproducible at the reviewed commit.

**Required repair:** keep product anti-hardcoding coverage fail-closed while explicitly classifying immutable pinned third-party source outside product-authored behavioral scanning; add a regression proving product sources remain covered.

### P1 — Resource manifest path/hash evidence is not bound to the compiled resource bundle

**Evidence:** `scripts/verify-native.mjs:92-96`; `modules/allnewmts-lua/shared/resource_bundle.c:5-18`.

- The verifier hashes the tracked resource files but never compares manifest logical paths, bytes, or expected hashes with the separately hand-embedded C table.
- Detached mutation of `resources[0].logicalPath` reached normal environment `BLOCKED` after all source/contracts/host/build checks reported PASS.
- Detached mutation of `native/resources/multi.lua`, with its reviewed manifest/authored hashes updated, also reached the same result because the host harness continued executing the old hard-coded C bytes.

**Required repair:** deterministically generate or independently compare the compiled resource table against the manifest's exact logical path, bytes, and SHA-256 before executing the harness. Keep the hostile mismatched-hash resource independently negative.

## Gate-0 evidence matrix

| Gate | Independent result | Classification |
|---|---|---|
| G0.1 official source | Archive is exactly 221,213 bytes with SHA-256 `2640fc56...5333`; 107 archive members/102 files contain no link or unsafe path; the approved 57-file vendored slice is unique, byte/hash exact, and zero-diff. License `ee5e3e...0a79`; unchanged `luaconf.h` `0410ff...4641`. Exact 24-source manifest/CMake list excludes `lua.c`, `luac.c`, `print.c`, `linit.c`, `loadlib.c`, `liolib.c`, `loslib.c`, and `ldblib.c`. | **PASS for source-core/adoption; iOS package enforcement blocked by P1.** |
| G0.2 local builds/runs | Host, manual Apple compilation, Android NDK arm64 compilation, and autolinking run; actual Expo Development Builds do not. iOS Pod is currently unlinkable. | **CODE BLOCKED** |
| G0.3 Lua 5.1 semantics | Shared host harness reports Lua 5.1 and passes closures/upvalues, varargs, environments, metatables, coroutines, unpack, libraries, protected errors, and chunks. | **HOST PASS; platform runtime unproven** |
| G0.4 sandbox/resources | No `luaL_openlibs`; dynamic sandbox/path/multiple-return/error/hash-negative probes pass. Sandbox exposure mutation and golden drift reject. Compiled resource binding is fail-open. | **BLOCKED by resource P1** |
| G0.5 minimal harness | Three create/evaluate/destroy cycles per host mechanics wrapper pass; guard-created replacement states work. | **HOST PASS; Expo adapters unproven** |
| G0.6 direct C boundaries | Global helper, `Form`, `DATAMANAGER`, and control property/method return synchronously in the shared C harness. | **PASS for shared C boundary** |
| G0.7 guards | 32 MiB allocation and 50 ms hook failures reject, destroy state, return `STATE_DESTROYED`, and permit a newly created state. | **PASS in shared host harness** |
| G0.8 package exclusion | Repository policy and local inventories pass; no prohibited material was inspected. No real APK/AAB/iOS Development Build or loaded-library evidence exists. | **NOT COMPLETE** |
| G0.9 sole provider | Host provider archive exposes 118 Lua symbols; authored-object second-provider mutation rejects; Android shared library has no second dynamic Lua dependency. Pod dependency/source mutation is missed. | **BLOCKED on iOS** |
| G0.10 adapter parity | One tracked fixture/golden passes through the two host C forwarding wrappers only. | **CODE BLOCKED; actual Swift/Kotlin Expo paths absent** |

The public module declarations expose exactly synchronous `create`, `evaluate`, and `destroy`; local Expo 57 APIs accept the Swift/Kotlin `Function` forms, and autolinking finds one module with no duplicate on each platform. The iOS/Android C adapters are mechanics-only, policy found no RN/TypeScript OS semantic branch, and no G003 worker/revision/staging/queue/token/rollback/lifecycle scope was added.

## Hostile mutation evidence

| Detached mutation | Result |
|---|---|
| Official archive byte | Rejected: archive SHA-256 drift. |
| Extra vendored source | Rejected: vendored inventory drift. |
| Add `lua.c` to manifest compiled list | Rejected: compiled source list drift. |
| Add project-authored public `lua_*` definition | Rejected: second provider. |
| Expose `loadfile` | Rejected by shared sandbox harness. |
| Integrity-updated adapter golden drift | Rejected by actual output comparison. |
| Resource logical path drift | **Missed; reached environment BLOCKED.** |
| Resource bytes/hash drift with manifest inventory updated | **Missed; reached environment BLOCKED.** |
| Podspec adds excluded sources and a second provider dependency | **Missed; reached environment BLOCKED.** |
| Synthetic iOS/Android target availability without runtime fixture | Remained BLOCKED, proving the runner is absent rather than merely waiting on targets. |

The final detached mutation harness exited `0` because every expected rejection and every documented false negative matched; its worktree was clean before removal.

## Story, regressions, and environment

| Command | Duration | Result |
|---|---:|---|
| `npm run verify:story -- G002-embed-official-lua-5-1-5` | 4.82 s | Run exactly once; exit `1`. Its sole native check completed offline evidence then exited `2` `BLOCKED`; aggregator honestly rejected the story. |
| `npm run verify:story -- G001A-establish-ai-native-foundation` | 1.97 s | Exit `1`; format/docs/policy/type/unit passed, fixtures failed on official `lapi.h` false positive. |
| `npm run verify:g001` | 0.76 s | Exit `1`; same `lapi.h` `1200` tripwire regression. |
| `npm run verify:type` | 0.47 s | Exit `0`. |
| `npm run verify:unit` | 0.25 s | Exit `0`, 2/2. |
| `git diff --check 708685a 083ebf8` | 0.02 s | Exit `0`. |
| Detached hostile matrix | 23.96 s | Harness exit `0`; results listed above. |

Environment observation without provisioning or booting:

- iOS has 11 already-available simulator devices, all shutdown, and zero booted. This is not the primary blocker: the checked-in Pod and runtime runner must first be repaired. Merely booting an existing simulator cannot make the current verifier pass.
- Android `adb devices` reports zero `device` entries. That is a genuine external target-availability blocker after the implementation defects are repaired.
- No SDK, emulator, dependency, simulator, or device was installed/provisioned/booted. No UI, milestone, network, deployment, publication, CDN, FTP/SFTP, or remote mutation operation ran.

## Cleanup and stop condition

All detached worktrees, synthetic files, compiler outputs, symlinks, and temporary extraction directories were removed. `git worktree list` showed only the main worktree at `083ebf8`; `git status --short` was empty before this report. No tracked implementation file was changed by this reviewer.

**Final: implementation `REQUEST CHANGES / BLOCK`; story readiness `CODE BLOCKED` (plus a secondary Android environment blocker). Do not checkpoint G002 or activate G003.**

The report SHA-256 is recorded in the parent handoff after this file is closed.
