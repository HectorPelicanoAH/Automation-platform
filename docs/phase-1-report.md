# Phase 1 completion report

PHASE: 1 — Platform foundation

STATUS: COMPLETED on 2026-11-06. Phase 2 remains PROPOSED and unapproved.

## IMPLEMENTED

React/Fastify workbench with private SQLite persistence; multiple read-only source registrations and Git/manifest detection; separate target initialize/import; manual Gherkin drafts, official parsing and hash-safe saves; authorized target browsing; actual promotion UI/API; independent Playwright-BDD and Gradle/Karate starters; typed selection, persisted queue, cancellation, normalized/native results and artifact download; readiness and configurable startup retention. The owner selected MIT; LICENSE and notices are committed.

Recording, microphone, transcription, AI generation, repair and skill evolution remain unimplemented. No cloud account is needed for delivered manual workflows.

## ARCHITECTURAL DECISIONS

[ADR 0009](decisions/0009-phase-1-runtime-and-boundaries.md) records pinned versions and implementation refinements. Modular monolith with one supervised worker; native runners retain independent lifecycles. Host workers execute trusted code and are not security sandboxes. A cookie plus separate origin-scoped proof protects API access from localhost cross-port cookie reuse. Canonical changes invalidate API bindings; unsupported row selection and unknown row attribution remain explicit.

## VALIDATION

Code validated: `f8e500608ffcfa9e485412db1ba808735999807a`, branch `codex/phase-1-foundation`. Subsequent completion changes affect documentation only.

