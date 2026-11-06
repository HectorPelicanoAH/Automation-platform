# Security and authorization design

Status: planning baseline. Controls below must be implemented and tested in the phase introducing the relevant capability. A localhost application remains a privileged filesystem and process interface.

Implemented Phase 1 controls: loopback Host/Origin checks, HttpOnly cookie plus origin-scoped sessionStorage proof, mutation CSRF, canonical path/symlink checks, fingerprinted execution trust, fixed shell-free runner commands, private state, and attachment-only artifact delivery with checksum verification. A cookie alone cannot authorize API access across localhost ports. See [ADR 0009](decisions/0009-phase-1-runtime-and-boundaries.md) and [acceptance evidence](phase-1-report.md). Subsequent agent/capture controls below remain design requirements for their own phases.

Phase 2 capture controls are documented in [the recorder guide](recording.md). Phase 3 introduces isolated Codex configuration/authentication, a trusted version/hash-pinned executable, disabled environment tools, host-mediated bounded repository reads and denial of unknown provider requests. No global credentials are imported automatically. Gherkin approval binds the exact contract revision and evidence; edits/rejection invalidate dependent pending changes and cancel dependent work. Staged native execution requires a separate explicit trust grant, and managed application requires exact diff approval plus complete passing native evidence. Application journals retain write/rollback failures. These are implemented controls under Phase 3 validation, not a claim that generated code is safe to execute. See [ADR 0011](decisions/0011-reviewed-ai-generation.md) and [current acceptance evidence](phase-3-report.md).

## Trust assumptions

The MVP is single-user on a trusted workstation. A local user chooses trusted automation projects and environments. Application source, imported configs, repository instructions, captured UI, network payloads and generated output remain untrusted data. A hostile local administrator, a compromised OS, and malicious concurrent filesystem mutation are outside the MVP security guarantee. Multi-user hosting is not supported.

Separate privileges:

| Operation                                    | Required authorization                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Read configured source excerpts              | Explicit source registration, read policy and task relevance                                        |
| Index source content                         | Per-source indexing opt-in; excludes still enforced                                                 |
| Write managed target                         | Explicit manual save or reviewed change bound to root, base hashes and exact diff                   |
| Execute imported tests/builds                | User trusts the target/config fingerprint and starts a bounded run in a chosen environment          |
| Write any external application source        | Separate explicit authorization for exact source and change; never implied by phase/target approval |
| Capture browser/microphone                   | Recording session consent, selected URL/origins, browser/OS microphone permission                   |
| Send content to an AI/transcription provider | Configured provider and approved data-sharing policy; preview redactable evidence                   |
| Activate a skill/instruction change          | Explicit activation after evaluation and diff review                                                |
| Destructive external actions                 | Specific approval; excluded from the initial demo                                                   |

These runtime grants are separate from development-phase approval. Imported `AGENTS.md`, skills, Gradle scripts or package scripts cannot grant access. Untrusted project instructions may be displayed for review but are not automatically loaded as platform authority.

## Local server boundary (P1)

- Bind explicitly to loopback, including controlled IPv4/IPv6 behavior. Reject unexpected Host headers and remote exposure configuration. Never use `0.0.0.0` by default.
- Serve UI and API on one origin. Validate Origin for browser mutations and SSE/session access, use CSRF protection and a short-lived local session, and deny wildcard CORS. Bootstrap a session through a one-time local launch token exchanged for an HttpOnly SameSite cookie; do not log it. A GET from another website must not create an authenticated session.
- Require authenticated local session and object-level workspace access for file, artifact, configuration and job endpoints. Apply request schemas, size limits, rate limits and safe error responses. No arbitrary filesystem read, arbitrary URL fetch, arbitrary shell, or generic executable upload endpoint.
- Display authorized source paths only within Settings. UI file navigation uses root IDs and relative paths. Errors do not return environment variables, stack secrets or unrelated directory contents.
- Native report HTML is untrusted. Serve from an isolated origin without platform cookies/privileges or offer a local-file open/download; never inject it into the privileged UI. Preview logs/code as escaped text. Do not auto-fetch remote resources embedded in reports.

## Filesystem gateway (P1)

1. Registration accepts an absolute path intentionally chosen by the user, resolves its real root, records its identity and checks availability. No silent directory creation or checkout.
2. Reject target/platform/source overlap, duplicate aliases of the same real root, nested Git roots and targets located inside sources. Allow distinct source roots; nested/overlapping sources must be deduplicated explicitly or rejected in MVP.
3. For access, decode and normalize relative paths once; reject absolute inputs, `..`, NUL, unsupported URI schemes and alternate separator escapes. Use path-aware containment, not string-prefix checks (`repo-other` is not inside `repo`).
4. Resolve existing components and reject symlink escapes. For writes, validate the existing parent, reject symlink final targets, recheck before commit and use same-directory temporary files. Never follow a link to write outside an approved root.
5. Ignore `.git` internals, secrets and generated/dependency trees in general browsing/indexing. Read required Git metadata through bounded read-only commands, with repository hooks/config execution disabled where applicable. Disable optional Git index writes for read-only operations. Do not run checkout/reset/clean/stash on source roots.
6. Initializing a target checks for an empty, separately selected destination and existing ancestor Git roots. Never run `git init` inside another Git repository. Import does not initialize or replace existing files.
7. Keep a root-specific writer lease and compare content hashes at apply time. A changed root, changed permissions, removed mount or conflicting editor modification invalidates pending changes.

