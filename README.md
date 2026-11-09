# AI-Native QA Engineering Platform

A local functional testing workbench: connect read-only application sources, manage a separate automation target, edit business Gherkin, execute real Playwright-BDD and Karate tests, and inspect outcomes and native evidence without AI.

**Phases 1–2 are complete; Phases 3–6 remain in validation.** Reviewed UI/API generation, independent native runners, separate coverage and reusable local preparation have real local execution evidence. Phase 4's API generation uses a supported inline OpenAPI/public-GET subset; a real Codex-generated response has native negative/positive validation after explicitly recorded corrected-host replay. Current three-system CI remains outstanding after GitHub rejected the last Phase 3 final jobs for billing. Phase 5 adds reviewed failure diagnosis and narrowly scoped literal-locator repair with native validation and reversal. Phase 6 adds source-linked knowledge, reversible reviewed documentation/skills, honest metrics and local read-only Autohealth schedules. Its initial skill evaluator supports a fixed portable summary procedure; arbitrary instruction-only improvements remain unvalidated. Automatic transcription and general automatic repairs remain outside the implemented subset. See [phase status](docs/phase-status.md) for the explicit sequencing exception, acceptance evidence and remaining gates.

## Run locally

Prerequisites: **Node 24.22.2**, **pnpm 11.25.0**, **Temurin Java 21.0.13+9**, Git, and a supported macOS/Linux workstation. Gradle 9.2.1 is supplied by the independent API starter wrapper. Initial dependency/browser downloads need network; manual editing and local tests do not need cloud services after setup.

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev
```

On Ubuntu install browser OS dependencies with `pnpm exec playwright install --with-deps chromium`. Set `JAVA_HOME` to Java 21 if another Java is your system default. Select the exact Node version using your preferred version manager and `.node-version`; setup does not replace system runtimes automatically.

The platform serves `http://127.0.0.1:4310` and the real promotion demo `http://127.0.0.1:4311`. In another terminal:

```sh
pnpm open
```

This opens a private, one-time launch link. The token is stored in a private `launch.json`, not printed in logs. A cookie plus an origin-scoped session proof protects API access. Restart creates a new launch link if the session is lost. The unauthenticated page explains how to start a session.

Private state defaults to `~/.local/share/ai-native-qa` outside Git. Override with `QA_DATA_DIR`; `PORT` and `DEMO_PORT` change listening ports. If you change the demo port, update the application base URL in Workspace. Stop with Ctrl+C; running workers are cancelled, and abruptly interrupted runs are reconciled on restart.

## First functional run

1. Optionally register frontend/backend directories in **Workspace**. You can record and generate UI automation without application source repositories; generation still uses the recording and managed automation target. Metadata detection is read-only; opt-in indexing is available through Generate.
2. Initialize a starter in an empty external directory, or import a compatible existing automation checkout. Neither operation creates a nested Git repository. Sources, target, platform and private data roots must not overlap.
3. Follow the target README to explicitly install its pinned UI/API dependencies. The platform never installs or executes a project during discovery/import.
4. In **Scenarios**, select and review the canonical feature and Examples. Invalid text remains a draft; saves check base hashes. A changed contract invalidates its existing API binding until separately reviewed.
5. In **Runs**, select the target, environment, framework and suite/feature/scenario/tag. Review the project execution fingerprint, then start a run. Unsupported example-row selection is explicit.
6. Inspect real test statuses, steps, logs and downloadable native artifacts. API-state coverage never claims correct UI rendering. Cancelled/interrupted/missing evidence never becomes a pass.

The synthetic demo covers Spanish/Portuguese free-shipping messaging. The displayed `50€`/`60€` amount describes a threshold-related promotion, not a price reduction or tested checkout eligibility.

## Record a demonstration

Open **Record**, enter the application's final HTTP(S) URL (prefer its HTTPS address). Page resources load from their normal domains; approve additional origins when you intend to navigate there or capture their interactions. Start recording, then interact with the separate headed Chromium window. Form values and network headers/bodies are omitted; query values are redacted. Screenshots are opt-in and mask forms, frames and configured private regions.

Microphone capture requires session consent and a separate **Start microphone** action in the platform tab. Browser/OS permission and codec support apply. Raw audio may contain secrets; it stays local. If microphone permission is denied, add timestamped manual transcript segments and save immutable revisions. No automatic transcription engine or cloud upload is configured. **Stop recording** flushes bounded acknowledged data and closes the controlled browser; cancellation preserves partial evidence.

