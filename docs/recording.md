# Recorder architecture and feasibility

Phase 2 implements this recorder within the approved scope. See [ADR 0010](decisions/0010-recorder-evidence-and-privacy.md), [phase plan](phase-2-plan.md) and [validation report](phase-2-report.md) for actual behavior and evidence. Design requirements below are qualified by the implemented limits at the end.

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

## Implemented operation and limits

Use the Record section after a private local launch. Top-level navigation and captured evidence are restricted to HTTP(S) origins explicitly approved for the session. Images, styles, scripts, API requests and embedded frames may load from additional origins without adding them to the capture allowlist. The server supplies the control origin; all resource, frame, navigation and WebSocket requests to it or its loopback aliases at the same port are denied. Top-level origin changes require the explicit approval button, not a navigation redirect. Use the final HTTPS URL when a site upgrades HTTP. No application/source repository is modified.

One supervised recorder opens a fresh headed Chromium. Public observation supports ordinary clicks, completed fill/change, selection, submit, keyboard activation, document/SPA navigation, refresh, pages/popups and instrumentable frames. Input values and keystrokes are omitted. Locator evidence retains count and whether the candidate matches the observed target. Native dialogs are dismissed with a gap; downloads are cancelled. Canvas, closed shadow roots, drag/drop, file contents and browser-native UI are unsupported; incomplete evidence is not inferred behavior. Service workers remain blocked so requests cannot silently bypass recording policy. WebSockets connect normally except to the platform control origin; their messages are not captured and this evidence gap is explicit.

Default network storage is method/status/resource type and redacted URL, never headers/bodies. All query values are suppressed, not only known secret keys. Target DOM is structural; form/private ARIA values and ARIA URL fields are omitted. Screenshots are optional, limited to main-frame interactions at most once per second; form/private regions and iframe rectangles are masked. Oversized images are omitted with a gap. They are acquired after an interaction and retain acquisition time. Arbitrary secrets displayed elsewhere, short path tokens and raw spoken secrets need explicit user care/masking; no universal redaction guarantee.

Microphone capture uses the platform tab, never the application window. Explicit per-session consent and a separate user action request `getUserMedia`; supported MediaRecorder codecs are detected. If permission remains pending, Stop recording cancels capture and any later granted stream is closed. Denial/unavailability leaves manual timestamped narration operational. Server disconnection stops live microphone tracks. Chunks upload sequentially with bounded backlog, hash/idempotency acknowledgments and sequence gaps. Playback concatenates the ordered stream; individual later chunks are not necessarily independently playable. A missing chunk can make playback incomplete.

The only available transcription mode is manual. Transcript revisions preserve NARRATED provenance, source and timestamps with conflict detection. No automatic engine is configured or contacted. A typed provider boundary allows later explicitly configured integration, but there is no working automatic provider to select today.

Budgets: one recording, 30 minutes, 10,000 events, 128 MiB session data, 32 MiB audio, 512 KiB per audio chunk, 2 MiB per artifact, 8 pages and 64 frames over a session. Network/backlog omissions become gaps. Ordinary uploads and shutdown are bounded; a forced shutdown is interrupted/incomplete. Retention defaults to 14 days for screenshots and 7 days for audio, configurable before capture and applied at startup. All payloads are private/checksummed and downloaded using the authenticated session; raw traces/video are absent.

Clock calibration retains source/offset/round-trip uncertainty and repeats every 30 seconds when the producer is running. Background suspension can reduce precision; long audio chunks are coarse and gap-marked. Manual segments do not claim word-level transcription accuracy.

### Manual physical-device check

Automated tests use explicit synthetic input, not the host microphone. In your normal browser, start a consented session, allow browser/OS microphone access, speak a non-sensitive phrase while interacting, stop the microphone, load local audio, inspect timing and stop the recording. Repeat denial to confirm the manual fallback. This hardware/OS permission check has not been automatically certified. A local native Chromium fake-device diagnostic timed out and is recorded as a limitation, not a passing device test.

A recording currently supports one continuous audio stream. After stopping audio, start a new recording for another stream; manual transcript editing can continue in the existing session. Reloading the platform tab loses its microphone producer; Stop microphone records the loss as a gap. Keep one platform control tab open during capture.

The controlled top-level windows show a passive recording badge. It belongs to the recorder, not the application business UI; stop from the platform or close the controlled browser to retain a partial session.

Observed actions are persisted immediately. Optional DOM/ARIA/screenshot acquisition is a separately timestamped context event linked by source event ID and bounded by a four-second deadline. Selecting an action shows its available linked context; a context timeout remains a gap. Editing during an in-flight transcript save preserves the newer unsaved text.

## Resource compatibility amendment — 2026-11-08

The owner requested optional source context and complete page resource loading after a real Mango recording showed blocked cross-origin requests. Resource loading is now separate from observation permission. A public page can contact its normal third-party services; their network bodies, headers and frame interactions are not automatically collected. Approve an additional origin only when navigation or observation there is intended. This does not bypass browser CORS/CSP, certificate validation, website access controls or anti-automation checks. Service-worker-dependent applications can still have limitations; no universal website compatibility is claimed.

## Recording refresh policy — 2026-11-08

The control panel discovers an already active session once at startup and refreshes the session list when Record opens or a recording action explicitly requests it. Idle or completed recordings do not poll, even while switching workbench views. During an active recording only that session's metadata/new events are requested, one second after the prior request completes. This supervision remains active across workbench navigation so microphone/worker termination is detected. Terminal event pages drain once through the serialized cursor, then polling stops. A failed request pauses polling and stops a live microphone; **Refresh sessions** retries explicitly. Another browser's newly started session becomes visible on reopening Record or refreshing; there is no cross-window push subscription. Generate refreshes its recording choices on entry/actions and meaningful recording-choice changes (name, status or incomplete flag), without polling the list during agent tasks. Stopping a background recording updates the visible Generate selector through a React notification.
