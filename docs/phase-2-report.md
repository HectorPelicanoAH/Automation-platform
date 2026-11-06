# Phase 2 completion report

PHASE: 2 — Recorder

STATUS: VALIDATION. Local recorder checks passed; required final cross-platform matrix is pending. This is an interim report.

## IMPLEMENTED

Real headed Chromium under a supervised process; ordinary interaction/document/SPA/page/frame evidence through public APIs; target DOM/ARIA/locator count and target-match evidence; opt-in masked screenshots; privacy-limited network events and origin approval; persisted recording timeline and artifact integrity/retention; microphone opt-in and MediaRecorder upload/acknowledgments; operational manual timestamped transcript revisions; explicit gaps, cancellation, crash/restart recovery and bounded budgets. Record workbench supports session inspection, source evidence, audio playback, transcription history and visible capture controls across navigation.

No source/automation repository writes, generated scenarios, AI, video, raw traces or automatic transcription engine. The typed transcription-provider boundary is present; manual mode is the only available mode. No product skill is activated.

## ARCHITECTURAL DECISIONS

[ADR 0010](decisions/0010-recorder-evidence-and-privacy.md) records process isolation, public observation, monotonic clocks, metadata-only network capture, privacy, quotas and evaluated limitations. SQLite adds recording/event tables at schema version 2 without rewriting Phase 1 records. Inputs and query values are omitted by default; audio is explicitly raw and consented. A detached target cannot justify an invented locator.

## VALIDATION

Local on macOS 15.7.3 Intel, pinned Node 24.22.2 / Playwright 1.65.0 / Chromium 158:

