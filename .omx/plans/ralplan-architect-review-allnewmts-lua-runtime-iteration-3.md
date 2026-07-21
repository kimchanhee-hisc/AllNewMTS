# Architecture Review — Iteration 3

- Native subagent task: `/root/omx_role_intent_6c8ce64644074538851dff03fede470c`
- Adapted role correlation: `6c8ce64644074538851dff03fede470c`
- Reviewed at: `2026-07-20T09:13:00Z`

## Findings

1. **P0 sandbox:** never call `luaL_openlibs`; explicitly open only allowed libraries, replace `dofile`, remove `loadfile`, and keep package/io/os/debug absent. Use a hashed logical-path manifest with traversal/NUL rejection and 5.1-compatible return/error semantics.
2. **P0 atomic errors:** stage Host state/commands and commit only after successful protected completion. Discard staged effects on error. Because generic Lua-global rollback is not thin, invalidate the Lua state after any uncaught error/timeout and emit the error revision from the last committed state.
3. **P0 isolation/resources:** run per-runtime workers off JS/UI/main queues; bound all native callbacks; use `lua_pcall` with one nested-call budget; add a public custom allocator and memory ceiling; keep longjmp within C-safe frames.
4. **P1 lifecycle:** freeze OPEN→CLOSING→CLOSED/INVALID choreography, close-handler ordering, request tokens, duplicate/late rejection, cancellation, and nested send-before propagation.
5. **P1 build provenance:** exclude `lua.c`, `luac.c`, `print.c`; leave `luaconf.h` unchanged; vendor verified sources rather than fetching during Gradle/Pods; record compiled source list.
6. **P1 stop rule:** repair wrapper/build/Host defects first; change interpreter only when the upstream core itself fails build or 5.1 conformance.
7. **P2 oracle independence:** freeze traces before implementation and assert partial mutation/command discard plus runtime invalidation.

## Thin-embedding judgment

Compiling official, hash-pinned, zero-diff Lua 5.1.5 and registering Host functions through its public C API is adoption/embedding, not interpreter implementation, while VM/core sources remain immutable.

## Verdict

**ITERATE**
