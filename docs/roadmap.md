# Development roadmap and approval workflow

Status authority: [phase-status.md](phase-status.md). Phases 1–2 are completed; Phase 3 is approved and in validation; Phase 4 is in validation under the explicit owner sequencing exception; Phases 5–6 remain `PROPOSED`. Plans are detailed enough to approve independently; later scope may be refined before its approval, with changes made visible.

## Phase lifecycle

Allowed states: `PROPOSED`, `APPROVED`, `IN_PROGRESS`, `VALIDATION`, `COMPLETED`, `BLOCKED`.

```text
PROPOSED -- exact human APPROVE PHASE N --> APPROVED
APPROVED --> IN_PROGRESS --> VALIDATION --> COMPLETED --> STOP
IN_PROGRESS or VALIDATION --> BLOCKED --> previous active state after resolution
VALIDATION --> IN_PROGRESS when checks require corrections within approved scope
```

Only explicit human authorization changes `PROPOSED` to `APPROVED`. A blocked phase stays incomplete; it never becomes completed to unblock the next phase. Record why, missing functionality, failed checks and resolution requirements. Do not begin a later phase to bypass a blocker. Material scope expansion requires a revised proposal and explicit approval; routine choices inside the approved scope do not require repeated permission.

For every phase: present objective, scope, decisions/tradeoffs, measurable acceptance, dependencies and risks before work; implement only after approval; run applicable validation; demonstrate real behavior; update documentation and relevant skills; record a completion report; then stop. Evidence must include actual commands, environment/toolchain, outcomes and artifact references. A report with missing required validation is `BLOCKED` or remains `VALIDATION`, not `COMPLETED`.