- Typecheck, lint, formatting, build and 13 domain/storage/HTTP/security tests passed. Final JavaScript dependency audit returned zero known advisories (all severities); no new runtime dependency was introduced.
- Real headed capture passed click/fill/select/submit/navigation/SPA/refresh, popup, same-origin/cross-origin frame evidence, candidate uniqueness and private-input/query suppression. Canvas is explicitly unsupported.
- Real Record UI/worker passed denied-microphone fallback (explicit denial fixture), two manual transcript revisions, cancellation, process-group exit, persistence across restart and interrupted worker-crash recovery.
- Historical local five-minute synthetic Web Audio samples met the marker threshold, but later PCM-duration checks exposed a discontinuous source on CI. Those samples do not certify the final synchronization criterion. A timestamped PCM fixture with producer-lag and decoded-duration gates is under validation; actual MediaRecorder, transport and storage remain in the tested path.
- Missing audio sequence, duplicate-content conflict, malformed/timing/size/type denial, transcript conflicts, artifact integrity/symlink denial and expiry have deterministic integration evidence. Restart marks unfinished capture interrupted. Oversized native PNGs are omitted with an explicit gap; early startup cancellation closes the worker; a passive badge makes capture visible in the controlled window.
- Native Chromium fake-device probes on the local Intel host did not return a stream within the probe timeout. They did not pass. Physical microphone hardware and actual OS permission dialogs remain a manual validation limitation; see [device check](recording.md#manual-physical-device-check).

Physical microphone hardware/OS permission dialogs and non-Chromium recording codecs were not executed as passing checks. The native fake-device timeout does not certify or disprove a physical device. Production uses explicit browser `getUserMedia`, never the synthetic test override. Do not describe synthetic coverage as a successful hardware capture.

Commands: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, `pnpm test:smoke`. On Linux use `xvfb-run --auto-servernum pnpm test:smoke` for genuine headed recorder execution. The full suite retains Phase 1 real Playwright/Karate regression. Initial matrix [42165213205](https://github.com/HectorPelicanoAH/Automation-platform/actions/runs/42165213205), code `4c32acdef78d3724cb2b79e91a8519e98113388d`, failed: submit observation was blocked by optional context, newer transcript edits lost their dirty flag after a save response, and Intel missed the second synthetic tone. Ubuntu/ARM decoded-marker timing passed. Fixes separate immediate observations from bounded linked context, guard concurrent edits, and use an explicit null output sink for the synthetic source. The two-tone/500 ms gate is unchanged. Corrected code: `a41717c3f5634b62e3a02060e213d6565c907745`; [new matrix 42169379307](https://github.com/HectorPelicanoAH/Automation-platform/actions/runs/42169379307) exposed a further synthetic-source failure on Apple Silicon. Its six other browser cases passed; its synchronization score is invalid because decoded PCM duration was only about 95 seconds over 308 seconds of capture. Source-rate/output-graph corrections in `ff85829` also failed the early duration gate on both macOS runners ([42171848652](https://github.com/HectorPelicanoAH/Automation-platform/actions/runs/42171848652)). Timestamped PCM input and producer-lag gates require a further matrix run. None of the failed jobs is counted as passing. Superseded runs were cancelled when fixes or acceptance fixtures changed; cancellations are not passes.

### Acceptance traceability

| Criterion | Current evidence                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2-01     | Actual headed actions, trusted DOM select, submit/navigation, SPA, popup/refresh and same/cross-origin frame identity; public transport and explicit unsupported-surface gaps.                                                       |
| P2-02     | Native DOM/ARIA/locator/screenshot capture persisted and reopened; actual promotion-demo composition check authenticates inspection after application restart. Worker lifecycle and Record UI reload are separately exercised.       |
| P2-03     | Source/offset/uncertainty retained; five-minute decoded-tone marker check with continuous PCM and producer-lag gates is under validation.                                                                                            |
| P2-04     | Explicit synthetic device-boundary/denial fixtures exercise actual MediaRecorder, acknowledgments and manual revisions; missing sequence and lost producer are gaps. Physical devices and real OS permission dialogs are unverified. |
| P2-05     | Form/private/query/header/cookie/body secret fixtures absent from persisted ordinary evidence; known regions visibly masked; control/internal/unapproved origins denied. Raw consented audio remains sensitive.                      |
| P2-06     | Real stop/cancel/startup cancellation and worker crash; interrupted restart; payload/storage/image quotas, integrity/symlink/auth and artifact expiry.                                                                               |
| P2-07     | Actual Record UI, timeline, private artifacts, local audio path and transcript revisions; unavailable automatic transcription is explicit. No scenario generation.                                                                   |
| P2-08     | Local type/lint/format/build/security/integration checks pass; final seven-browser-test plus Phase 1 native runner suite is awaiting matrix results.                                                                                 |

Additional reproducible local promotion check, from repository root: `node --import tsx docs/evaluations/phase-2-demo.mjs` (Linux GUI alternative: prefix with `xvfb-run --auto-servernum`). It runs the real demo, records actual UI evidence, reopens application state, authenticates the HTTP handlers and checks the retained native PNG and ARIA. It is an in-process capture/storage composition check; it does not substitute for the separate actual worker supervision test. Output is under ignored `test-results/` with synthetic data only.

## KNOWLEDGE

Updated recorder operation/privacy/limitations, README, runtime ADR, [recorder conventions](knowledge/recorder-conventions.md), roadmap/status and evaluations. No active skills changed or activated, no AI/token savings claimed.

## QUALITY

Workers are not host sandboxes. Unsupported browser-native surfaces, closed shadow DOM, file content, drag/drop, WebSockets and service-worker behavior remain gaps/limits. Temporary observation attributes can affect mutation-sensitive apps. Screenshots follow actions; source timestamps and acquisition times are separate. Known private regions/form fields are masked, but arbitrary visible/spoken secrets require deliberate user policy. Native hardware consent remains unverified. Automatic transcription is unavailable. Audio capture is one continuous stream per recording; start a new recording after stopping audio. Platform-tab reload loses its microphone producer and must retain a gap/manual fallback. Retention runs at startup. Timing measurements are narrow synthetic samples, not a universal drift guarantee.

## NEXT PHASE

Phase 3 remains PROPOSED: review recording evidence, discover business scenarios, propose Gherkin for human review, retrieve bounded repository context, reuse Pages/steps/fixtures, stage Playwright changes with diff approval, validate real execution. It depends on completed P2 and explicit provider/security configuration. No automatic transition.

## APPROVAL REQUIRED

Finish the already approved Phase 2 validation before requesting Phase 3. No Phase 3 work is authorized by this report. Final completion status must identify remaining device/unsupported-surface limitations and executed matrix evidence.
