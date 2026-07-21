# Shared runtime contract

## Cross-platform semantics

React Native and Lua observe one Host API, state, event, command, error, lifecycle, and trace model. React Native/TypeScript cannot select Host or control behavior by OS, platform-suffixed runtime module, build flag, or native-module variant. Thin adapters may translate mechanics but cannot change semantic results.

When platform histories disagree, choose the smallest approved shared result: `normalize`, evidence-required `safe-union`, explicit `reject`, or `defer`. Platform code alone never justifies a union. Each decision needs one shared fixture and golden used unchanged by both adapters. Exact decisions and public surface activation live in [`contracts/host-api.json`](../../contracts/host-api.json).

## Semantic reimplementation

Include behavior only when approved unchanged XMF/Lua, engine-independent fixtures, an independent golden, a selected-slice transitive dependency, or an essential safety/resource invariant requires it. Legacy code may raise a question but is not normative and is never copied or translated.

Bug workarounds, platform-history forks, nonessential defensive branches, dead paths, and accidental ordering/coercion default to `exclude` or `defer`. Reaching them fails explicitly. Each candidate records `include|exclude|defer`, approved evidence, rationale, affected platforms, shared resolution, and deterministic test/golden before activation.

## Host boundary

The Host manifest is deny-by-default. An API absent from the public inventory is unsupported. Public additions update this document and the Host manifest before or with implementation, including signatures, coercions, return values, state effects, diagnostics, evidence, and a shared deterministic test. JavaScript cannot answer or re-enter synchronous Lua Host calls.

## Lifecycle and transactions

The production runtime goal will define the serial off-main executor, monotonic revisions, immutable snapshots, ordered commands, staging/commit/rollback, invalidation, close choreography, request tokens, nested send-before behavior, and isolation. Until that goal activates, the public Host inventory remains empty and no production runtime readiness is claimed.

## G002 native harness

Gate 0 embeds the official unmodified Lua 5.1.5 source behind one shared C `create`/`evaluate`/`destroy` core. iOS and Android adapters only translate ABI/module mechanics. The harness opens base/coroutine, table, string, and math explicitly, removes `loadfile`, `package`, `io`, `os`, and `debug`, and replaces `dofile` with an integrity-checked manifest resource loader. Minimal direct C probes for a global helper, `Form`, `DATAMANAGER`, and a control property/method prove the boundary without activating a production Host API.

The harness has a 32 MiB allocator ceiling and 50 ms instruction-hook deadline; either guard destroys the state. It intentionally has no worker, revision, snapshot, queue, staging, token, rollback, close choreography, or multi-runtime coordination. Exact source and build truth is [`native/lua-source-manifest.json`](../../native/lua-source-manifest.json).

## Limits and security

The production runtime must bound allocation, instructions/deadlines, state, queued events, commands, arguments, payloads, diagnostics, and outstanding tokens. It opens only the approved Lua libraries and denies filesystem, process, package, debug, traversal, arbitrary remote/end-user Lua, and unmanifested resources. Diagnostics are bounded and redact values.

Official, unmodified Lua adoption is governed by [`0001-official-lua-5.1.5.md`](../adr/0001-official-lua-5.1.5.md). No project code implements or patches parser, compiler, VM, GC, bytecode, or standard-library internals.
