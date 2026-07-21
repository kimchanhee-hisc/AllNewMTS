# G001 Rework — Iteration 2

## Target result
Repair only the two blockers in `.omx/handoff/g001-independent-verification-iteration-2.md`, keep G001 otherwise unchanged, and leave the Team worktree clean with fresh passing evidence. Do not claim G001 complete; a separate verifier must decide.

## Required changes
1. Normalize the equivalent `btnAdd_OnClick` events that call `Form.SendReturnToParent("AddNewGroup", "새그룹", true)` under the declared timing `after Lua handler and before queued command application`.
   - The pre-command state snapshots must be structurally/deeply equal for equivalent events, including control state rather than omitting it in one trace.
   - Preserve `lifecycle: ACTIVE` before queued commands and explicit `stateAfterCommands.lifecycle: CLOSING` afterward.
   - Add a verifier assertion that groups equivalent close-return events and rejects any deep state mismatch; add a negative self-test that mutates/removes a control field and proves rejection.
   - Keep exactly six golden trace files.
2. Extend the static hardcoding tripwire to include every tracked executable-mode file (Git mode `100755`) regardless of name or extension, while preserving current exclusions for oracle artifacts and the two G001 scripts.
   - Add a deterministic negative self-test using a tracked extensionless executable containing a forbidden identity and prove rejection.
   - Keep the output honest: static tripwire only; dynamic original-plus-synthetic proof remains deferred.

## Constraints
- No G002/runtime/UI implementation.
- Never inspect/use/reuse/cite/derive from MVigsEngine or its source/binaries/headers/traces/outputs.
- Do not implement or modify a Lua interpreter.
- Do not rewrite screen behavior in TypeScript/native.
- Use the Team worktree only and normal Team integration; do not manually reset/rewrite leader main.
- Minimize the patch: expected tracked changes are `scripts/verify-g001.mjs`, the affected golden JSON, and manifest bytes/hash if needed.

## Required verification
- `npm run verify:g001`
- `npx tsc --noEmit`
- Node syntax checks for both G001 scripts
- parse all oracle JSON
- generator reproducibility
- external disposable mutation proof for (a) equivalent snapshot control removal and (b) tracked chmod+x extensionless hardcoding
- regression rejections for prior mutations
- `git diff --check`; clean worktree after commit/integration
