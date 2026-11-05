# Phase 1 implementation proposal

Status: `VALIDATION`. Authorized on 2026-11-05 by the human message `aAPPROVE PHASE 1` (an explicit approval with a leading typo). This document remains the approved scope boundary; Phase 2 is unapproved.

## Objective and scope

Deliver a local web application that can configure multiple read-only application sources, initialize or import a separate trusted automation repository, manually inspect/edit valid functional Gherkin, run real Playwright-BDD and Karate tests, and inspect normalized outcomes/native evidence. Include a real UI/API promotion application. No AI configuration/account is required.

Included surfaces: Dashboard (workspace summary, readiness and recent runs), Settings/Workspace (roots and environment references), minimum Scenarios (feature text, examples/tags and validation), Repository (authorized target tree/source text), and Runs (selection, launch/cancel, statuses, logs and artifacts). Readiness diagnostics belong here, but the complete Autohealth dashboard waits for P6. Other roadmap areas must not offer simulated working actions.

Excluded: recorder/microphone/transcription, source code indexing or semantic capability graph, Codex/provider runtime, AI proposals/generation, automatic API translation, repair, embeddings, skill evolution, scheduled health jobs, remote access, multi-user operation and universal imported-project compatibility.

## Decisions to prove early

- Pin Node 24 LTS patch, pnpm, TypeScript, React/Vite, Fastify/plugins, Gherkin parser, Playwright/Playwright-BDD compatible pair, SQLite driver/embedded engine, Java distribution/21 patch, Karate and Gradle wrapper. Preferred Karate baseline is the documented stable 2.x line with Java 21, subject to actual artifact/JUnit/report compatibility checks; do not silently introduce preview runtime flags from an example. Record any fallback and its rationale before expanding beyond the approved design.
- Use an engine with the WAL-reset fix before enabling WAL. Record `sqlite_version()` from the selected driver. Native prebuilds, schema migrations, integrity and backup/restore need evidence.
- Prove two native runners from independent target directories before building complex UI. Preserve framework source paths and reliable scenario/row attribution. Test Java child-process cancellation early.
- Keep imported configs as trusted executable code, behind fingerprinted trust acknowledgment. Initial import supports the platform starter layout and explicitly configured compatible Playwright-BDD/Gradle Karate roots. Other layouts receive diagnostic instructions; no destructive conversion.
- Use one global run worker by default, a persisted queue, one target writer lease and bounded logs. Parallel scenario support belongs inside the independent frameworks, validated on the demo without cross-scenario state.

Alternatives and boundaries are in [architecture](architecture.md) and [ADRs](decisions/README.md). If basic protocol/report/packaging compatibility fails, remain in this phase and revise the proposal rather than claiming partial success or beginning a later phase.

## Milestones within the single approval

| Milestone                | Deliverable                                                                                                        | Demonstration before continuing                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| M1 Compatibility         | pinned manifests/locks, minimal runners in a temporary approved target, documented supported versions              | actual Playwright-BDD and Karate processes with structured output and cancellation; no simulated report        |
| M2 Local foundation      | React/Fastify, SQLite migrations, loopback session and validation, persistent settings                             | restart with saved workspace; cross-origin/path abuse denied                                                   |
| M3 Workspace/contract    | multiple source registrations, target initialize/import, safe file gateway, Gherkin editor/parser, target manifest | select external empty root; import compatible existing root unchanged; edit/parse/save with conflict detection |
| M4 Demo/starters         | real promotion UI/API and independently runnable template projects                                                 | two country/language datasets verified through both native CLIs                                                |
| M5 Unified execution     | typed selectors, worker queue, progress, cancel/restart reconciliation, normalization and safe artifact access     | success, deliberate failure, missing-report error and cancelled run all visible accurately                     |
| M6 End-to-end acceptance | web flow, setup matrix, docs and evidence report                                                                   | fresh clone/setup reproduction and all criteria below                                                          |

Milestones are not automatic approvals of future phases. Commit organization is flexible; do not require a user approval for every routine step already inside Phase 1.

## External target starter

The platform's template consists of plain files, without a `.git` directory or platform runtime imports. Initialize only a separately selected empty directory outside all registered roots; Git initialization, if offered, is an explicit option after ancestor checks. Import never rewrites existing files merely to register the target.

