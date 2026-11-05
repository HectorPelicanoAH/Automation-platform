# Phase 1 completion report

PHASE: 1 — Platform foundation

STATUS: VALIDATION. Local acceptance passed; required multi-system CI is pending. This is an interim evidence record, not a completion claim.

## IMPLEMENTED

React/Fastify workbench; private SQLite state; read-only source registration and Git/manifest detection; separate target initialize/import; manual Gherkin drafts/validation/hash-safe save; target file browsing; actual promotion UI/API; independent Playwright-BDD and Gradle/Karate starters; typed selection, persisted execution queue, cancellation, normalized/native results and artifact download; on-demand readiness; configurable startup artifact retention; MIT license selected by owner.

Recording, microphone, transcription, AI generation, repair and skill evolution remain unimplemented and unapproved.

## ARCHITECTURAL DECISIONS

See [implementation ADR](decisions/0009-phase-1-runtime-and-boundaries.md) for actual versions and justified refinements. Host-bound workers are trusted-code execution, not sandboxes. A separate session proof protects against localhost cross-port cookie reuse. Canonical changes invalidate API bindings; row selection/attribution is not fabricated.

## VALIDATION

- Executed independent UI CLI: two actual Playwright-BDD example instances passed against the demo.
- Executed independent Gradle CLI: two actual Karate API example instances passed; lock and checksum verification generated.
- Executed local SQLite probe: Node 24.22.2, embedded engine 3.53.4.
- Nine automated domain/storage/HTTP/security/demo tests passed after resolving initial integration failures.
- Full browser journey passed locally: both frameworks by suite/feature/scenario/tag, UI-only failure with correct API, restoration, missing/malformed native reports, idempotency, both process-group cancellations and restart reconciliation. Native artifacts were retained.
- Local typecheck, lint and formatting passed. The independent UI project also passed typecheck.
- Audit initially found one moderate transitive minimatch advisory; pinned corrected 11.0.4, repeated audit reports zero known advisories.
- Required cross-platform CI is pending. Do not treat configured jobs as passing.

Performance evidence on macOS 15.7.3 Intel Core i3-1000NG4 1.10 GHz, Node 24.22.2: real process startup to ready with built web assets was 4199 ms for fresh data and 2226 ms for existing data (one sample each, not a universal cold-boot benchmark). An earlier full workflow measured metadata p95 16.2 ms across 188 requests during executions. Final workflow/CI artifacts retain their own exact samples; no generic speedup is claimed.

Earlier failures exposed directory copy semantics, nested worker environment inheritance, explicit BDD fixture discovery and accessible dropdown naming. Fixes preserve business assertions; no retries/forced clicks/delays hide failures. Final commands/results will be recorded after the checks finish.

## KNOWLEDGE

Updated README and [local setup](local-development.md), independent target READMEs, [runner conventions](knowledge/runner-conventions.md), notices and runtime ADR. No active product skills or autonomous knowledge engine were created. No token/cost savings claimed.

## QUALITY

Known initial limits: compatible starter-style imports only; literal tags; no row filter; nullable native row attribution; no arbitrary untrusted-code sandbox; source index preferences stored but no indexing; retention applied at startup; no native Windows worker; OS support needs actual matrix evidence. See [quality standards](quality-standards.md) and [security design](security.md).

## NEXT PHASE

Phase 2 recorder remains PROPOSED. It requires a completed Phase 1 report and a new explicit approval. This interim report does not request or grant Phase 2 authorization.

## APPROVAL REQUIRED

No new approval is needed to finish the already authorized Phase 1 scope. Do not start Phase 2. Final report/status will distinguish completion from any remaining required evidence.
