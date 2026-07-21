# Binding User Steering — No Deployment; Read-only CDN Exception

Recorded: 2026-07-21 (Asia/Seoul)

Deployment and remote-state mutation are outside this project. A narrow read-only CDN asset lookup may be supported later.

- HTTP(S) `GET`/`HEAD` against a CDN asset may be allowed as a read-only capability.
- Explicit dependency bootstrap may use lockfile-pinned, credential-free, read-only HTTPS package-registry/CDN `GET` and metadata `HEAD` for `npm ci --ignore-scripts`. It may not publish, upload, configure, or mutate remote state; do not add a vendored npm cache or new package manager.
- Never upload, write, delete, purge, invalidate, configure, deploy, or otherwise mutate CDN/remote state. Do not design mutation APIs or destination credentials.
- FTP and SFTP are prohibited for both reads and writes.
- After dependency bootstrap, Milestone 1 fixtures, product/runtime execution, and story/milestone verification use only local/repository integrity-approved deterministic resources and require no network or credentials. Product CDN lookup is deferred and non-blocking unless a later approved slice requires it.
- “Development Build” means a locally runnable Expo Development Build. Store/device/archive references mean local compile/package verification only; no publication, upload, or deployment.
- Generic parser/renderer proof is source independence against a locally injected unseen fixture after production-code freeze, not a deployment or same-binary delivery claim.