UI project: TypeScript, Playwright Test, Playwright-BDD, business steps, `PromotionsPage`, a small `PromotionCard` component if it has reusable responsibility, fixtures, environment configuration and test data builder. Do not create an inheritance tree or abstraction for a single trivial selector. All UI interactions remain in Pages/components; steps remain thin.

API project: Gradle wrapper, Java runner, Karate features, configuration, schema assertions and reusable helpers only where behavior is actually repeated. The public guest demo needs no fake auth framework; document the extension point rather than creating unused login helpers. Independent project README/locks and commands must not depend on the platform backend.

Canonical Gherkin and portable manifest live under `contracts/`. The starter's UI compiler reads these features; the API contract is separately hand-authored and explicitly linked. Generic framework translation is excluded until P4. A manual change to contract expectations can invalidate bindings; never auto-edit API assertions to make them agree.

## Actual promotion demo

The UI route `/promotions?countryIso=...&languageIso=...&brand=...` fetches the real demo backend. The API is `GET /api/promotions/free-shipping` with the same three validated parameters. One deterministic business rule/data source provides title, display discount, subtitle, threshold minor units and currency; UI formatting is visible and independently asserted.

| countryIso | languageIso | brand | promoTitle   | discount | subtitle                    | thresholdMinor | currency |
| ---------- | ----------- | ----- | ------------ | -------- | --------------------------- | -------------- | -------- |
| es         | es          | demo  | Envío gratis | 50€      | En pedidos superiores a 50€ | 5000           | EUR      |
| pt         | pt          | demo  | Envio grátis | 60€      | Em compras superiores a 60€ | 6000           | EUR      |

These are synthetic approved demo fixtures, not inferred production business rules. Unknown combinations return a documented not-found response; malformed parameters return validation errors. UI shows actionable error/loading/empty states. The demo has no real account, purchase or destructive external operation.

The supplied `discount` label is retained as an illustrative displayed field; its value here accompanies a minimum-order free-shipping message, not a €50/€60 price reduction. Store threshold semantics separately in minor units and do not claim to test actual checkout eligibility. Country/language/brand are explicit test-context inputs rather than IP geolocation. Confirm different production semantics when a real application is configured.

The initial **business contract** is:

```gherkin
Feature: Promotional free shipping

  @promotion @smoke
  Scenario Outline: Show the correct free shipping promotion
    Given a guest customer from "<countryIso>" using language "<languageIso>" and brand "<brand>"
    When the customer visits the promotions page
    Then the free shipping promotion shows title "<promoTitle>", discount "<discount>" and subtitle "<subtitle>"

    Examples:
      | countryIso | languageIso | brand | promoTitle   | discount | subtitle                        |
      | es         | es          | demo  | Envío gratis | 50€      | En pedidos superiores a 50€      |
      | pt         | pt          | demo  | Envio grátis | 60€      | Em compras superiores a 60€      |
```

Playwright asserts the visible promotion region, title, displayed discount and subtitle using unique scoped semantic locators. Karate independently asserts HTTP status, response schema and exact business fields, including threshold/currency. Karate coverage is API state, not “customer sees a promotion.” A controlled UI-only defect must fail UI coverage while leaving the correct API result distinct. Preserve its failing evidence before restoring the demo; do not ship the defect as the normal state.

## Measurable acceptance

