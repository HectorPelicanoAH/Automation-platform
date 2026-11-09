# Phase 5 report

PHASE: 5 — Intelligent maintenance

STATUS: VALIDATION. Implementation and local acceptance are delivered. Current three-system CI is NOT_RUN; the supported matrix has not been reduced. Phases 3 and 4 remain VALIDATION under their retained obligations. Owner approval and the explicit sequencing exception are in [phase status](phase-status.md).

## IMPLEMENTED

- Runs exposes actual failed-run diagnosis, source-linked errors, current implementation excerpts, symptom hypotheses, limitations and explicitly recorded reviewer classification/rationale/observations.
- Four supported categories: locator defect, product regression, environment and data. Ambiguous findings remain UNKNOWN; multiple hypotheses may coexist. Product intent is never inferred from a failing assertion alone.
- Literal locator repair reuses an existing inspected Page/component and preserves all other source bytes, expected business values, assertions, steps, fixtures and canonical Gherkin. An existing scoped uniqueness assertion is required. General repairs and automatic API repairs are outside this initial supported subset.
- Native private-overlay validation runs all examples of the affected canonical feature. The UI shows trust, environment, fingerprint, diff, run identity, cancellation and results. Exact diff application approval is separate from validation.
- Rejection, cancellation, stale target/source evidence, changed stage executable/canonical contract and untrusted execution cannot apply changes. A new unreviewed diagnosis cannot inherit an earlier diagnosis’s reviewed repair. Separately reviewed reversal refuses concurrent edits and preserves original source with apply/reversal journals.
- Versioned static step→Page and declared scenario→endpoint relationships extend the current incremental index. Content/revision identities and current/stale/unavailable source states are visible. Git history lookup is bounded and read-only; no graph database or regression-selection engine is introduced.

## ARCHITECTURAL DECISIONS

[ADR 0013](decisions/0013-evidence-based-maintenance.md) records evidence versus root-cause confidence, a deterministic repair subset, a distinct diagnosis/repair identity, reuse of execution/staging primitives, independent canonical hash validation, and explicit reversible application. See the [approved plan](phase-5-plan.md) for measurable criteria and tradeoffs.

No provider request is needed for the supported cases. Human-entered observations remain labelled as reviewer evidence, not fabricated recorder/browser observations. Imported code and report text cannot grant permissions. Native execution still uses host privileges; a worker is not a security sandbox.

## VALIDATION

Commands use the existing pinned Node 24.22.2/pnpm 11.25.0 toolchain, Java 21.0.13+9 and existing fixed framework dependencies. Local host: macOS 15 Intel. No product dependencies were introduced.

