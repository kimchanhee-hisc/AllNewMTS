# G003 user-interruption checkpoint — 2026-07-21

## Outcome

- User requested an immediate mid-work stop for Mac reformatting and a Git checkpoint.
- Active goal remains `G003-implement-bounded-native-runtime`, attempt 1, `in_progress`.
- G003 is **not complete**, **not approved**, and **not clear**. G004 must not start.
- Baseline implementation HEAD is `7d0de1948d817803cee63e1b3e4dd0bcb09f722e`.
- The G003 Codex/Autopilot session `omx-1784624162673-s8qovi` was cancelled and its tmux session stopped. No G003 build/runtime process remained afterward.
- This is a local, resumable checkpoint only. It is not story or milestone acceptance.

## Review state before interruption

- Independent code review: `REQUEST CHANGES` in `.omx/handoff/g003-code-reviewer-iteration-1.md`.
- Independent architecture review: `BLOCK` in `.omx/handoff/g003-architect-review-iteration-1.md`.
- The iteration-1 reviewer ran `npm run verify:story -- G003-implement-bounded-native-runtime` exactly once on clean HEAD `7d0de19`; it passed, but the reviews found material gaps that prevent readiness.
- Required rework includes the C-safe Lua boundary, exact stage/command/arena accounting, reentrant destroy and terminal registry lifetime, removal of the production G002 evaluate escape hatch, Host/control contract alignment, strict identifier/global handling, allocation atomicity, token synchronization, discriminated schema alignment, and real cross-platform G003 golden execution.

## Partial rework captured

The interrupted executor had started implementation-only rework. The checkpoint intentionally preserves incomplete, unreviewed changes in:

- `modules/allnewmts-lua/android/CMakeLists.txt`
- `modules/allnewmts-lua/shared/allnewmts_runtime.cpp`
- `modules/allnewmts-lua/shared/allnewmts_runtime.h`
- `modules/allnewmts-lua/shared/allnewmts_runtime_lua.c` (new)
- `modules/allnewmts-lua/shared/allnewmts_runtime_lua.h` (new)
- `scripts/verify-runtime.mjs`

The new C files begin separating allocation/error-capable Lua frames from C++ ownership code. The runtime changes also begin replacing full-state staging with a charged overlay and revising registry/lifecycle handling. These changes were interrupted and must be treated as untrusted until the full review findings are traced and verified.

## Verification tier and evidence

- Tier: interruption/checkpoint; diagnostic only.
- `npm run verify:fast`: **FAIL**, exit 1. Format passed; docs stopped on the expected interrupted integrity drift for `scripts/verify-runtime.mjs` (`actual c034f505...`, manifest `eacc0182...`). The unreviewed manifest was intentionally not rebound merely to make the checkpoint green.
- Canonical G003 story: **not run** for this partial rework.
- Milestone, UI, device, network, deployment, CDN, and remote mutation checks: not run.

## Deterministic checkpoint inventory

- Durable OMX paths are now selectively tracked through `.gitignore`: `context`, `handoff`, `interviews`, `notepad.md`, `plans`, `reports`, `specs`, and `ultragoal`.
- Runtime-only OMX paths remain ignored, including `.omx/state`, `.omx/logs`, `.omx/runtime`, `.omx/team`, `.omx/tmp`, and `.omx/metrics.json`.
- Secrets and user-level Codex state such as `~/.codex/auth.json` are outside the repository and are not included.
- Staged inventory: 115 paths; 108 newly tracked durable OMX paths, six partial implementation paths, and `.gitignore`. The name/status inventory SHA-256 is `63801055d655714a1e8b4ed9006d3552b6e107f062c5630af65184dd5c073c2c`.
- Partial implementation blob SHA-256 values:
  - `modules/allnewmts-lua/android/CMakeLists.txt`: `957621e23747b8cd29d6582dd34802e8ba6879cd22942320971f6db08b0bf4ed`
  - `modules/allnewmts-lua/shared/allnewmts_runtime.cpp`: `35ad0c86a89194dda9eb22513597bdc58da9958d95dcdcd34425e14fe9f909d7`
  - `modules/allnewmts-lua/shared/allnewmts_runtime.h`: `4f9e12dc953278abec906f0fe7b1652bee7083d254815d848540db4e9e6fc836`
  - `modules/allnewmts-lua/shared/allnewmts_runtime_lua.c`: `3807a095ed9b72653f6b7a14f3fe472bedbc011c4913721049a88b2ad1591d66`
  - `modules/allnewmts-lua/shared/allnewmts_runtime_lua.h`: `4d1afd185e75bb1df1b82a8da13390f5144ef01e38be124f8202c1a335530bb0`
  - `scripts/verify-runtime.mjs`: `c034f5055076087de090d10c3d55cba424c3a5bf3d80bd5071e3accae85eee98`

## Risks and resume instructions

1. Clone/checkout this checkpoint and read this file plus both iteration-1 review reports before editing.
2. Keep G003 `in_progress`; do not infer readiness from the pre-rework story PASS.
3. Run `npm run verify:fast` first and repair the interrupted change set against every recorded blocker.
4. Update canonical prose, machine contracts, implementation, and hostile tests atomically where semantics change.
5. Use fresh independent code-reviewer and architect passes. A subsequent canonical story execution belongs to the new non-implementing reviewer; do not self-attest `APPROVE` or `CLEAR`.

## Cleanup and rollback

- The stopped G003 Codex PID and tmux session were confirmed absent.
- No owned G003 emulator, story process, or runtime verifier remained.
- Roll back this interruption snapshot with `git revert <checkpoint-commit>`; roll back the original G003 implementation with `git revert 7d0de1948d817803cee63e1b3e4dd0bcb09f722e`.
- No remote push was performed by the agent because the repository instructions prohibit remote-state mutation.

## Final fast-check result

- Command: `npm run verify:fast`
- Executions for this checkpoint: exactly one
- Result: exit 1
- Passed before stop: `verify:format`
- Stop: `verify:docs` integrity drift in the partially edited `scripts/verify-runtime.mjs`
- Log: `/tmp/allnewmts-g003-user-interruption-checkpoint-fast.log`
- Log SHA-256: `cea336689d856ad67d86d46a03d8dba835bce9169c49b5a063e5f8d1a4a2670c`
- `git diff --cached --check`: reports only whitespace already present in archived G001/team handoff and report artifacts plus two historical steering EOF blanks. Those evidence artifacts were preserved byte-for-byte rather than rewritten and invalidating their recorded hashes.
- Story acceptance was not run.
