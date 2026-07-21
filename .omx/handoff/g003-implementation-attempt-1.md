# G003 implementation handoff — attempt 1

- Date: 2026-07-21 (Asia/Seoul)
- Baseline: `08ba9c0c720f7e7af8086de61facbb9c2ca0b026`
- Implementation HEAD: `7d0de1948d817803cee63e1b3e4dd0bcb09f722e`
- Scope: G003 bounded production Lua runtime only
- Status: implementation complete; **not an APPROVE/CLEAR decision**
- Canonical G003 story: intentionally not run; independent reviewer owns its single execution.

## Delivered

- Added the separate shared production C ABI `create/dispatch/destroy`, strict bounded JSON codec, per-runtime serial worker/Lua ownership, monotonic runtime/revision/token IDs, immutable full Host snapshots, ordered one-shot commands, staged commit/rollback, invalidation, close choreography, destroy synchronization, token admission, resource loader, sandbox, allocator/instruction/deadline/state/queue/command/diagnostic limits, and two-runtime isolation.
- Activated the evidence-backed 18-entry deny-by-default Host ledger: seven `Form`, four `DATAMANAGER`, `Trim`, manifest `dofile`, and five generic Edit/Button boundaries. No screen/OS identity behavior was added.
- Added mechanics-only Objective-C++/Swift and JNI/Kotlin adapters plus one platform-neutral TypeScript wrapper. Strict runtime-ID parsing is shared, so malformed decimal IDs have identical platform results.
- Kept the G002 `create/evaluate/destroy` harness separate. The focused runtime check repeats only the four approved narrow G002 smokes.
- Added manifest-bound tiny Lua fixtures and hostile native conformance for allocator/state/stage/command/event/queue/token limits; nested-send rollback; callback classifications; repeated/missing/error close; queued cancellation; destroy/sink lifetime; resource/hash/path/dofile behavior; max-input Host timing; and interleaved runtime isolation.
- Activated `verify:runtime`, the G003 story/layer owner, runtime result schema, actual iOS simulator clang compilation, and actual Android NDK arm64 compilation. No UI/device/milestone/package test was run.
- Corrected tracked remote policy to the binding CDN-only boundary: product-CDN deployment/mutation and FTP/SFTP-to-CDN remain prohibited; non-CDN remote work is active-slice controlled, not globally banned. G003 still performs no network/socket transport; `RequestTranData` only stages output.

## Verification evidence

Final-code commands:

1. `node scripts/generate-native-assets.mjs` — PASS, 2 generated files stable.
2. `npm run verify:runtime` — PASS: contract-ledger, limits-security, core-atomicity, lifecycle-tokens, isolation, adapter-parity (actual iOS clang/archive and Android NDK shared-library build), narrow-g002-smokes.
3. `npm run verify:policy` — PASS: 160 paths / 142 text-build-config surfaces.
4. `npm run verify:unit` — PASS: 3/3 tests.
5. `npm run verify:fast` — PASS once on final HEAD inputs: format/docs/policy/type/unit; diagnostic-only.
6. `git diff --check` — PASS.
7. `git status --short` after commit — empty.

`npm run verify:story -- G003-implement-bounded-native-runtime`, `verify:native`, milestone, CI, UI, device/emulator, network, deployment, remote mutation, and CDN operations were not run.

## Steering supersession

The binding correction is `.omx/specs/user-steering-cdn-only-remote-boundary-correction-20260721.md`, SHA-256 `56d6577b46f6bd5f962c98f313e9c1f9cc2922a6ae377d60a13ef0231af73019`. It supersedes the global remote/deployment/FTP wording still present as historical text in OMX PRD/test-plan and earlier advisory handoffs. Tracked `AGENTS.md`, canonical product/runtime/testing docs, static policy, tests, and integrity hashes now use the CDN-scoped rule. `.omx/ultragoal` artifacts were not edited in this implementation lane.

## Residual risks / deferred scope

- RN-visible production glue was target-compiled, but actual Development Build/device UI execution is intentionally deferred to its later owner; this implementation provides no UI/XMF parser/G005 screen path.
- The focused suite is local and deterministic; canonical story acceptance and separate non-implementing code review remain mandatory.
- No transport exists in G003. Future non-CDN transport needs its own endpoint/credential/retry/audit/dependency/test contract.

## Cleanup and rollback

- Focused verifier removes its temporary build directory on success; stale attempt directories were removed. No emulator/device/app/Metro/ADB rule, generated platform tree, credential, endpoint, or remote state was created.
- Repository tree was clean at handoff.
- Rollback: `git revert 7d0de1948d817803cee63e1b3e4dd0bcb09f722e`.