[GitHub Actions run 42125238265](https://github.com/HectorPelicanoAH/Automation-platform/actions/runs/42125238265) completed successfully on all three systems. Each fresh checkout installed exact dependencies and Chromium, then executed typecheck, lint, formatting, nine domain/storage/HTTP/security/demo tests, build and the real browser acceptance journey. No retry was configured. [Versioned CI summary](evaluations/phase-1-ci-evidence.json) preserves synthetic run outcomes and measurements; downloadable native reports/screenshots/logs are retained by CI for seven days.

| System       | Architecture        | Complete workflow | Metadata API p95 / samples |
| ------------ | ------------------- | ----------------- | -------------------------- |
| Ubuntu 24.04 | x86_64              | PASS              | 18.78 ms / 139             |
| macOS 15     | Apple Silicon ARM64 | PASS              | 6.28 ms / 106              |
| macOS 15     | Intel x86_64        | PASS              | 43.22 ms / 267             |

The matrix proves these OS/architecture families with the pinned runtime; it does not certify every OS release. WSL2 is unvalidated; native Windows execution remains deferred.

### Acceptance traceability

| ID    | Result and executed evidence                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-01 | PASS: clean three-system CI installation using frozen pnpm locks, verified Gradle wrapper/dependencies, pinned Node/Java; real apps start without AI.                                                                         |
| P1-02 | PASS: browser configures two synthetic roots, Git and non-Git, detects React/Fastify and preserves settings across restart. HTTP/workspace checks cover invalid roots and settings; indexing remains visibly unavailable.     |
| P1-03 | PASS: real external starter initialization; integration import of compatible existing Git target without rewriting files or initializing nested Git.                                                                          |
| P1-04 | PASS: exact Gherkin text, Background/Rule, tags, outlines/Examples, tables/docstrings and identity preserved; diagnostics, invalid draft retention and conflict rejection verified.                                           |
| P1-05 | PASS: actual UI fetches actual API; both datasets and API 400/404 tested, browser loading/error handling exercised without replacing backend responses.                                                                       |
| P1-06 | PASS: independent UI CLI executes two visible example instances; scoped unique locators, Page interactions, thin steps, fixtures and data builder.                                                                            |
| P1-07 | PASS: independent Gradle CLI executes two Karate API instances with real status/schema/business-field assertions and native evidence.                                                                                         |
| P1-08 | PASS: suite, feature, scenario and literal-tag selection through the web for both frameworks, two instances each; native links and canonical identity retained. Unsupported row selection rejected.                           |
| P1-09 | PASS: UI-only defect produces two Playwright failures while two Karate instances pass; restoration produces two UI passes. Missing/malformed report fails even with runner exit zero; unmapped identity remains unknown.      |
| P1-10 | PASS: both real runners cancelled during held requests; terminal cancellation and process-group cleanup within ten seconds, no remaining group; duplicate requests idempotent; restart marks unfinished work INTERRUPTED.     |
| P1-11 | PASS: session proof, Origin/Host/CSRF, traversal, symlinks, overlaps, argument injection, save conflict, artifact authorization and source write boundaries checked. Artifact responses are attachments under sandbox policy. |
| P1-12 | PASS: all checks above, SQLite integrity and backup/restore, real browser flow and named local performance samples. Measurement limitations remain explicit below.                                                            |

Reproducible platform commands, from repository root with the pinned toolchain:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm test:smoke
pnpm audit --json
```

On Ubuntu use `pnpm exec playwright install --with-deps chromium`. From an independently initialized target, `pnpm --dir ui install --frozen-lockfile`, `pnpm --dir ui typecheck`, `pnpm --dir ui test`, and `./gradlew test --no-daemon` from `api/` were actually executed against the real demo. The harness then exercises managed Gradle with `--rerun-tasks --offline --console=plain`.

Local results: nine tests and the complete browser journey passed; standalone UI typecheck, platform typecheck/lint/format/build passed. SQLite reported 3.53.4. Audit initially found one moderate minimatch advisory; pinning 11.0.4 resolved it and the repeated audit returned zero known advisories. Final documentation validation passed: 94 local links resolve, future phases remain PROPOSED, repository-wide Prettier check and `git diff --check` passed. No required check remains failing. Deliberate runner failures are retained as expected negative-case evidence, not counted as passing tests.

Performance on macOS 15.7.3 Intel Core i3-1000NG4 1.10 GHz, Node 24.22.2: real process startup to ready with built assets measured 4199 ms with fresh data and 2226 ms with existing data, one sample each. Local full-journey metadata p95 was 12.64 ms across 183 requests during real executions. Normal managed UI runs took 4.06–6.20 s; normal Karate runs took 14.04–17.12 s, including orchestration and native startup. These are workload samples, not general speedup or cold-machine guarantees. SSE publishes persisted updates every 500 ms. A separate real Chromium sample measured 498 ms from persisted run creation to the refreshed dashboard count, without reloading; one sample only. The same check confirmed visible loading while holding the real API response, then success, and real 400/404 error states.

A paired local execution sample (direct first, managed second, warm dependency caches, one run per mode) measured UI 3989 ms direct / 3898 ms managed and Karate 13520 ms direct / 14039 ms managed. Differences were −90 ms and +519 ms; sequential cache/OS variation and up to 50 ms polling quantization prevent interpreting the negative value as a speedup. This quantifies observed orchestration-inclusive cost, not a stable overhead distribution. Both modes executed the same two real examples against the same local application. [Local measurement record](evaluations/phase-1-local-metrics.json).

Earlier integration failures exposed directory copy semantics, nested Playwright worker environment inheritance, explicit BDD fixture discovery and accessible dropdown naming. Fixes retained business assertions; no retries, forced clicks or arbitrary interaction waits conceal failures. An additional benchmark initially used an obsolete fixture and correctly encountered stale API-binding rejection; no successful execution was fabricated.

## KNOWLEDGE

README, [local setup](local-development.md), target READMEs, architecture/security amendments, runtime ADR, [runner conventions](knowledge/runner-conventions.md), risk resolutions and [deterministic evaluation coverage](evaluations/phase-1-results.md) updated. E03/E05 current-phase behavior and E12 boundary/cancellation subset have real evidence; later AI/repair portions remain unexecuted. No active product skills or autonomous knowledge engine created. No token or cost savings claimed.

## QUALITY

Known limits: compatible starter-style imports only; literal tags; no row filter; nullable native row attribution; trusted-code execution without an OS sandbox; source index preferences stored without indexing; retention at startup; no native Windows worker. Native reports can contain sensitive application evidence despite log redaction and require careful handling. Filesystem checks reduce boundary escapes but are not a malicious-code sandbox or complete TOCTOU defense. Single samples do not establish performance distributions or optimized execution savings. See [security](security.md) and [quality standards](quality-standards.md).

## NEXT PHASE

Phase 2 objective: persist and inspect genuine demonstrations with synchronized browser evidence and narration. Deliver headed Chromium capture, event/DOM/ARIA/locator evidence, privacy-limited network/screenshots, microphone permissions/chunks, manual timestamped transcript fallback, timeline, cancellation and partial-session recovery. Automatic transcription requires explicit configuration; optional video is outside minimum scope.

Dependencies: completed P1, public Playwright capture feasibility, OS/browser microphone permission and clock calibration. Risks: unsupported interactions/frames, background throttling, drift and sensitive evidence. Acceptance: genuine promotion interaction evidence reloads after restart; marker alignment within 500 ms over five minutes in the named setup; microphone denial supports manual narration; secret/gap fixtures are represented honestly; stop/cancel and storage/upload limits pass. See [roadmap](roadmap.md) and [recorder design](recording.md).

## APPROVAL REQUIRED

Stop after Phase 1. To authorize the recorder phase, the owner must explicitly send `APPROVE PHASE 2`. Discussion or this proposal does not grant approval.
