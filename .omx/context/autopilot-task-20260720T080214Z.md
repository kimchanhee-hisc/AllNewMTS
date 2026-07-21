# Autopilot task seed: AllNewMTS migration strategy

- activation prompt / task seed: `$autopilot 이 프로젝트는 엄청 방대한 작업인데 어떻게 진행하면 좋을까 . 의견 줘 .`
- original task status: activation-prompt
- scope note: this seed captures the Autopilot activation prompt and is not guaranteed to include prior conversation context.
- desired outcome: turn the legacy MTS screen migration into a sequence of independently verifiable milestones, then execute only after requirements and consensus planning gates pass.
- stated solution: use Autopilot to decide how a very large migration should proceed.
- probable intent hypothesis: avoid a big-bang rewrite and establish an autonomous but controlled delivery path.

## Known facts / evidence

- `[from-code][auto-confirmed]` `AllNewMTS` is currently an Expo 57 / React Native 0.86 starter with no migration implementation beyond the default `App.tsx`.
- `[from-code][auto-confirmed]` `README.md` names three goals: parse/render XMF screens, reproduce major layout/behavior, and expose existing native SDKs through Native Modules without reimplementation.
- `[from-code][auto-confirmed]` the source corpus contains 3,218 XMF files (about 73 MB); sampled files are UTF-8 XML with nested controls, layout attributes, data-I/O metadata, and scripts.
- `[from-code][auto-confirmed]` corpus-wide tag evidence shows 46,565 `LABEL`, 6,289 `BUTTON`, 4,785 `IMAGE`, 4,154 `CONTAINER`, 1,429 `LINKFORM`, 960 `CHKBUTTON`, 921 `PANNEL`, 775 `EDIT`, and 570 `TABLE` instances. This is a runtime/control-system migration, not a small XML-to-JSX conversion.
- `[from-code][auto-confirmed]` 1,467 screens contain `DATAIO_INFO`; 3,216 of 3,218 contain `SCRIPT_INFO`, frequently with nontrivial declared lengths. Script policy is therefore a first-class scope decision.
- `[from-code][auto-confirmed]` the corpus exposes dozens of specialized control tags, including account, grid/table, chart, order-book, form-tab/link-form, PDF, webview, calendar, and native-style financial controls.
- `[from-code]` `HS1200P08.xmf_` is a useful first renderer fixture: a 10 KB “관심그룹 추가” popup with only labels, one edit, two buttons, a 6.7 KB script section, and two real `DATAIO_INFO` transactions.
- `[from-code][auto-confirmed]` its apparently simple behavior still calls Lua libraries plus `Form`, control-object, and `DATAMANAGER` APIs for open/return data, shared data, item lookup, dialogs/toasts, mutable control properties, transaction buffers, callbacks, and errors. It is not an isolated four-control screen once behavior is included.
- `[from-code][auto-confirmed]` the legacy runtime embeds Lua 5.1.4 inside `MVigsEngine`; the native Form bridge registers roughly 550 Form API slots plus control and data-manager contracts. Reproducing arbitrary legacy scripts directly in TypeScript would be a separate large migration program.
- `[from-code][auto-confirmed]` Plus's existing `RNFormBridge` does not expose Lua/script loading or event execution. It dynamically invokes methods on an already-active native `FormManager`/`CtlForm` and returns `NO_FORM` when none exists. A new React Native-rendered screen therefore cannot reuse it as a headless script engine without a new native boundary.
- `[from-code]` revised recommendation: use `HS1200P08` first for parser/layout/control/event-contract proof, but make unchanged Lua execution an explicit architecture decision rather than silently including full script parity in the first slice.
- `[from-code]` `HS0000P07.xmf_` is a reasonable later native/security slice because it adds password/keypad behavior and encrypted transport, but using it first would mix renderer uncertainty with security-keypad integration risk.
- `[from-code][auto-confirmed]` `/Users/chanheekim/Dev/Plus` is a 14 GB React Native repository with 631 TypeScript source files plus native iOS/Android submodules.
- `[from-code][auto-confirmed]` Plus already has a tested JavaScript XMF parser, but it extracts only `DATAIO_INFO` transport/TR specifications (`scripts/tr-spec-extractor/parseXmf.mjs`); it is not a general screen renderer.
- `[from-code][auto-confirmed]` the working full-screen interpretation/runtime lives primarily in native `FormFactory` / `FormManager` / control classes on iOS and Android.
- `[from-code]` the dominant technical risk is behavioral parity across control rendering, scripts, data binding, navigation, and native SDK boundaries—not basic XML parsing.

## Constraints and conflicts

- Autopilot must remain in `deep-interview` until scope, non-goals, decision boundaries, and acceptance criteria are explicit; no product implementation is authorized yet.
- `[from-user]` 범용 Lua 호환은 필수이며, 기존 XMF 동작을 화면별 TypeScript로 다시 구현하는 방식은 목표가 아니다.
- `AllNewMTS` explicitly targets Expo, while the reference Plus repository's governing rules explicitly prohibit Expo for Plus. Those Plus rules govern reference-code changes, not automatically this separate target repository, but the architectural boundary must be decided deliberately.
- Security, input validation, native SDK wrapping, and data-loss/error handling cannot be simplified away.
- Prefer the smallest vertical slice that proves the architecture over batch-converting thousands of screens.

## Unknowns / open questions

- Whether the first deliverable is a renderer proof, one production-grade end-to-end screen, or full migration infrastructure.
- Which representative screen/control set defines the first acceptance boundary.
- Whether arbitrary legacy scripts must run unchanged, be translated, or be excluded initially.
- Which platform is the first validation target and which native SDK calls are required in the first slice.
- Explicit non-goals and the decisions Autopilot may make without user approval.

## Likely codebase touchpoints

- Target: `AllNewMTS/App.tsx`, future parser/runtime/renderer modules, Expo native-module configuration, fixture/tests.
- References: `Plus/scripts/tr-spec-extractor/`, `Plus/ios/ExtLib/SmartCoreLib/Classes/Form/`, `Plus/android/Core/mVigsCoreLib/.../form/`, and the XMF corpus under `mts_screen/.../scr_xmf`.

## Preflight

- Applicable target `AGENTS.md`: none found in `AllNewMTS`.
- Reference rules inspected: `Plus/AGENTS.md`, `Plus/docs/architecture/system-architecture.md`, `Plus/docs/guides/implementation/README.md`.
- Prompt-safe initial-context summary: not needed.
