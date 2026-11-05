# Recorder architecture and feasibility

This document designs Phase 2; no recorder is implemented in Phase 0 or Phase 1.

## Decision and constraint

Use a fresh headed Chromium controlled by Playwright. The user interacts with that window. A small observation script captures supported user actions; Playwright remains responsible for browser lifecycle, pages/frames, navigation, screenshots, network events and locator evaluation. Do not create an independent browser driver or depend on private recorder protocols.

Playwright's [test generator](https://playwright.dev/docs/codegen) records interactions in Inspector and helps choose locators. Its public documented workflow is useful as a fallback/reference, but is not a documented embeddable event+narration API. The [tracing API](https://playwright.dev/docs/api/class-tracing) records browser activity and does not record application business assertions. Therefore a trace archive alone cannot implement this product recorder.

## Capture flow

1. User selects a URL and capture policy in Record. Validate allowed schemes/origins, limits, external navigation policy, storage and browser readiness. Use an isolated profile, not the user's normal browsing profile.
2. Start a session and recorder worker, install observation using public initialization/binding APIs, then open the controlled browser. Bindings accept only schema-validated bounded evidence and expose no filesystem/process actions.
3. Capture navigation and supported pointer/keyboard activation, fill completion, selection, submission and frame/page transitions. Debounce edits into meaningful value changes; never persist sensitive keystrokes. An action is observed intent, not proof it succeeded.
4. Associate a page/frame, sequence, timestamps, relevant DOM excerpt, roles/names and candidate locators. Use public scoped ARIA snapshots when available in the pinned version. Evaluate locator uniqueness in the correct frame and component scope at capture time; record unmatched/ambiguous candidates honestly.
5. Capture allowlisted network metadata, bounded screenshots with masking and optional explicitly permitted traces. Relate events through page/frame and time windows; do not claim correlation proves causality.
6. Capture microphone audio in the platform's local browser tab, not inside the application-under-test origin. Use permission-gated Media Capture and MediaRecorder, bounded upload chunks and sequence acknowledgments. The platform keeps an obvious recording/stop indicator while focus is in controlled Chromium.
7. Stop browser/audio capture, flush acknowledged chunks, finalize manifests and show a timeline. Missing chunks, lost frames or failed capture become visible gaps. Cancellation preserves partial evidence under policy.

Microphone capture and media encoding are governed by [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) and [MediaStream Recording](https://www.w3.org/TR/mediastream-recording/). Browser/OS permission and supported codecs must be detected; no always-on microphone or silent permission grant.

## Timeline and transcription

The backend assigns monotonic session sequence and receipt time. Browser and microphone producers retain local monotonic times and calibrated offsets into session time. Use repeated ping/ack samples to estimate offset, drift and uncertainty; keep original source timestamps. Wall-clock time is metadata, not a reliable synchronization clock.

Target acceptance for the local demo: a scripted audible/text marker and UI action align within 500 ms over a 5-minute session, with reported uncertainty; narration transcript segment boundaries may be coarser and must be labeled. If background-tab throttling or microphone suspension breaks this threshold, surface uncertainty and allow manual alignment. Do not imply word-level synchronization when the provider only returns whole-segment text.

Transcription port accepts chunk/recording artifacts, language/configuration and cancellation; returns timestamped segments when supported, confidence if available, provider/version and errors. P2 requires an operational manual transcript editor and a configurable adapter boundary. An external/local automatic provider is enabled only when an explicitly chosen engine is installed/configured and validated; do not bundle a large transcription model as a hidden prerequisite. A manual segment is labeled manual, not speech recognition.

Keep original transcript revisions and user corrections. In later analysis classify evidence as:

- `OBSERVED`: directly captured UI/network fact with source references.
- `NARRATED`: explicit spoken/manual requirement with transcript span.
- `INFERRED`: proposed interpretation requiring user confirmation.

An observed title does not establish all business rules. A narrated expectation does not prove the current UI met it. Missing requirements remain open questions in scenario proposals.

## Supported scope and explicit limitations

Initial P2 matrix: Chromium on initial supported OS targets; ordinary accessible DOM forms, click/fill/select, normal navigation, SPA transitions, same-origin frames, multiple pages/popups and refresh recovery. Include a cross-origin frame test and report gaps if instrumentation is blocked. Do not bypass browser isolation to obtain evidence.

Canvas/WebGL, closed shadow roots, browser-native UI, drag-and-drop, file chooser contents, downloads, service-worker-hidden network behavior, MFA, passkeys and third-party payment widgets may be incomplete. Record semantic/manual notes for unsupported interactions. Network capture must label what was observed; browser logs are not exhaustive packet capture. Do not replay risky actions automatically.

Existing local/external HTTP(S) apps are selectable under permissions. Block `file:`, browser/internal URLs and automatic navigation to unrelated origins; prompt for recording-origin expansion. The controlled browser has no automatic access to platform session tokens or secrets. Localhost application-under-test access is allowed deliberately, not via a generic server fetch proxy.

Raw screenshots, DOM, audio and traces can contain personal data; follow [capture privacy](security.md). Optional video is not required for P2 and will be scheduled only if its value justifies storage/privacy cost.

## Phase 2 feasibility exit

Before building a full timeline UI, prove public-API action capture in headed Chromium, sensitive-field suppression, frame/page handling, crash recovery, microphone permission denial fallback and clock alignment. If a public API is insufficient, report the missing event types and propose a narrowly scoped extension or Inspector-assisted workflow for approval. Do not silently replace the requirement with screenshots or simulated events.

The final P2 demonstration captures the real promotion demo, reloads its persisted timeline, links action/evidence/narration spans, and shows a deliberately missing chunk as incomplete. Scenario discovery and generated Gherkin wait for Phase 3.
