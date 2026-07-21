# Binding User Steering — Cross-platform Generalization

Recorded: 2026-07-21 (Asia/Seoul)

When legacy iOS and Android implementations differ, resolve the difference into a more general shared semantic contract rather than reproduce either platform-specific behavior in React Native.

Binding consequences:
- React Native/TypeScript product/runtime code must not branch behavior by OS (`Platform.OS`, platform-selected screen logic, or equivalent Host-behavior forks).
- React Native observes one cross-platform Host API, state, command, event, error, and trace contract.
- Platform differences are absorbed only below that contract in thin native build/ABI/system adapters and must not leak as application behavior.
- The shared native/runtime core owns behavior; iOS/Android glue owns unavoidable mechanics only.
- Conflicting legacy behavior becomes a generalized/superset capability model, never a chosen-platform or per-screen branch.
- Every resolved difference requires identical iOS/Android conformance fixtures and golden semantics.
- Existing constraints remain: unchanged general Lua/XMF, incremental Host APIs, no MVigsEngine use/evidence, no authored interpreter, no per-screen behavior rewrite, Development/store builds.

Downstream application: G003 parity contract/tests; G004 no RN OS behavior branches with static enforcement; G005/G006 identical semantic traces on both platforms. Current G001 audit scope is unchanged.
