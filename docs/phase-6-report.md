# Phase 6 validation report

PHASE: 6 — Self-improving knowledge and Autohealth

STATUS: VALIDATION, 2026-11-07. Approved implementation and local validation are delivered. Required Ubuntu x64 and macOS ARM64/Intel CI remains NOT_RUN; Phases 3–5 retain their pending validation. The owner's explicit sequencing exception authorized starting Phase 6, without waiving these checks.

IMPLEMENTED:

- Functional **Knowledge & Skills** and **Autohealth** web sections, with actual jobs, history, errors, cancellation, approvals and metrics. No new dependency or cloud service is required.
- Bounded automatic candidate collection from actual completed target runs, applied generation/maintenance and existing indexed capabilities; source/hash/revision provenance, classification, deduplication, staleness, temporary retention and reviewed concise private documentation. Prior document hashes can be explicitly restored while remaining visibly stale. Generation retrieves only relevant approved fresh advice; revoking advice invalidates dependent work.
- Immutable versioned skill proposals, parent/diff/hash inspection, fixed-script evaluations, exact approved activation and explicit rollback in authorized managed targets. Full bundles are staged outside discovery paths and published by directory rename; journal and conflict checks preserve recovery evidence. Unvalidated, changed, unsupported or stale bundles cannot activate through this evaluator. Existing user/global skills were untouched.
- Read-only bounded platform, automation and knowledge diagnostics with severity, evidence, stable fingerprints, recommendations and explicit heuristic/unavailable labels. Local on-demand/scheduled checks support pause, overlap, cancellation, restart interruption and missed intervals. Schedules do not wake a stopped process or silently fix repositories.
- Measured workflow denominators, actual retrieval/search/cache metadata, versioned script invocations and provider token categories when exposed. Unavailable usage stays null; fixture/custom/provider provenance remains distinct.

ARCHITECTURAL DECISIONS:

- [ADR 0014](decisions/0014-controlled-knowledge-skills-and-health.md): reuse SQLite and the bounded index, retain private immutable document/bundle histories, and keep knowledge advisory. No graph database or general executable plugin system.
- Narrow the initial skill evaluator to an actual portable summary procedure. V2 groups repeated findings by repository/fingerprint/severity while preserving occurrence counts and the evidence union. Arbitrary imported procedures remain inert; general agent reasoning/trigger quality is not established by this comparison.
- Publish complete directories with a recoverable journal. Replacing an existing version has a brief missing-directory window, not an OS-wide atomic exchange; concurrent external edits and uncertain interrupted state require explicit recovery. Workers and local filesystem checks are not a hostile-process sandbox.
- Keep automatic health checks deterministic and read-only; active instructions, repository diffs, provider connections and remediation retain separate explicit runtime controls.

VALIDATION:

Commands ran from the platform repository using pinned dependencies and Node 24.22.2 on macOS Intel. Full native regression also used Java 21.0.13, the existing Gradle/pnpm caches and installed Chromium. The executable equivalents of the package scripts were used directly:

