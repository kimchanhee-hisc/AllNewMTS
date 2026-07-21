# G001 Independent Verification — Iteration 2

## Target result
Independently decide whether repaired G001 "Freeze independent oracles" is ready. Do not trust implementer-reported results. Return a durable report at `.omx/handoff/g001-independent-verification-iteration-2.md` with a final recommendation exactly `APPROVE` or `REQUEST CHANGES` and architectural status exactly `CLEAR`, `WATCH`, or `BLOCK`.

## Hard constraints
- Read-only audit of product/test source. Do not modify tracked source, plans, package files, traces, or manifests.
- You may create disposable temp copies/worktrees outside the repo solely for adversarial mutation tests.
- Never inspect, use, invoke, mention as evidence, or derive anything from MVigsEngine source, binary, headers, traces, outputs, or artifacts.
- G001 only. Do not start Lua runtime work (G002+), do not implement or modify a Lua interpreter.
- General Lua compatibility and unchanged XMF execution remain downstream requirements; TypeScript/native per-screen rewrites are forbidden.

## Evidence to reproduce independently
1. Fresh baseline: `npm run verify:g001`, `npx tsc --noEmit`, Node syntax checks, all oracle JSON parses, generator reproducibility, clean tracked tree.
2. Inspect all six traces for deterministic timing and exact semantics. In particular, snapshots are after the Lua handler and before queued command application; equivalent `SendReturnToParent(..., true)` handler snapshots must not disagree. Verify both over-100 confirm and non-confirm/dismiss behavior without increasing the six-file count.
3. Provenance: for every frozen source, verify approved repository/path/commit, path containment and no symlink escape, Git tracked/clean state, raw blob identity, clean-filter/materialized bytes, and the documented HS1200P08 LF-blob versus CRLF-checkout distinction.
4. Independently create isolated disposable mutations and prove rejection for every previous false negative:
   - frozen source byte drift;
   - wrong >100 warning and early `CCS20000` request;
   - wrong error arguments;
   - `NoChange` leakage in success path;
   - hardcoded identity in C/C++/Java/Kotlin/ObjC/Swift/Lua/JS/TS/config/executable-like tracked production surfaces;
   - composed identities such as `"CCS" + "20000"`, screen/ordinal/layout fragments;
   - symlink escape from frozen source path.
5. Confirm the anti-hardcoding output is honest: it is a static tripwire only; original-plus-synthetic dynamic genericity proof is explicitly deferred to a later runtime gate.
6. Compare findings with `.omx/handoff/g001-independent-verification.md`, but reproduce evidence rather than accepting it.

## Stop condition
Only `APPROVE` + `CLEAR` if all four prior blocker classes are genuinely closed and no new blocker exists. Otherwise return `REQUEST CHANGES` and at least `WATCH`, with concrete file/line and reproduction evidence.
