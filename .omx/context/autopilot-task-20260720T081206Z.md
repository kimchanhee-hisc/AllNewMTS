# Autopilot context: AllNewMTS XMF/Lua migration

- activation prompt: `$autopilot 이 프로젝트는 엄청 방대한 작업인데 어떻게 진행하면 좋을까 . 의견 줘 .`
- original task status: activation-prompt
- prior detailed evidence: `.omx/context/autopilot-task-20260720T080214Z.md`
- desired outcome: migrate XMF-defined screens into Expo/React Native without rewriting each screen's behavior in TypeScript.

## Settled user decisions

- `[from-user]` 범용 Lua 호환은 필수다.
- `[from-user]` 화면별 동작을 TypeScript로 다시 구현하는 방식은 목표가 아니다.
- `[from-user]` Lua 원문은 유지하되 호스트 API는 대표 화면부터 점진적으로 호환 범위를 넓힌다.
- `[from-user]` Expo Go 지원은 비목표다. Custom native code가 포함된 Expo Development Build와 실제 배포 빌드를 지원한다.
- `[from-user][binding correction]` MVigsEngine은 전혀 재사용하지 않는다. 제거 자체가 목표다.
- `[from-user][binding correction]` Lua 인터프리터를 직접 구현하지 않는다. `react-native-lua` 같은 기존 구현을 채택하거나 iOS/Android에서 기존 Lua 라이브러리를 얇게 래핑한다.

## Verified codebase facts

- `[from-code][auto-confirmed]` target is currently an Expo 57 / React Native 0.86 starter.
- `[from-code][auto-confirmed]` corpus has 3,218 XMF files (~73 MB); 3,216 contain `SCRIPT_INFO`, and 1,467 contain `DATAIO_INFO`.
- `[from-code][auto-confirmed]` scripts target embedded Lua 5.1.4 and interact with Form, control-object, and DATAMANAGER host APIs.
- `[from-code][auto-confirmed]` iOS ships `libMVigsEngine.a` plus Lua/API headers; Android ships `mVigsEngine` AAR binaries.
- `[from-code][auto-confirmed]` the existing React Native `RNFormBridge` does not expose Lua loading/event execution and requires an already-active native `FormManager`; it is not a headless Lua bridge.
- `[from-code][auto-confirmed]` corpus-wide static usage contains 149 distinct `Form.*` names and 29 distinct `DATAMANAGER.*` names (including a few apparent typo/property forms); implementing all host APIs before any milestone would create a very wide first gate.
- `[from-code][auto-confirmed]` `HS1200P08` exercises only 11 distinct Form/DATAMANAGER calls: four data-buffer/transaction calls and seven form/runtime calls. It can prove unchanged Lua execution and the host-call bridge without pretending the entire API surface is already complete.
- `[superseded]` the earlier inference that MVigsEngine should be wrapped is invalidated by the user's explicit prohibition.
- `[from-research][auto-confirmed]` `swittk/react-native-lua` commit `3e474584` (2022-08-20) embeds Lua 5.4.4, used RN 0.64.3 development dependencies, documents broken Android async execution, and exposes no host-function registration in its public TypeScript API. It is a reference/candidate, not a drop-in for Expo 57/RN 0.86 and Lua 5.1.
- `[from-primary-docs]` official Lua 5.1 documentation defines Lua as an embeddable C library whose host registers C functions. Lua 5.1.5 is the last 5.1 patch release. Official archive SHA-256: `2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333`.
- `[from-research]` Expo Go cannot load arbitrary custom native code. Reusing the iOS static library and Android AAR therefore requires an Expo development build/custom native module boundary; this remains an Expo application but not an Expo Go-only workflow (official Expo development-build documentation, verified 2026-07-20).
- `[from-code][auto-confirmed]` `libMVigsEngine.a` is arm64 iOS-device code (`LC_BUILD_VERSION platform 2`) with no simulator slice; initial iOS runtime verification must use a physical device unless a simulator-compatible binary is obtained.
- `[from-code][auto-confirmed]` Android `mVigsEngine-release.aar` includes arm64-v8a, armeabi-v7a, legacy armeabi, and x86_64 native libraries, so Android emulator and physical-device verification are both feasible.
- `[from-code][auto-confirmed]` Plus already contains deterministic `CCS20000`/`CCS20001` service tests with mocked outputs, generated native QRY specs, and parser/serializer round-trip tests. These are reusable evidence patterns for an offline first milestone.
- `[from-code][auto-confirmed]` Plus documentation also records prior successful authenticated `CCS20000`/`CCS20001` responses on an iPhone physical device, including packet decryption. Live connectivity is therefore a later integration revalidation task, not an unknown feasibility prerequisite for the Lua-runtime proof.

## Unresolved boundaries

- Whether first-milestone acceptance may cover an incrementally expanding host-API subset while preserving unchanged Lua, or must require all legacy host APIs at once.
- Exact non-goals, first platform, and objective compatibility metrics.
- Exact packaging of pinned upstream Lua 5.1.5 inside a local Expo module.
- Whether `react-native-lua` contributes reusable wrapper/build ideas without becoming a dependency.

## Constraints

- Remain in deep-interview until scope, non-goals, decision boundaries, and acceptance criteria are explicit.
- No implementation is authorized during deep-interview.
- Prompt-safe initial-context summary: not needed.
