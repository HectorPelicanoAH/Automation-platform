# ADR 0011: Bounded Codex tools and separately reviewed validation/application

Date: 2026-11-06. Status: implemented within approved Phase 3; final acceptance pending. Extends ADR 0006 without authorizing Phase 4.

## Context

Recording analysis needs semantic reasoning; repository discovery, hashing, scope checks and approval enforcement do not. Generated code executes with workstation privileges, so successful type checks cannot justify automatic execution or writes. The platform must remain usable with AI disabled.

## Decision

Use a provider-neutral task port and Codex app-server over stdio. Pin the tested CLI/protocol to `0.162.0-alpha.2`, including its experimental dynamic-tool fields, and verify the published package/schema on every supported OS. Unsupported binaries fail closed rather than silently switching integration or models. The [official app-server protocol](https://learn.chatgpt.com/docs/app-server) provides the lifecycle and structured-output interface; the generated schemas from the installed pinned binary are the execution contract.

Create a private Codex home with platform-owned configuration. Disable inherited integrations/hooks/plugins, environment access and arbitrary tools. Explicit model/reasoning settings are per workload; no model identifier is hardcoded. A catalog response is not an entitlement test. Runtime credentials are configured separately outside Git and model-readable context. No automatic import of user-global credentials or repository instructions.

The agent sees bounded recording/narration evidence and registered-root references. Two application tools provide capability lookup and bounded current indexed files. Read-only roots, indexing opt-in, include/exclude policy, file hashes, retrieval budgets and cancellation are enforced by host code. The agent receives no source roots or target filesystem access. Unexpected provider tool/approval requests are denied. Source content remains untrusted even when its syntax is valid.

Use TypeScript syntax and official Gherkin parsing for an on-demand incremental SQLite index. Cache facts by file hash/extractor/policy; preserve Git provenance and an independent working-tree fingerprint. Bounded scans yield between files instead of adding an independent indexing service. Unsupported/dynamic syntax is incomplete, not inferred. Revoke cached retrieval after source-policy changes. Return index summaries to the UI and only relevant facts/files to the provider.

Gherkin proposals are private drafts. Review binds exact text, answers, evidence, destination and revision. Generation requires that approval; its plan and full-file diff remain private. Preserve existing Page methods/steps, reject unsupported paths and obvious brittle/unsafe constructs. These deterministic checks are conservative and do not certify arbitrary program safety.

Validation and application are different actions. Prepare a disposable UI overlay from the trusted target plus reviewed changes; dependency links reuse the explicitly trusted target installation. The agent cannot read this overlay. After separate execution trust, the existing native runner typechecks and executes the staged feature. Only complete scenario-linked passing evidence can enable application. Applying still requires exact diff approval and fresh bases. Journal writes and rollback/partial failures; never rerun after a crash automatically. The applied repository remains independently runnable.

## Alternatives

An unrestricted shell agent weakens scope enforcement. Writing generated files straight into the target makes rejection and stale-base handling unsafe. Treating API state as UI proof misses rendering regressions. Adding a second execution engine duplicates native runner behavior. Bundling an authenticated cloud service would break the local/manual workflow.

## Consequences

The pinned alpha/experimental protocol is an explicit compatibility risk; contract tests and live inference evidence are required. AI consumes configured account quota. Raw account secrets remain out of prompts and logs. Reviewed execution is not an OS sandbox: trusted code/dependencies can access workstation permissions. Dependency links do not provide isolation. Large/unsupported contexts require narrowing or manual work. No skill is activated by phase approval; candidates remain outside runtime discovery until separately evaluated and approved.

## Validation and revisit

Validate real inference separately from deterministic provider/protocol fixtures. Retain actual provider usage, retrieval sizes and labeled proxies when usage is unavailable; claim no token savings without a comparator. Exercise ambiguous requirements, reuse, injection/scope denial, policy revocation, stale revisions, cancellation, missing evidence and private diff approval. Prove the generated UI assertions fail against a UI-only defect and pass against normal behavior. Retain the Phase 1–2 three-system matrix. Revisit process/worker limits or richer indexing only with measured need.
