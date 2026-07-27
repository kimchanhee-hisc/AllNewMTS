# ADR 0001: Embed official Lua 5.1.5

## Status

Accepted and implemented for the native verification harness and production runtime.

## Decision

Embed the official, unmodified Lua 5.1.5 source archive from `https://www.lua.org/ftp/lua-5.1.5.tar.gz`, SHA-256 `2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333`. Wrap its public C API in one shared native core with mechanics-only iOS and Android adapters.

Do not implement or patch the parser, compiler, VM, GC, bytecode, standard-library internals, or `luaconf.h`. Exclude standalone CLI/compiler sources from the library target and prove one Lua symbol provider. Open only the explicit sandbox allowlist; do not call `luaL_openlibs`.

The immutable archive, extracted-file inventory, compiled-source list, license/hash evidence, allowlist, limits, resources, and shared adapter golden are owned by [`native/lua-source-manifest.json`](../../native/lua-source-manifest.json). The verification module exports only synchronous `create`, `evaluate`, and `destroy`. Its direct C callback probes are test-harness boundaries, not public production Host APIs.

## Consequences

- General Lua 5.1 source semantics remain compatible without translating Lua into TypeScript.
- Verification must prove the archive, license, inventory, compiled sources, source hash, and zero upstream-core diff.
- Manifest-owned resource bytes, logical paths, hashes, and the adapter fixture/golden generate the compiled resource table and JS Development Build fixture; hand-edited drift fails closed.
- Apple evidence evaluates the local Podspec and compiles its exact graph, including the mechanics adapter, before the actual Expo Development Build is packaged and executed.
- Dependency acquisition follows the pinned package-manager inputs; product CDN access remains prohibited.
- MVigsEngine and alternative Lua providers are neither linked nor used as implementation or evidence.
- Allocation beyond 32 MiB or the 50 ms harness deadline destroys the Lua state. These harness limits are separate from the production revision/rollback/lifecycle protocol.
- Interpreter selection reopens only if the pinned core cannot compile or fails Lua 5.1 conformance after wrapper/build defects are ruled out.