Phase approval does not authorize external source changes, applying AI proposals, production mutation or skill activation. Runtime review controls remain separate. The report format is [below](#completion-report-format).

## Phase 0 — Architecture and planning

Objective: establish a coherent, reviewable design and independently verifiable roadmap.

Scope: documentation, ADRs, domain model, security, recorder feasibility, quality/evaluation policy, risks, approval rules and a detailed Phase 1 proposal. No application, dependencies, scaffold, database migration or generated automation.

Decisions: modular monolith and supervised workers; separate source/automation roots; canonical business contract with explicit framework bindings; staged agent diffs; controlled knowledge and skill evolution. Tradeoffs and alternatives are in [ADRs](decisions/README.md).

Acceptance: all eleven requested architecture topics covered; complete docs navigation and relative links; every future phase proposed and unapproved; explicit supported-system targets and compatibility gates; no runtime claims; no app files/dependency installs. [Phase 0 report](phase-0-report.md) records checks.

Dependencies/risks: primary-source research; unproven recorder integration and runner/version compatibility remain risks, not claimed prototypes. Documentation and initial evaluation specifications are the deliverable. Completion requires stopping for `APPROVE PHASE 1`.

## Phase 1 — Platform foundation

Objective: manual functional testing through a real local web app with two independent runners, without AI.

Scope: the [detailed proposal](phase-1-plan.md) is the approval boundary. Deliver local web/backend, SQLite persistence, Settings with multiple read-only source paths, external target initialize/import, minimum scenario text editor/parser, real promotion demo, independently runnable Playwright-BDD and Karate starters, execution supervision, basic normalized/native results and readiness diagnostics. Browse authorized target files. No recording, AI, broad source indexing or autonomous improvements.

Decisions/tradeoffs: frontend/backend same origin; one run by default; fixed runner commands; trusted imported code; manual hand-authored demo bindings rather than a generic translator. Source configuration is available before repository intelligence.

Acceptance: all P1-01 through P1-12 criteria in the proposal pass, including two example rows in each real runner, UI-visible assertions separate from API fields, deliberate failure preserved, cancellation, restart persistence, path/session denial checks and independent CLI execution. Document exact pinned toolchain and setup on the supported validation matrix.

Dependencies/risks: Node/pnpm, fixed SQLite engine, Java/Gradle, Chromium and initial dependency downloads; process cleanup, native driver packaging and report mapping. Update setup/architecture/security docs and curated target conventions; create skills only if actually useful for delivered behavior. Stop for `APPROVE PHASE 2`.

## Phase 2 — Recorder

Objective: inspect a persisted real demonstration with synchronized actions, evidence and narration.

Scope: public-API headed Chromium capture; navigation, ordinary interactions, DOM/ARIA excerpts, locator candidates and uniqueness evidence; privacy-limited network events/screenshots; permission-gated microphone chunks; manual time-aligned transcript editing; configurable transcription boundary; recording timeline, stop/cancel and partial-session recovery. Automatic transcription is optional until a provider is explicitly configured; manual fallback is mandatory. Optional video is excluded from the minimum phase.

Decisions/tradeoffs: observer script supplements Playwright; native traces are optional sensitive artifacts, not the semantic recorder. Platform-tab audio avoids injecting microphone privileges into the test app. Clock uncertainty is visible. See [recording design](recording.md).

Acceptance:

- Capture the promotion demo with genuine click/fill/select/navigation evidence and frame/page IDs; reload after restart with source-linked screenshots/ARIA evidence.
- Align a marker within 500 ms over 5 minutes under the local validation setup; report calibration and transcript precision honestly.
- Show a microphone-denied session working with manual narration and a partial/lost chunk as incomplete.
- Sensitive-field and configured network-secret fixtures are absent from ordinary persisted/AI-ready payloads; opt-in raw traces remain restricted.
- Demonstrate stop/cancel cleanup and bounded upload/disk limits. Unsupported interactions report gaps without invented actions.

Dependencies/risks: P1, browser/OS microphone permissions, public capture APIs, cross-origin frames, background throttling and audio encoding. Record feasibility evidence before completing timeline UX. Update capture policy, troubleshooting and evidence analysis guidance; no scenario generation. Stop for `APPROVE PHASE 3`.

## Phase 3 — AI-assisted UI generation

Objective: turn evidence into a reviewed functional contract and validated reusable UI automation.

Scope: Codex app-server adapter with streaming/tool visibility/cancel/history/usage; bounded task retrieval; supported frontend and automation capability extraction; event/narration analysis; scenario/outline discovery; Gherkin proposal/review; UI target selection; reuse lookup and plan; staged Pages/components/steps/fixtures changes; validation and diff approval before target application. Basic structured index suffices; no full graph or general maintenance agent.

Decisions/tradeoffs: deterministic parsing/lookup before model work; explicit observed/narrated/inferred labels; no automatic rule invention; semantic Gherkin review precedes code generation. Full source snapshot not exposed to the model.

Acceptance:

- From a real P2 recording produce the two-row promotion outline with evidence links; unsupported expectations remain questions until confirmed.
- User edits and approves Gherkin before implementation; decline leaves target files unchanged.
- Reuse an existing Page/component and step where applicable; a versioned fixture proves no redundant duplicate was added.
- Generated Playwright-BDD runs the actual UI with scoped unique locators, visible title/discount/subtitle assertions and no forced actions/delays.
- Prompt-injection, stale-base and external-write evaluation cases pass; cancelled tasks stop tool activity and retain an honest partial state.
- Disabling provider configuration still permits manual editing, running and results. Record actual provider usage or labeled estimates.

Dependencies/risks: P2 evidence quality, configured Codex authentication, protocol/version stability, source extractor limits and execution security. Introduce relevant static skills with evaluation cases and explicit activation; no self-evolution. Stop for `APPROVE PHASE 4`.

## Phase 4 — API generation and cross-layer intelligence

Objective: generate independent API coverage and reusable setup without overstating UI/API equivalence.

Scope: OpenAPI and supported backend source discovery, repository-aware Karate generation, auth/schema/feature/helper reuse, API data preparation, explicit UI/API coverage mapping, hybrid plans and normalized reporting. Existing P1 Karate execution is reused. Improve selection including outline rows only when the runner proves support.

Decisions/tradeoffs: API contracts use a separate adapter and native DSL. API setup may accelerate UI tests but never replaces their visible assertions. Cache auth only when scope/lifecycle is safe.

Acceptance:

- Generate and independently run the two-row promotion API contract; preserve traceability to canonical behavior and source endpoint evidence.
- Demonstrate existing helper reuse and parallel-safe unique data in at least two concurrent scenarios.
- Show a deliberately incorrect UI render failing Playwright while correct API state still passes Karate, with accurate separate coverage.
- Demonstrate an authorized API precondition and compare equivalent serial UI setup versus API setup on the same environment; publish measurements without claiming unmeasured savings.
- Unsupported endpoint/auth information blocks generation with a question; no invented payload/contracts or hidden entire-suite fallback.

Dependencies/risks: P3, inspectable backend/API contracts, environment access, auth leakage and mutable setup state. Update implementation skills, contracts and source discovery coverage. This completes the functional AI MVP only when all earlier acceptance remains valid. Stop for `APPROVE PHASE 5`.

## Phase 5 — Intelligent maintenance

Objective: diagnose failures and propose minimal justified repairs with evidence.

Scope: versioned capability edges; relevant recent-change lookup; product/test/environment/data failure classification; approved application investigation; repair proposals, code diff review and targeted validation. The intelligence index grows from P3/P4 rather than being rebuilt as a graph service.

Decisions/tradeoffs: prioritize deterministic failure evidence; uncertain classifications stay uncertain. A product regression produces a finding, not assertion weakening. Validation in a proposal environment precedes approval/application.

Acceptance:

- Versioned cases distinguish at least a locator defect, product regression, unavailable environment and invalid setup data, with source-linked evidence and explicit uncertainty where needed.
- Locator defect repair preserves the original business assertion, passes impacted behavior and reuses existing abstractions.
- Product regression remains failing with an actionable explanation; no retries, force clicks or weakened assertion used to mask it.
- Reject/cancel/stale-base paths leave the target unchanged; approved diff application is recorded and reversible.
- Source revision invalidation and graph queries answer step→Page reuse and scenario→endpoint dependencies for the supported dataset.

Dependencies/risks: reliable artifacts, supported Git metadata, safe environment access, distinguishing real product intent from stale tests. Curate reusable diagnostic knowledge; one-off incidents do not automatically become skills. Stop for `APPROVE PHASE 6`.

## Phase 6 — Self-improving knowledge and autohealth

Objective: deliver the full controlled improvement and health product, with measured quality and rollback.

Scope: discovery classification, incremental concise docs, stale/duplicate knowledge detection, versioned skill improvement proposals, evaluation comparisons, explicit activation and rollback; metrics/retrieval monitoring; full Knowledge & Skills and Autohealth sections; deterministic on-demand and configurable scheduled checks across platform, automation and knowledge. Notifications/schedules run locally while the service is available; do not imply OS wake scheduling without implementation.

Decisions/tradeoffs: low-cost deterministic rules first; false-positive rates are measured on fixtures; model analysis is optional enrichment. No unattended source/behavior/instruction modification. Unvalidated skill proposals live outside discovery paths.

Acceptance:

- A real workflow yields a sourced discovery; meaningful changes update one concise record, unchanged reprocessing creates no duplicates, and changed source hashes mark stale knowledge.
- One approved skill improvement passes the versioned dataset, compares against active baseline, activates only on explicit approval, and rolls back to the exact prior bundle hash.
- Unvalidated/rejected proposal cannot become active; contradictory/oversized/obsolete instructions surface with evidence.
- Health fixtures produce severity, stable fingerprint, evidence and recommended action for missing dependencies, broken Gherkin/configuration, stale index, missing artifacts, duplicate/unused candidates and slow setup. Show noisy heuristics as candidates, not proven defects.
- On-demand and scheduled checks run without modifying repositories; destructive fixes require separate review.
- Publish retrieval bytes, provider tokens or labeled proxies, repeated searches, reuse/generation/maintenance rates using defined denominators and comparable datasets. No savings claim without baseline.

Dependencies/risks: P1–P5 evidence, evaluation validity, skill overfitting, privacy and noisy unused-code/flakiness heuristics. All core required sections and controlled improvement now work. Stop after completion; any further work needs a new approved phase proposal.

## Product exit criteria

The **foundation milestone (P1)** is useful without AI: register sources/target, edit Gherkin, execute both runners and inspect genuine results. The **functional AI MVP (through P4)** adds record→reviewed Gherkin→approved UI/API implementation→execution, with manual fallback and curated skills. The **complete specified product (through P6)** additionally requires maintenance, evaluated reversible knowledge evolution and full health monitoring. P6 is a core release requirement, not an optional enhancement.

All releases require independent target CLIs, source read-only enforcement, local-only server policy, pinned setup, reproducible demo evidence, no fabricated outcomes and all prior acceptance checks applicable to touched functionality. The full demo uses Spanish and Portuguese promotion examples with separate UI and API assertions.

## Planning estimate

Rough engineering effort for one experienced developer: P1 3–5 weeks, P2 3–5, P3 4–6, P4 3–5, P5 3–5, P6 4–6 (20–32 engineering weeks total). This is an unmeasured planning range, not a delivery commitment or claim of AI acceleration. Public recorder constraints, imported frameworks and cross-OS validation can increase it. Re-estimate each phase after the preceding evidence; split a proposal into smaller independently approved phases if its risk warrants it, without starting unapproved work.

## Completion report format

```text
PHASE:
STATUS:
IMPLEMENTED: verified functionality (or planning artifacts in Phase 0)
ARCHITECTURAL DECISIONS: decisions and rationale
VALIDATION: actual commands, passing/failing checks, missing validation, evidence
KNOWLEDGE: docs/skills changed and reusable capabilities discovered
QUALITY: debt, risks and performance considerations
NEXT PHASE: objectives, deliverables, dependencies and acceptance
APPROVAL REQUIRED: exact APPROVE PHASE N instruction
```

File reports in `docs/`, link them from status, and stop execution. Completion reports never grant approval.
