# Quality and validation standards

Use checks appropriate to delivered behavior. Documentation-only Phase 0 has no runtime tests to pass. Later phases require genuine browser/JVM evidence where applicable, not just mocks of process execution.

## Reproducibility and support

- Pin direct dependency versions and commit resolved lockfiles. Pin Node/pnpm and Java distribution/version; commit Gradle wrapper with distribution checksum and dependency verification/locking. Record Chromium revision coupled to the selected Playwright version. No `latest`, dynamic Gradle versions or downloads piped into a shell in documented reproducible setup.
- Recheck upstream support/security advisories when selecting versions. The initial target is Node 24 LTS and Java 21; research-time compatibility is not execution evidence. Verify embedded SQLite has the WAL-reset fix (3.51.3+ or documented fixed backport) before WAL use.
- Initial runtime validation matrix: macOS 14+ Apple Silicon and Ubuntu 24.04 x86_64. Record exact OS, architecture and toolchain actually tested; do not imply all patch versions are certified. Ubuntu CI may provide Linux evidence. WSL2 remains best effort and native Windows deferred until separately evidenced.
- Initial install may need network. Manual scenario editing/execution/results against a local app must work without an AI account/cloud service after setup. Gracefully report unavailable Java/browser/provider dependencies.
- Exclude secret files, local paths/state, browser auth state and generated reports from Git when introduced. Publish required notices and select a license before release; do not imply this planning repository already has one.

## Validation matrix by phase

| Phase | Required automated checks                                                                                                                                | Required real demonstration                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| P0    | local links/anchors, required docs/ADRs, allowed phase states, all future phases proposed, no runtime/dependency scaffold, whitespace                    | navigable design, roadmap and approval boundary; no simulated application               |
| P1    | typecheck, lint, format, parser/identity/selector unit tests, HTTP/session/path/DB/adapter integration, platform browser smoke, real independent runners | two UI and two API example instances, failure/cancel/restart, external target lifecycle |
| P2    | event schemas/order, clock alignment, redaction fixtures, bounded chunks, persistence/recovery, capture/browser integration                              | headed user interactions + narration timeline, permission-denied/manual fallback        |
| P3    | structured agent contract and protocol tests, retrieval relevance, prompt-injection/approval negatives, generation evals and static checks               | recording→reviewed Gherkin→staged diff→approved UI test→real result                     |
| P4    | backend extractors/contracts, Karate schema/helper tests, binding coverage and parallel data isolation                                                   | generated API tests + distinct UI/API defect + measured setup comparison                |
| P5    | failure classification/repair cases, revision invalidation, graph edges, stale-diff/rejection/rollback                                                   | defect repair versus product-regression non-repair, targeted real validation            |
| P6    | lifecycle/dedup/staleness, eval comparability, activation/rollback, health fixtures/scheduler/retention                                                  | evaluated skill proposal, approval, exact rollback and actionable health evidence       |

Tests exercise behavior and boundaries, not implementation details. Do not add tests for static prose wording beyond the necessary phase/scope invariants. Fixtures must be small, synthetic and versioned; never copy private application data into the repository.

## Playwright-BDD conventions

Use Playwright Test's fixtures and lifecycle, TypeScript, reusable Pages/Page Components, environment config and data builders. Thin step definitions express business intent and delegate interactions; they do not use raw `page.click/fill/goto` operations. Reuse existing suitable objects before adding new ones. Keep Pages focused; avoid a universal base class or an abstraction for every element.

Locator order: role + accessible name, label, stable test ID, then other justified stable locator. Scope to a meaningful component/frame and verify exactly one intended match in the relevant observed state. Revalidate when state/source changes; previous uniqueness is evidence, not a permanent guarantee. Avoid absolute XPath, long CSS chains, positional selectors, fragile ancestry, hardcoded sleeps and forced clicks. Use web-first assertions for visible state.

Every scenario gets isolated browser context/data unless a proven safe fixture says otherwise. Auth state may be reused only with correct role/environment/expiry and no shared mutable session coupling. API setup is allowed for preconditions when it does not bypass the behavior under test. No retries used to conceal failures; retain every attempt and classify a pass-after-failure as flaky. Parallel tests must not depend on execution order.