| ID    | Required evidence                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-01 | Fresh documented installation using exact lockfiles/wrapper/checksums; one documented platform start command opens/serves the loopback app. Exact versions captured, no AI account. Both initial OS targets validated, or support/scope explicitly revised with user approval.                                                                                                |
| P1-02 | Register at least two distinct context roots (including non-Git and Git fixtures), kinds, include/exclude/index settings and optional preferred revision. Detection reads manifests/metadata without running repository code. Restart preserves configuration and reports missing/invalid paths. Index toggle is stored as policy with indexing visibly unavailable until P3. |
| P1-03 | Initialize external starter target and import a compatible existing Git target. Assert neither operation creates nested Git roots or modifies external sources; import alone changes no target content.                                                                                                                                                                       |
| P1-04 | Edit/parse/save a feature with Background, tags and outline Examples; retain text/comments. Invalid input reports source-position diagnostics, stays a draft and cannot execute as a valid revision. Concurrent target edit produces a conflict instead of overwrite.                                                                                                         |
| P1-05 | Actual demo UI fetches actual API; both fixture rows are served. Invalid and unknown inputs produce documented 400/404 behavior; loading/error UI demonstrated. No backend mocking in the required runner proof.                                                                                                                                                              |
| P1-06 | Independent CLI Playwright-BDD: at least two real UI example instances pass; independently verify visible content/region and scoped unique locators. No `waitForTimeout`, forced interactions or direct UI operations in steps.                                                                                                                                               |
| P1-07 | Independent CLI Gradle/Karate: at least two real API example instances pass with status/schema/field assertions; response evidence and native reports retained.                                                                                                                                                                                                               |
| P1-08 | Web starts each framework by scenario, feature, tags and suite using typed validated selectors; normalized results link exact scenario/revision/example data when known and native artifacts. Unsupported row selection is explicit and never broadens silently.                                                                                                              |
| P1-09 | A deliberate UI-only defect fails Playwright while Karate remains correctly classified; nonzero runner, malformed/missing report and unknown mapping remain visible errors/unmapped states. Restore the demo and rerun normal acceptance.                                                                                                                                     |
| P1-10 | Cancel a long-running test for each runner, finish process cleanup within 10 seconds in the supported setup, retain partial status, and verify no orphan child process. Restart interrupted work accurately; duplicate start request is idempotent.                                                                                                                           |
| P1-11 | Automated session/Origin/Host, traversal, symlink escape, root-overlap, argument-injection, conflict, unauthorized artifact and source-write denial cases pass. Trusted-code limitation is visible; reports cannot execute in the privileged origin.                                                                                                                          |
| P1-12 | Typecheck, lint, formatting, parser/adapter/storage tests and one browser-driven platform smoke flow pass. SQLite integrity and backup/restore verified. Document actual cold/warm startup, run overhead and UI responsiveness on named hardware; all remaining risks/failures reported.                                                                                      |

## Validation commands and evidence policy

The commands below are the proposed public script contract, **not executable Phase 0 functionality**. Implement and document them during P1, then record actual output/version evidence:

```text
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:smoke
```

From the separately initialized target, with a running demo and documented non-secret base URL configuration:

```text
pnpm --dir ui install --frozen-lockfile
pnpm --dir ui test
cd api
./gradlew test --no-daemon
```

Native generation/report commands, Gradle checksums, dependency verification, CI commands and report paths must be filled with the versions actually implemented. Unit tests cover pure selection/mapping/parser logic, integration tests cover DB/file/process/HTTP boundaries, and browser smoke covers the user journey. Required real-runner integration is not replaced by mocked process tests.

Evidence record: command, working directory, exact versions, OS/hardware, timestamp, exit status, expected/actual counts, artifact locations and hashes, intentional-failure explanation, recovery and remaining gaps. Never describe these proposed commands as already passing.

## Dependencies, risks and completion boundary

Dependencies: approved Phase 1, network for initial dependencies/browsers/Gradle, local filesystem permissions, Git for optional Git metadata, Java and an available Chromium display for headed debugging. Runtime tests against the local demo work without cloud services after setup. License choice is needed before redistributing an open-source release; default recommendation is Apache-2.0, subject to owner choice and dependency notice review.

Main risks: native SQLite packaging/fixed engine, Karate 2.x report/JUnit compatibility, Playwright-BDD compiler mapping, Gradle process cleanup, imported-project variability and secure local session bootstrap. Resolve or explicitly block before claiming P1 completion. Performance targets are provisional and must be measured: local API p95 under 200 ms for short metadata reads while a run is active, startup to ready under 10 seconds excluding dependency/browser downloads and demo/JVM warmup, UI progress within 1 second of a persisted event under local load. These do not predict test duration; document hardware and sample sizes.

Completion updates README/setup, architecture/ADRs if changed, phase status, quality/security evidence, target conventions and a Phase 1 completion report. Demonstrate the real web flow and both independent CLIs, mark unmet acceptance clearly, then stop. Phase 2 requires a new `APPROVE PHASE 2` message.
