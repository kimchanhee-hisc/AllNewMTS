# Binding User Steering — Deliberate Open-source Dependencies

Recorded: 2026-07-21 (Asia/Seoul)

Mature open-source dependencies may be used for socket/network communication and other justified areas when the standard library, native platform facilities, and already-adopted dependencies are insufficient.

- Select a dependency only for the active approved slice and demonstrated requirement. Do not add speculative networking, protocol, abstraction, compatibility, or future-platform dependencies.
- Prefer one dependency and one shared cross-platform semantic contract over separate iOS/Android or React Native OS-selected behavior. Platform adapters may handle unavoidable build/ABI mechanics only.
- Before adoption, record the exact version and upstream source, pin it through the repository's existing dependency mechanism, identify its license and required notices, and document why its security history, maintenance status, release cadence, and transitive dependency cost are acceptable.
- Keep integration minimal. Add focused deterministic tests for the behavior and failure boundary the dependency owns, plus integrity/license and cross-platform parity checks appropriate to the active slice. Do not duplicate the dependency's upstream test suite or expand ordinary development into broad regression runs.
- Prefer the standard library, native/existing project facilities, or a smaller dependency when they satisfy the requirement safely. Avoid overlapping libraries, speculative wrappers, and custom protocol/runtime implementations.
- Actual product transport remains deferred from G003. Transport never executes inside a synchronous Lua Host function, never requires JavaScript to answer or re-enter an active Host call, and must be activated later through its own documented contract, limits, security review, and tests.
- Local dependency downloads are allowed only when explicitly authorized and necessary for the active slice. Use the existing package/build mechanism, pinned sources, and the narrowest credential-free read-only retrieval available; do not silently install, update, or download during product/runtime execution or verification.
- Existing prohibitions remain unchanged: no deployment/publication/upload; no remote-state mutation; no CDN write/delete/purge/invalidation/configuration; no FTP/SFTP read or write; no remote credentials or mutation APIs. The separately documented deferred read-only CDN `GET`/`HEAD` exception is not expanded by this policy.

Dependency approval authorizes local use of a bounded implementation component only. It does not authorize network product behavior, remote access, deployment, or a broader milestone claim.
