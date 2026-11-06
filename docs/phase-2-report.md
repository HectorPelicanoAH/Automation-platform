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

- Typecheck, lint, build and 13 domain/storage/HTTP/security tests passed.
- Real headed capture passed click/fill/select/submit/navigation/SPA/refresh, popup, same-origin/cross-origin frame evidence, candidate uniqueness and private-input/query suppression. Canvas is explicitly unsupported.
- Real Record UI/worker passed denied-microphone fallback (explicit denial fixture), two manual transcript revisions, cancellation, process-group exit, persistence across restart and interrupted worker-crash recovery.
- Real-time five-minute synthetic audio pipeline passed: 313,317 ms session, 152 acknowledged chunks; decoded audio tones versus genuine browser actions differed by 36.6 ms and 60.3 ms, below 500 ms over five minutes. Source/offset/uncertainty retained. Audio was a Web Audio synthetic MediaStream injected at the device boundary; actual MediaRecorder, chunk transport, storage and waveform decoding were used. This is not a physical microphone test.
- Missing audio sequence, duplicate-content conflict, malformed/timing/size/type denial, transcript conflicts, artifact integrity/symlink denial and expiry have deterministic integration evidence. Restart marks unfinished capture interrupted.
- Native Chromium fake-device probes on the local Intel host did not return a stream within the probe timeout. They did not pass. Physical microphone hardware and actual OS permission dialogs remain a manual validation limitation; see [device check](recording.md#manual-physical-device-check).

The native fake-device timeout does not certify or disprove a physical device. Production uses explicit browser `getUserMedia`, never the synthetic test override. Do not describe synthetic coverage as a successful hardware capture.

Commands: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, `pnpm test:smoke`. On Linux use `xvfb-run --auto-servernum pnpm test:smoke` for genuine headed recorder execution. The full suite retains Phase 1 real Playwright/Karate regression. Cross-platform results and final code revision will be added after execution; configured jobs alone are not passing evidence.

## KNOWLEDGE

Updated recorder operation/privacy/limitations, README, runtime ADR, [recorder conventions](knowledge/recorder-conventions.md), roadmap/status and evaluations. No active skills changed or activated, no AI/token savings claimed.

## QUALITY

Workers are not host sandboxes. Unsupported browser-native surfaces, closed shadow DOM, file content, drag/drop, WebSockets and service-worker behavior remain gaps/limits. Temporary observation attributes can affect mutation-sensitive apps. Screenshots follow actions; source timestamps and acquisition times are separate. Known private regions/form fields are masked, but arbitrary visible/spoken secrets require deliberate user policy. Native hardware consent remains unverified. Automatic transcription is unavailable. Audio capture is one continuous stream per recording; start a new recording after stopping audio. Platform-tab reload loses its microphone producer and must retain a gap/manual fallback. Retention runs at startup. Timing measurements are narrow synthetic samples, not a universal drift guarantee.

## NEXT PHASE

Phase 3 remains PROPOSED: review recording evidence, discover business scenarios, propose Gherkin for human review, retrieve bounded repository context, reuse Pages/steps/fixtures, stage Playwright changes with diff approval, validate real execution. It depends on completed P2 and explicit provider/security configuration. No automatic transition.

## APPROVAL REQUIRED

Finish the already approved Phase 2 validation before requesting Phase 3. No Phase 3 work is authorized by this report. Final completion status must identify remaining device/unsupported-surface limitations and executed matrix evidence.
