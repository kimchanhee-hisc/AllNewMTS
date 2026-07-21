# ADR 0001: Embed official Lua 5.1.5

## Status

Accepted for G002; implementation is not active in G001A.

## Decision

Embed the official, unmodified Lua 5.1.5 source archive from `https://www.lua.org/ftp/lua-5.1.5.tar.gz`, SHA-256 `2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333`. Wrap its public C API in one shared native core with mechanics-only iOS and Android adapters.

Do not implement or patch the parser, compiler, VM, GC, bytecode, standard-library internals, or `luaconf.h`. Exclude standalone CLI/compiler sources from the library target and prove one Lua symbol provider. Open only the explicit sandbox allowlist; do not call `luaL_openlibs`.

## Consequences

- General Lua 5.1 source semantics remain compatible without translating Lua into TypeScript.
- G002 must vendor and verify the archive, license, inventory, compiled sources, source hash, and zero upstream-core diff before runtime work.
- Builds remain offline after explicit dependency/bootstrap acquisition.
- MVigsEngine and alternative Lua providers are neither linked nor used as implementation or evidence.
- Interpreter selection reopens only if the pinned core cannot compile or fails Lua 5.1 conformance after wrapper/build defects are ruled out.