| Command/check                                                                                                                                                                 | Result                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node node_modules/typescript/bin/tsc --noEmit`                                                                                                                               | Executed with the pinned Node and repository TypeScript CLI; passed.                                                                                                                                                                                       |
| `node node_modules/eslint/bin/eslint.js .`                                                                                                                                    | Executed with the pinned Node and repository ESLint CLI; passed.                                                                                                                                                                                           |
| `node node_modules/prettier/bin/prettier.cjs --check .`                                                                                                                       | Passed across all matched repository files.                                                                                                                                                                                                                |
| `node --import tsx --test tests/*.test.ts`                                                                                                                                    | 55 deterministic checks passed; no failed, skipped or cancelled checks. Includes classification, typed-literal policy, source/target revision invalidation, relationship queries, scoped Git metadata, session/CSRF, stale stages and canonical tampering. |
| `node node_modules/vite/bin/vite.js build --config apps/web/vite.config.ts`                                                                                                   | Production web build passed.                                                                                                                                                                                                                               |
| `node node_modules/@playwright/test/cli.js test --config tests/playwright.config.ts tests/maintenance-ui.spec.ts tests/generation-ui.spec.ts tests/api-generation-ui.spec.ts` | Four affected browser/native flows passed. Generation regression uses declared provider fixtures, actual recording and real native runners; no inference.                                                                                                  |
| Final scoped locator-control validation                                                                                                                                       | Passed after the scoped uniqueness guard and presentation changes, then again with diagnosis/repair association isolation (latest flow: 58.5 seconds).                                                                                                     |
| Local links, evidence projection and whitespace                                                                                                                               | See final evidence record.                                                                                                                                                                                                                                 |
| Ubuntu 24.04 x64 / macOS 15 ARM64 / macOS 15 Intel CI                                                                                                                         | NOT_RUN for Phase 5. Latest recorded earlier final CI could not start because of GitHub payment/spending limits. This phase did not launch another cloud job, alter billing or waive checks.                                                               |

Native maintenance controls include:

- Original obsolete locator: both canonical examples genuinely fail.
- Cancellation: the validation is CANCELLED, with no passing evidence or target application.
- Corrected locator against wrong displayed amount: both examples still fail.
- Corrected locator against correct product: both examples pass in the overlay.
- Separate post-application target execution: both examples pass outside the overlay.
- Current product regression: both examples fail, classification is reviewed and locator repair is refused.
- Unavailable loopback environment: real native failure produces an environment symptom hypothesis.
- Missing synthetic API setup: both Karate examples fail in the called precondition; original promotion assertions are preserved and cannot enter locator repair after DATA review.
- Reviewed reversal restores the original broken Page. A concurrent edit is refused. Restoration itself is not claimed as passing execution.

Versioned results, native report hashes and the exact repair/reversal diffs: [local evidence](evaluations/phase-5-local-evidence.json). Raw reports, screenshots and traces remain in private/ignored test artifacts. The five-minute recorder/audio suite was not rerun in Phase 5; the four affected flows include a fresh actual recording in the generation regression.

Resolved validation failures: the first web test selected the first Page rather than the affected PromotionsPage; the actor now explicitly selects the affected Page. The first Karate data control exposed the runner's actual nested-error wording, `expected status: 200, actual: 404`; the versioned symptom fixture and parser now cover it. Subsequent native checks pass. These failed attempts remain distinct from the passing evidence.

An automatic approval review rejected a proposed validation command containing Git initialization inside a synthetic source. That command did not execute. The delivered tests instead inspect existing Git history read-only and validate source content invalidation without creating source repositories. No source Git initialization remains in the new tests; no approval blocker is outstanding for that safer alternative.

## KNOWLEDGE

Created the maintenance guide, ADR, versioned evaluation cases and evidence, and curated [maintenance conventions](knowledge/maintenance-conventions.md). Updated architecture, security, README, phase plan/status and the acceptance workflow label. Existing index, Pages, native runners, staging and application journals were reused. No active skill or universal contributor instruction was changed, no candidate was activated and no incident-specific permanent skill was created. Autonomous skill evolution remains Phase 6.

## QUALITY

Known limits: deterministic symptom vocabulary and static relationship patterns are intentionally bounded; source/trace interpretation and business intent need review. Automatic repair only changes supported literal locators, not arbitrary code or assertions. Validation covers the selected whole feature, not every possible shared Page consumer. Platform-owned execution overlays do not isolate malicious dependencies. The latest 100 maintenance records are exposed in the UI; larger stores will need an archival strategy. Cross-platform acceptance is missing.

Performance: indexed files are cached by content, graph extraction follows the existing index budgets, diagnosis excerpts are limited to twelve files/64 KB and Git history to five commits over at most twelve inspected paths. Maintenance performs zero provider inference calls in the acceptance workflow; that excludes the development conversation itself and is not a measured claim of token savings. No credentials were copied. Source writes were limited to owned disposable synthetic fixtures; no user application source was modified.

## NEXT PHASE

Phase 6 remains PROPOSED. Objectives: controlled knowledge capture, incremental documentation, evaluated versioned skill proposals and rollback, provider usage/context metrics, and deterministic platform/automation/knowledge Autohealth findings. Dependencies: reliable run/diagnosis provenance, versioned evaluations, current source identities and explicit activation rules. Acceptance must measure comparable outcomes, keep read-only health checks separate from approved modifications, require evaluation/approval for skill activation and prove rollback. No Phase 6 functionality has begun.

## APPROVAL REQUIRED

Stop here. Phase 6 requires the exact owner instruction `APPROVE PHASE 6`. Outstanding CI obligations remain; advancing while they are incomplete would additionally require an explicit sequencing exception, not a declaration that validation passed.