Native reports/traces are retained under privacy policy; generated Playwright-BDD intermediate files are build artifacts, not edited source. Preserve mapping to canonical scenario/row revision.

## Karate conventions

Use native features/functions, schemas, environment config, reusable auth/preconditions and data builders only when actually needed. Keep API intent clear and helpers cohesive. Do not reproduce Playwright Page Objects in Karate.

`callonce` is appropriate for feature-scoped reusable initialization; `karate.callSingle()` for run-wide safe cached setup. Validate actual semantics against the pinned Karate version. Never cache mutable user/test data or expiring auth as if it were immutable; scope caches to environment/identity/config, and disable persisted token caches by default. Each scenario must remain independently runnable and parallel-safe.

Validate status and response shape/fields, include negative cases for delivered input behavior, and keep request/response secrets redacted. Use a Gradle wrapper for the starter and explicit supported import adapters; no automatic build-system rewrite.

## Gherkin and coverage

Use official parser behavior rather than regex parsing. Support Features, scenarios/outlines, Examples, Backgrounds, tags, tables/docstrings and language-aware keywords; preserve Rule structure when present. Prefer an outline for multiple datasets describing one behavior, and a plain scenario for a single dataset unless a business reason warrants otherwise.

Business steps do not embed CSS, HTTP method DSL or page implementation details. Separate preconditions, interactions and assertions. Unconfirmed inferences block conversion to approved requirements. Keep UI, API and hybrid coverage separate and revisions explicit. A reported pass applies only to the selected implementation, dataset and observable assertion.

## Security checks

Implement phase-relevant negative cases from [security.md](security.md) and [the evaluation dataset](evaluations/cases-v1.md). In P1 include Origin/Host/session, path/symlink/root overlap, shell arguments, imported execution trust and report isolation. Later add redaction, injected instructions and exact diff/skill activation gates. Dependency audit results require triage and evidence; an unavailable advisory service is missing validation, not a clean security result.

No check result grants approval to external writes or active skill changes. Generated code passing tests is not proof it is safe; review the diff and execution policy.

## Performance and metrics

Measure on a named environment with sample sizes and cold/warm separation. Record startup excluding downloads, metadata API latency during active runs, event-to-UI lag, worker overhead versus direct runner time, cancellation cleanup, peak artifact growth and indexing reuse. Initial P1 provisional budgets are in [the implementation proposal](phase-1-plan.md); unsupported hardware needs a measured baseline rather than a universal guarantee.

P3+ records retrieval bytes/file counts, tool/search counts, model/reasoning and usage when exposed. P6 compares controlled evaluation versions. A character-based token proxy must be labeled an estimate; do not merge proxies with provider token counts or claim saved tokens without comparable workflow evidence.

## Evidence and release rule

Each required check records date, command, directory, environment, exit status, actual counts, evidence path and remaining gaps. Native reports and redacted logs are primary runtime evidence; prose is not a replacement. Store sensitive outputs privately and commit only safe summaries/fixture references. Distinguish an intentional negative-case failure from an accidental failing release check and show restoration/rerun.

Run relevant checks once after changes; broaden only for affected behavior or unresolved risk. Do not keep rerunning unchanged passing checks to manufacture confidence. Required missing behavior or failed validation keeps the phase in `VALIDATION`/`BLOCKED`.

## Phase 0 documentation checks

Use only existing Git/Python tooling; no dependency install or runtime scaffold. Run a dependency-free checker from a temporary directory to validate local Markdown paths/fragments outside code blocks, required artifact/ADR inventory, status values, all future phases `PROPOSED`, and the absence of app/source/dependency/build files. Check Markdown fences and whitespace, keep AGENTS concise, and inspect the final document inventory.

Reproduce the whitespace check including newly created documents:

```text
git diff --check
git diff --no-index --check /dev/null README.md
```

The second command is an example for one untracked file; the Phase 0 evidence record lists how all Markdown files were checked. `git diff --check` alone does not inspect untracked content. Visual Mermaid rendering and runtime validations are not claimed by these structural checks.
