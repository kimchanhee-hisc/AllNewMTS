# Binding User Steering — External XMF/XMS Rendering Contract

Recorded: 2026-07-21 (Asia/Seoul)

XMF/XMS are external-developer-authored input contracts. The product must parse them generically and render them through shared React Native components without per-screen product changes.

- Migrate the semantic interface previously offered by iOS/Android bridges and controls—not native UI implementation code.
- Extract control schema, capability, event, property, layout, and fallback semantics into a shared RN control registry/renderer (for example, progressively covering types such as `CtlButton` and `CtlImage`).
- A conforming packaged external XMF/XMS screen added after app release must run without screen-specific code changes when it uses supported manifest-declared semantics.
- React Native/TypeScript/native production behavior must not branch on screen ID, control ID, transaction ID, asset identity, layout signature, or OS.
- Unknown/unsupported tags, properties, events, or capability combinations follow a documented bounded diagnostic/fallback policy; they never silently invoke platform-specific behavior.
- The full control inventory grows through the progressive compatibility ledger. The first milestone implements only the approved slice and explicitly reports unsupported/deferred capabilities.
- Original XMF/Lua bytes stay unchanged, both platforms use the same semantic fixtures/goldens, and MVigsEngine material remains prohibited.