Inspect timeline events for page/frame identity, source-clock uncertainty, locator count/target match and masked screenshots. Gaps are explicit; observed actions do not prove business expectations. See [recorder setup and limits](docs/recording.md) and [Phase 2 evidence](docs/phase-2-report.md). Physical microphone hardware must be checked locally; synthetic audio validation does not certify a device.

## Validate

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm test:smoke
```

The smoke suite includes a real-time five-minute synthetic audio/clock check and headed Chromium recorder checks. On Linux run `xvfb-run --auto-servernum pnpm test:smoke` in a workstation/CI environment with Xvfb. The Phase 1 journey starts actual loopback apps, creates isolated external fixtures, explicitly installs and independently executes both target CLIs, drives the platform UI, verifies each selector, introduces a UI-only defect while keeping API state correct, restores normal UI behavior, and checks cancellation/idempotency/restart. It needs Java 21, network for an uncached initial target setup, and Chromium. Fixtures use synthetic data, not user repositories.

The full acceptance workflow passed on Ubuntu 24.04 x86_64, macOS 15 Apple Silicon and macOS 15 Intel: [executed CI evidence](https://github.com/HectorPelicanoAH/Automation-platform/actions/runs/42125238265). The [workflow](.github/workflows/phase-1.yml) pins the setup. WSL2 remains unvalidated, and native Windows execution is outside the current POSIX worker implementation. No operating system is certified merely by this README.

## Documentation

| Need                                          | Document                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Approval, implemented scope, missing evidence | [Phase status](docs/phase-status.md)                                   |
| Architecture, ownership and source indexing   | [Architecture](docs/architecture.md)                                   |
| Decisions and implementation amendments       | [ADRs](docs/decisions/README.md)                                       |
| Phase 1 acceptance criteria                   | [Phase 1 plan](docs/phase-1-plan.md)                                   |
| Detailed setup and execution limitations      | [Local development](docs/local-development.md)                         |
| Security and trusted execution boundary       | [Security design](docs/security.md)                                    |
| Measured results and limitations              | [Phase 1 report](docs/phase-1-report.md)                               |
| Later phases and approval protocol            | [Roadmap](docs/roadmap.md)                                             |
| Knowledge and skill activation                | [Knowledge](docs/knowledge/README.md), [skills](docs/skills/README.md) |

Workers supervise processes; they are **not host security sandboxes**. Run only reviewed, trusted automation in explicitly authorized environments. Native reports may contain sensitive application evidence and are downloaded rather than executed in the privileged web origin. Runtime artifacts default to 14-day retention, configurable in Workspace and applied at startup. Credentials are not stored in source configuration or version control.

[MIT licensed](LICENSE), selected by the owner. See [third-party notices](THIRD_PARTY_NOTICES.md). Phase 6 is explicitly approved under a sequencing exception retaining the Phase 3–5 CI obligations. Skill activation and external writes still require their own concrete review. Work beyond Phase 6 requires a new approved phase proposal.

Reviewed generation setup, context limits and approval controls: [generation guide](docs/generation.md).

Phase 4 is approved and in validation under an explicit sequencing exception: Phase 3 CI remains outstanding. [API generation guide](docs/api-generation.md) and [current Phase 4 validation](docs/phase-4-report.md) distinguish real native execution from provider fixtures, actual model output and remaining CI checks.

Phase 5 maintenance: [operating guide](docs/maintenance.md), [approved plan](docs/phase-5-plan.md) and [validation report](docs/phase-5-report.md). Diagnosis remains useful without AI; all application and reversal actions require separate exact-diff review.

Knowledge & Skills and Autohealth: [guide](docs/evolution.md), [approved plan](docs/phase-6-plan.md) and [phase report](docs/phase-6-report.md). These workflows run locally without inference; no unvalidated bundle is silently installed.

Interface language is configurable in **Workspace → Execution environment & retention → Default interface language**. Select English or Castellano and save the preferences; the choice persists locally. Test contracts, code and native evidence keep their original language. Failed runs and private validation failures also offer a conversation with the configured AI analysis model to compare solution options; sending a question starts inference, while applying changes and rerunning tests remain separate explicit actions. The latest failed private UI proposal can be revised with **Propose locator correction**, then reviewed and validated as a new diff. Advice receives bounded error/call excerpts from available native traces; new recordings retain sanitized page-state evidence for scoped AI retrieval. See [the generation guide](docs/generation.md#discussing-a-failed-run).
