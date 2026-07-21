# Deep Interview Transcript: AllNewMTS Lua runtime

- Profile: standard
- Type: brownfield
- Context: `.omx/context/autopilot-task-20260720T081206Z.md`
- Final ambiguity: 0.15 (threshold 0.20)
- Pressure pass: completed; the initial TypeScript-behavior option was explicitly rejected and the scope was pressure-tested against 149 `Form.*` and 29 `DATAMANAGER.*` names.

## Round 1 — Decision boundary

**Question:** Must XMF Lua execute unchanged, or may selected screen behavior be rewritten in TypeScript?

**Answer:** General Lua compatibility is required. Implementing screen behavior in TypeScript is not the goal.

## Round 2 — Scope

**Question:** May host APIs be implemented incrementally while XMF Lua remains unchanged?

**Answer:** Incremental compatibility.

## Round 3 — Non-goal

**Question:** May Expo Go support be excluded because the existing native binaries require custom native code?

**Answer:** Yes.

## Round 4 — First-milestone verification

**Question:** May `CCS20000`/`CCS20001` use deterministic fixtures first, with authenticated live validation deferred to the next integration milestone?

**Answer:** Yes.

## Interview completion rationale

Intent, outcome, first-slice scope, non-goals, platform constraint, verification boundary, and decision authority are explicit. Remaining questions are implementation and architecture choices suitable for consensus planning rather than product-intent ambiguity.
