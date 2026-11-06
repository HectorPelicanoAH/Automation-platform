# Phase 3 report

PHASE: 3 — AI-assisted UI generation

STATUS: IN_PROGRESS. This is an interim report. Phase 4 is unapproved.

## IMPLEMENTED

Bounded opt-in incremental syntax/Gherkin index, source-policy revocation and freshness checks; provider-neutral tasks and pinned Codex app-server adapter; isolated configuration, structured outputs, scoped tools, progress/history/cancellation and usage/proxy visibility. Private Gherkin proposals require exact review before implementation; staged code includes reuse plans and diffs. Separate execution trust uses the existing native runner against a disposable UI overlay. Exact validated diff application checks bases and retains a journal. Working Generate UI preserves manual provider-disabled workflows.

## ARCHITECTURAL DECISIONS

[ADR 0011](decisions/0011-reviewed-ai-generation.md): host-owned scope/approval, no unrestricted agent environment, file-hash/policy caches, conservative generation guards, separate code execution and managed application. Static checks are not execution safety guarantees. No Phase 4 API generation, Phase 5 repair or Phase 6 activation/evolution engine.

## VALIDATION

Local typecheck/lint/build and deterministic suite have passed during implementation. The browser generation case passed with actual headed recording, a declared deterministic provider fixture, negative/positive native Playwright validation and independent target execution. The official installable Codex CLI passed isolated metadata/schema checks locally without authentication or inference. These do not prove live model generation.

Required remaining evidence: final current-revision checks, complete Ubuntu/macOS ARM64/Intel matrix, authenticated real inference on synthetic promotion evidence, ambiguous-requirement behavior and relevant skill behavioral evaluations. Authentication choice was requested asynchronously; no global credentials have been copied or sent. Do not interpret pending input, fixture outputs or catalog availability as successful live inference.

Corrected local failures: the initial Generate view consumed the recordings response with the wrong shape; the browser fixture now uses the real response envelope. Accessible combobox selection uses the actual role/name. These failures are not counted as passing runs.

## KNOWLEDGE

[Operating guide](generation.md), approved phase plan, ADR 0011 and two versioned inactive skill candidates. Candidate format validation passed with skill-creator's validator and a temporary PyYAML 6.0.2 dependency; behavioral results remain pending. No active skills or AGENTS rules changed. No token savings claimed.

## QUALITY

Pinned alpha/experimental protocol, supported-syntax limits, narrow context budgets, semantic ambiguity and host-privileged reviewed execution remain explicit risks. Existing target dependencies are reused through a private validation link, which is not isolation. Arbitrary secrets cannot be universally identified. Skill candidates are not active.

## NEXT PHASE

Phase 4 remains PROPOSED: API discovery, Karate generation, reusable preconditions and explicit UI/API coverage mapping. It cannot begin before Phase 3 completion and `APPROVE PHASE 4`.

## APPROVAL REQUIRED

Finish the already approved Phase 3 and its remaining validation first. Authentication input is still pending. No Phase 4 authorization is requested by this interim report.