Test path traversal, symlink chains, sibling-prefix paths, spaces, Unicode, non-Git directories, alias roots, removed roots and denied permissions. Document the remaining TOCTOU risk rather than claiming host isolation from path checks.

## Execution trust (P1)

Playwright configuration, npm scripts, Gradle wrappers/build scripts and Karate Java/JavaScript helpers execute code. A worker process is **not** a filesystem or network sandbox. Configured read-only source grants constrain platform tools; they do not magically constrain arbitrary trusted test code.

Show the import/execution trust boundary before the first run and invalidate trust when executable configuration hashes change. Do not automatically install dependencies or run hooks for an imported repo during discovery. Use a fixed executable/argument builder, `shell: false`, canonical working directory, allowlisted selection flags, bounded time/output and a minimal environment. Do not interpolate feature names, tags or paths into shell commands. Avoid shell command strings from the client or agent.

P1 executes only user-trusted automation, with explicit run authorization. If an untrusted project must execute, require a separately designed OS/container sandbox with source mounts read-only, a narrow writable scratch/target overlay, egress controls and resource limits; if those restrictions cannot be enforced, refuse that execution mode. Do not market process supervision as protection from malicious dependencies.

Test environments are selected explicitly; setup and cleanup must stay inside their policy. A runner start does not approve destructive production data mutation. The demo uses isolated synthetic data and no real credentials.

## Capture and artifact privacy (P2 onward)

Minimize capture before persistence. Default to network metadata without headers/body, no password/input values from sensitive fields, bounded DOM excerpts, and redacted URLs. Authorization, Cookie, Set-Cookie, API keys and configured personal fields are suppressed. Allowlisted request/response fields may be added by session policy, never full HAR by default.

DOM, screenshots, audio, video and raw native traces can contain secrets even when textual logs are redacted. Screenshots require masking known sensitive regions; do not persist raw DOM wholesale. Native traces are not guaranteed safely redactable; disable raw trace capture for sensitive recording sessions by default, and require explicit opt-in for restricted local-only traces. Keep a capture gap marker when privacy prevents evidence capture. Redaction is best effort with documented limitations, not a claim that every recording is safe.

Optional video is deferred beyond the minimum P2 recorder. Audio requires explicit opt-in, a persistent recording indicator and immediate stop. Cloud transcription is disabled until configured and consented to; manual text works without it. Never upload screenshots, source, audio or trace archives implicitly.

Keep artifacts in a private data root with restrictive directory/file permissions. Credentials use OS credential storage where available or explicitly configured private local secret files outside Git; database stores references only. Use normal OS disk encryption for at-rest protection in MVP; SQLite is not encrypted by default. Auth state is a secret artifact, scoped and expired separately.

Retention defaults proposed for implementation: logs/screenshots/native reports 14 days; raw audio and optional sensitive traces 7 days; private proposals 30 days; normalized results and curated approved knowledge until user deletion. Show and allow changes before capture. Quotas stop a capture/run gracefully before disk exhaustion. Deletion is bounded to platform-owned store keys, recorded, and never includes repository content. Backup/export must exclude credentials and include a sensitivity manifest.

## Agent boundary (P3 onward)

The orchestrator selects bounded redacted context and tools. A provider gets only task-authorized snapshots, not the user's home or entire repositories. Run Codex with explicit platform-owned configuration, MCP/tools and allowed workspace roots; do not inherit arbitrary imported hooks, skills, shell profiles or global tool connections without review. Keep the agent away from secret stores and platform control credentials.

Generate into a disposable proposal tree containing only selected necessary files. Build an allowlisted manifest, reject path escapes and instructions that add permissions, and record diff/base hashes. Validation executes generated code only within the separately approved execution policy; static validation cannot certify runtime safety. Tests against external systems still require an authorized environment.

A runtime approval accepts one concrete diff; cancellation, expiry, changed bases or changed target invalidate it. The platform checks this independently of provider tool approvals. Maintain read-only sources and deny writes to active skills/platform instructions. Never route a model's “approved” response into a grant. After approval, apply with a journal and report partial failures honestly.

Provider task logs, stdout and native reports pass redaction before normal display/persistence. Track prompt-injection attempts as findings where detectable, but do not rely on an LLM classifier as the primary security boundary.

## Validation ownership

P1: loopback/session/Origin, path gateway, imports, safe argument generation, target conflict handling and artifact isolation. P2: redaction fixtures, permission denial, sensitive input/capture gaps and bounded storage. P3: untrusted instructions cannot change tool scope or bypass diff approval; stale-base approval rejection and cancellation. P6: approval-only skill activation, rollback and retention/health diagnostics. Required cases are in [evaluations](evaluations/README.md); implementation tests are introduced in the owning phase.

## Implemented Phase 2 capture controls

See [ADR 0010](decisions/0010-recorder-evidence-and-privacy.md) and [capture evaluation](evaluations/phase-2-results.md). Fresh Chromium/context, HTTP(S) origin approval with control-origin alias denial, no raw network headers/bodies, query/form suppression, bounded target DOM/ARIA, opt-in masked screenshots, consented local audio and independent retention are operational. The unload beacon backup is intercepted/fulfilled locally and deduplicated; it never grants platform API credentials or filesystem access. Raw audio and arbitrary visible text are not universally redacted. Browser/hostile-page instrumentation is not an OS sandbox. The physical microphone check remains manual; no engine uploads audio for automatic transcription.
