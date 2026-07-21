# G001 Independent Verification — Iteration 3

## Target result
Independently audit current main for G001 readiness after iteration-2 rework. Do not trust implementer/root pass summaries. Write `.omx/handoff/g001-independent-verification-iteration-3.md` with final recommendation exactly `APPROVE` or `REQUEST CHANGES` and architectural status exactly `CLEAR`, `WATCH`, or `BLOCK`.

## Hard boundaries
- Read-only tracked-source audit. Disposable temp worktrees are permitted; clean them before finishing.
- Never inspect/use/invoke/cite/derive evidence from MVigsEngine source, binaries, headers, traces, outputs, or artifacts.
- G001 only: no Lua runtime/G002+ implementation, no interpreter implementation/modification, no per-screen TypeScript/native behavior rewrite.

## Required independent gates
1. Fresh baseline: `npm run verify:g001`, `npx tsc --noEmit`, both G001 Node syntax checks, manifest/all six golden JSON parse, exactly six trace files, generator reproducibility, `git diff --check`, clean tracked tree.
2. Re-audit all 10 frozen-source provenance records: approved repo/path/commit, containment/no symlink escape, tracked+clean, commit/index blob identity, clean-filter/materialized equality, raw blob metadata, and HS1200P08 LF raw blob vs CRLF checkout.
3. Re-audit exact semantics for all six traces, including over-100 confirm+dismiss/no-op and close/cancel success behavior.
4. Specifically confirm equivalent `btnAdd_OnClick` calls to `Form.SendReturnToParent("AddNewGroup", "새그룹", true)` have deeply equal pre-command state, remain ACTIVE before queued commands, and transition to CLOSING only in `stateAfterCommands`.
5. In isolated disposable worktrees, mutate manifest metadata as necessary so semantic—not hash—checks are exercised. Prove rejection of every historical false negative:
   - frozen source byte drift and symlink escape;
   - wrong >100 warning;
   - early CCS20000 request;
   - wrong error args;
   - NoChange leak;
   - equivalent close-return control/state removal;
   - direct and composed forbidden identities across native/Lua/JS/TS/config surfaces;
   - a tracked chmod+x extensionless executable containing `CCS20000`.
6. Confirm static tripwire claims are honest and dynamic original-plus-synthetic genericity proof remains explicitly deferred.
7. Compare iteration-1 and iteration-2 reports, but reproduce findings. Clean any disposable worktrees.

## Verdict rule
Only `APPROVE` + `CLEAR` if all prior blocker classes are closed and no new blocker exists. Otherwise `REQUEST CHANGES` and at least `WATCH`, with exact reproduction and file/line references.
