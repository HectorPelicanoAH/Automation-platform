# Phase 4 implementation plan

Status: VALIDATION by the exact human instruction `APPROVE PHASE 4` on 2026-11-06. The owner explicitly authorized beginning with Phase 3 CI outstanding; see [phase status](phase-status.md). Phase 3 stays VALIDATION; Phases 5–6 remain PROPOSED.

## Objective and approved scope

Generate independent, repository-aware Karate API automation from reviewed business contracts. Reuse the existing Phase 1 native runner and Phase 3 proposal/review/application controls. Preserve separate UI and API evidence while supporting explicit API preconditions for UI scenarios.

## Milestones

1. Deterministic, read-only discovery of bounded local OpenAPI documents and the supported Fastify TypeScript route declarations used by the demonstration application. Index endpoints, explicit request/response contracts and source references by repository, revision and file hash. Unsupported dynamic routes or authentication become limitations/questions, not inferred contracts. No remote specification fetching or arbitrary parser execution by default.
2. Extend automation capability extraction to native Karate features, reusable calls, configuration references and supported helpers. Inspect existing authentication/precondition conventions before generating new files. Distinguish extraction facts from inferred relationships.
3. Add explicit execution-target choice to the reviewed generation workflow. Translate canonical business Gherkin into separate Karate DSL proposals; preserve scenario/example identities and require exact contract and diff approval. Extend staging, stale-base validation and journaled application conservatively for supported API files and binding metadata. Do not permit arbitrary Java/Gradle/configuration changes through model output.
4. Validate and execute generated API features using real Karate reports. Store framework-specific observable coverage and source references; surface stale or missing bindings. A passing API run cannot satisfy visible title, amount or subtitle requirements. Hybrid plans describe setup and UI execution separately rather than silently joining independent runner processes.
5. Demonstrate explicit API setup with isolated data, existing helper reuse and concurrent scenario independence. Compare serial UI setup with API setup using the same environment, data intent and final visible assertions; publish sample count, elapsed times and conditions without a general savings claim.
6. Exercise the complete web workflow, missing-contract/auth questions, rejection/cancellation/stale-base controls, deliberate UI regression with a still-correct API and manual AI-disabled execution. Retain native artifacts and independent CLI commands. Update documentation and skill proposals; activation remains separate.

## Decisions and tradeoffs

Keep the modular monolith, SQLite and bounded index. Extend existing generation and execution interfaces instead of creating a second orchestration engine. Begin with explicit OpenAPI JSON and the demo's supported source syntax; YAML support requires a justified pinned parser and safe schema handling. Contract metadata never supplies executable instructions. A preferred revision remains a label, not permission to checkout.

Use Karate's own feature composition and native DSL, not a claim that UI Gherkin is directly executable by Karate. Cache authentication only when environment, identity and lifecycle prove reuse safe; synthetic demonstration credentials must remain outside stored evidence. Setup that mutates a configured external service needs separate concrete authorization. Default demonstrations use only owned disposable local data.

Keep scenario-level coverage explicit. Add outline-row selection only if the pinned native runner can prove exact selection; otherwise reject it clearly without expanding to an entire suite. Preserve existing visible Playwright assertions and independently executable target repositories.

## Measurable acceptance

| ID    | Required evidence                                                                                                                                                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4-01 | Opt-in backend/OpenAPI and Karate discovery records source/revision/hash, reuses unchanged files and enforces bounds/exclusions/symlink/read-only policy; unsupported syntax is visible.                                                                                                       |
| P4-02 | Real provider generation uses endpoint and existing helper evidence for a reviewed two-row promotion contract; unknown endpoint/auth/request details block implementation with explicit questions. Fixtures remain labeled.                                                                    |
| P4-03 | Exact review, separate native-execution trust and diff application work for Karate; rejection, cancellation, malicious content, stale sources/contracts/bases and unsafe file paths leave target files unchanged.                                                                              |
| P4-04 | Generated Karate passes both example rows against the actual local API and runs independently through the target CLI; native failures, steps, identity and artifacts are retained.                                                                                                             |
| P4-05 | At least two scenarios reuse a preparation helper concurrently with unique isolated data and retain independent outcomes; authentication caching is justified or explicitly unused.                                                                                                            |
| P4-06 | Deliberately incorrect UI rendering fails the original Playwright assertions while correct API state passes Karate; the web report accurately separates the observable coverage.                                                                                                               |
| P4-07 | Authorized local API preparation and equivalent serial UI preparation are measured under disclosed comparable conditions, with unchanged final UI assertions and no unmeasured performance claim.                                                                                              |
| P4-08 | Real web generation/target selection/results, manual AI-disabled workflows, deterministic security tests and appropriate type/lint/format/build/native regressions pass. Ubuntu x64/macOS ARM64/Intel validation remains required; outstanding Phase 3 CI is never erased by Phase 4 approval. |

## Dependencies and risks

Existing Karate/Java/Gradle toolchains, scoped source configuration, compatible Codex authentication and actual model entitlement are required for live inference. Phase approval does not authorize credential copying or model-selected tool privileges. Incremental parsing, ambiguous OpenAPI references, unsupported dynamic backend syntax, API side effects, secret leakage, manifest migration, framework-specific row identity and generated executable code need explicit handling and tests.

The current GitHub account billing/spending-limit block prevents final three-system CI. Do not launch repeated predictably blocked jobs, reduce supported systems, change billing or mark checks passing. Entry requires completion of Phase 3 or an explicit owner exception preserving the pending checks. The Phase 4 completion report must state actual results and outstanding obligations, then stop before Phase 5.
