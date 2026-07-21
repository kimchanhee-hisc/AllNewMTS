# G001 Independent Verification — Iteration 4

## Target result
Independently audit repaired, clean main for G001 readiness. Produce `.omx/handoff/g001-independent-verification-iteration-4.md` with exactly one final recommendation (`APPROVE` or `REQUEST CHANGES`) and one architectural status (`CLEAR`, `WATCH`, or `BLOCK`). Do not trust prior pass claims.

## Non-negotiable read-only safety
- Tracked source/test files are immutable during this audit. Before every generated output/mutation command, prove its write destination is under a fresh absolute `/tmp/...` directory.
- Never pass any tracked repository path as a generator output. Safe generator form: `OUT=$(mktemp /tmp/g001-synthetic.XXXXXX); node scripts/generate-g001-synthetic.mjs "$OUT"`; the source is implicit. Verify the output, then remove only that `/tmp` file.
- All adversarial mutations must occur inside an independently created disposable `/tmp` Git worktree/clone. Never stage/edit tracked files in the Team worktree or leader checkout.
- Run `git status --porcelain=v1` after every mutation/generator phase. If any tracked Team-worktree file changes, STOP, restore through Team flow, invalidate the audit, and notify leader.
- The only repository write allowed is the final ignored handoff report. Clean all disposable worktrees before completion.
- Never inspect/use/invoke/cite/derive evidence from MVigsEngine or its source/binaries/headers/traces/outputs/artifacts.
- G001 only; no G002/runtime/UI work, no interpreter implementation/modification, no per-screen rewrite.

## Required independent evidence
1. Baseline on current main: approved XMF SHA-256 `4d63ba22ac5339cfd3068cffa91710e0099481da81d974e2aff0ce7ae39ed53e`; `npm run verify:g001`; `npx tsc --noEmit`; both G001 Node syntax checks; manifest + exactly six golden JSON parse; generator output twice to two explicit `/tmp` files and byte comparison to frozen synthetic; clean tree and `git diff --check`.
2. Recompute all 10 source provenance records: approved repo/path/commit, containment/no symlink escape, tracked+clean, commit/index/clean-filter/blob identities, materialized equality, raw metadata, HS1200P08 LF raw blob vs CRLF checkout.
3. Directly audit all six exact trace semantics, including over-100 confirm+dismiss/no-op and close/cancel success.
4. Confirm equivalent `btnAdd_OnClick` close-return calls have deeply equal pre-command states, ACTIVE before queued command application, CLOSING only in `stateAfterCommands`.
5. In disposable `/tmp` Git copies only, prove rejection of all historical bypasses: frozen byte drift, symlink escape, wrong warning, early CCS20000, wrong error args, NoChange leak, equivalent state/control removal, direct/composed forbidden identities across native/Lua/JS/TS/config, and tracked chmod+x extensionless executable hardcoding. Refresh manifest metadata when needed to prove semantic checks are the rejection source.
6. Confirm the tripwire output explicitly defers original-plus-synthetic dynamic genericity proof; do not overclaim.
7. Review iteration 1/2 blockers and iteration-3 incident, but reproduce evidence. The iteration-3 audit is invalid and cannot be reused as approval evidence.

## Verdict rule
Only `APPROVE` + `CLEAR` if every prior implementation blocker is closed, no new blocker exists, no tracked audit contamination occurs, and all temp worktrees are cleaned. Otherwise `REQUEST CHANGES` with exact evidence.