| Executed command                                                                                                            | Result                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node --import tsx --test tests/*.test.ts`                                                                                  | 71 passed; zero failed, cancelled or skipped                                                                                                                 |
| `node node_modules/@playwright/test/cli.js test --config tests/playwright.config.ts`                                        | 12 passed in 13.0 minutes; real Playwright and Karate, generation/maintenance, recorder privacy/cancellation and five-minute synthetic microphone regression |
| `node --import tsx --test tests/evolution.test.ts`                                                                          | Final affected-code run: 16 passed after directory-publication and metrics refinements                                                                       |
| `node node_modules/@playwright/test/cli.js test --config tests/playwright.config.ts tests/evolution-ui.spec.ts`             | Final affected web/native flow: 1 passed in 27.1 seconds; exact restored files and no staging/backup remnants                                                |
| `node node_modules/typescript/bin/tsc --noEmit`                                                                             | Passed                                                                                                                                                       |
| `node node_modules/eslint/bin/eslint.js .`                                                                                  | Passed                                                                                                                                                       |
| `node node_modules/vite/bin/vite.js build --config apps/web/vite.config.ts`                                                 | Passed                                                                                                                                                       |
| `quick_validate.py docs/skills/candidates/v1/summarize-health-findings` and v2, using the installed skill-creator validator | Both passed; format evidence only                                                                                                                            |

The full regression checkpoint preceded the final bundle-publication refinements. The final affected deterministic and browser runs cover those changes; the complete suite was not repeated solely to increase counts. Initial development checks exposed an invalid test fixture and lint issues; these were corrected before the passing runs. No outstanding local behavioral test failure is hidden.

[Safe local evidence](evaluations/phase-6-local-evidence.json) preserves the real native run/artifact hashes, automatic ingestion, document histories, health results/schedule, exact skill bundles/diffs/approvals, evaluations, restored active hash and metrics. Raw native reports and screenshots remain private/ignored. The native promotion demo verifies both ES/PT visible values through actual UI assertions; API behavior is exercised independently in the full regression.

- P6-01–02: actual native discovery, unchanged ingestion no-op, source edit staleness, reviewed new document and explicit prior-hash restoration demonstrated. Temporary/inferred promotion and revoked advice are negatively tested.
- P6-03–04: eight actual baseline case executions and sixteen paired candidate/baseline executions; exact activation, active workflow invocation, standalone portable CLI and rollback. Negative cases cover unvalidated/stale/modified bundles, symlinks, arbitrary destinations, cancellation and reserved staging conflicts. A staging conflict leaves the prior active bundle intact. Existing source/user skills are not activation destinations in this demonstration.
- P6-05–06: seven labelled synthetic health cases: zero false positives and zero false negatives on those labels only. Additional integration cases exercise missing artifacts, stale indexes, configuration/instruction findings, slow/flaky heuristics, cancelled/interrupted work and unavailable dependencies. Scheduler history includes actual local scheduled execution; inspections preserve target files.
- P6-07–08: real web controls and reconciled metrics demonstrated. The same two health runs produced 2,869 bytes with v1 and 1,442 bytes with v2, with identical semantic findings, occurrence totals and evidence union. The eight-case comparison produced 2,211 baseline versus 1,014 candidate bytes. These are serialized output measurements, **not model tokens or monetary savings**. The QA flow recorded 26 real script attempts and zero provider inference tasks.
- P6-09: local checks pass; required three-system CI is missing. Current online advisory audit was not run; dependencies were not changed. No physical microphone or general Codex agent-quality comparison is claimed. Fixed cases named “held-out” are deterministic variants, not blinded independent trials.

KNOWLEDGE:

- Added the [user guide](evolution.md), [curated conventions](knowledge/evolution-conventions.md), ADR 0014, [health labels](evaluations/fixtures/phase-6-health-v1.json), [skill case manifest](evaluations/fixtures/phase-6-skills-v1.json), safe local evidence and this report. Updated architecture, security, README, catalogs and roadmap/status.
- Added inactive portable `summarize-health-findings` v1/v2 candidates. Earlier discovery/Playwright/Karate candidate limitations remain unchanged. No AGENTS.md growth or automatic source documentation write.
- Reused existing index, source policy, native results, exact generation/repair approval machinery, private storage and task usage records.

QUALITY:

- Supported static patterns and bounded display/index windows are documented. Dynamic imports, arbitrary business semantics, full artifact integrity, unknown repository-reference spellings and genuine flakiness diagnosis need deeper investigation; heuristic findings do not authorize fixes.
- Evaluations establish the supported deterministic helper's semantics and refusal behavior. They do not measure general model skill invocation, agent reasoning quality, actual paid-token reduction or production false-positive rates. Broader skills require their own evaluator and review.
- Directory publication and SQLite persistence are journaled but are not one filesystem/database transaction. Recovery is conservative; hidden staging/backup remnants surface as findings. No concurrent unknown content is silently deleted.
- Read-only diagnostics have fixed budgets; repeated unchanged analysis uses the existing content cache. Temporary context expires without deleting reviewed documentation. Larger histories need pagination/archival work.

NEXT PHASE:

No Phase 7 is approved or implicitly begun. The immediate remaining release obligation is the existing three-system validation for Phases 3–6 once CI is available. The last recorded CI blocker was an account billing/spending rejection before job steps; no new cloud job, token access or billing change was made in Phase 6. This report does not assert current account billing state.

Any expanded evaluator, generalized agent-quality study, new remediation capability or additional phase needs a concrete proposal with deliverables, dependencies and measurable acceptance criteria.

APPROVAL REQUIRED:

Execution stops here. A further implementation phase requires its own proposal and exact `APPROVE PHASE N`; this report does not request blanket skill activation, credential reuse or external writes. Pending CI keeps this phase in VALIDATION.
