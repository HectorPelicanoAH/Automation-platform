# ADR 0010 — Recorder evidence, process supervision and privacy

Date: 2026-11-06. Status: accepted within approved Phase 2 scope. Extends ADR 0005; does not authorize Phase 3.

## Decision

A dedicated Node process owns a fresh headed Chromium using the pinned public Playwright API. The backend remains the only metadata writer. A small plain-JavaScript observer records trusted ordinary DOM events and routes through `exposeBinding`/`addInitScript`; the binding exposes no system tools. Source content and evidence remain untrusted, even if an application discovers or invokes the binding. Temporary observation attributes associate candidate locators with the actual target; counts and target identity must both validate. Mutation-sensitive apps can observe these attributes, a known limitation of this capture technique.

A bounded `sendBeacon` backup preserves observations during document unload. Playwright intercepts a random same-origin observation path, fulfills it locally and deduplicates event IDs against the binding transport; the application server receives no recorder POST. A blocked backup becomes a gap. It does not prevent navigation or replay a click.

Public tracing/codegen alone does not supply this event+narration protocol. No private recorder API, general browser engine, CDP endpoint, raw HAR, video or raw trace capture is introduced. Native dialogs/downloads/unsupported surfaces are gaps. A navigation may destroy target detail; retain the observed action and mark missing detailed evidence rather than inventing a locator.

Requests are limited to explicitly approved HTTP(S) origins, with local control-origin aliases denied. Service workers and WebSockets are blocked in this initial recorder and this restriction is surfaced as a gap. Popups and frames retain opaque IDs. Origin expansion requires an authenticated explicit user action. The isolated context has no platform session. Initial raw URL query values exist only long enough to navigate; stored URLs suppress all query values, credentials and fragments. Network metadata omits headers and bodies entirely. This can affect applications that need additional service origins; approve the origin explicitly or retain the gap.

All form values/keystrokes are suppressed by default. Bounded structural target DOM and target ARIA replace whole-document dumps. Form/private ARIA values are omitted; scoped role/label/test-id candidates are validated before being described as unique. Opt-in screenshots mask form inputs, editable/private regions and iframe rectangles; selectors can extend masking. Screenshots are acquired after actions and carry their own acquisition time. Text/screenshot privacy is best effort: arbitrary secrets displayed elsewhere need user masking; audio is raw and explicitly consented, never represented as automatically redacted.

## Persistence and clocks

Private SQLite recording/event tables are introduced at schema version 2, separately from native runner results. UUID artifact names, private directories, hashes, symlink checks, authenticated attachment delivery and retention prevent unrestricted filesystem exposure. One recorder, 30 minutes, 10,000 events, 128 MiB per session, 32 MiB audio, 512 KiB upload chunks, bounded queues, page/frame limits and free-space checks bound ordinary operation; these are not OS security quotas for malicious browser/host code. Retention runs on startup (14-day screenshots / 7-day audio defaults).

Cross-process time uses the host monotonic clock. Each browser document and the microphone producer calibrate their own monotonic source against the session, retain source time/offset/round-trip uncertainty and recalibrate every 30 seconds while available. Background suspension and long chunks remain visible uncertainty/gaps; segment timestamps do not claim word precision. Audio chunks are sequenced and hash-acknowledged; duplicates do not overwrite, missing sequences remain gaps. Stop/cancel flushes within a bound and preserves partial evidence. Abrupt restart marks unfinished sessions interrupted, never silently resumes an old microphone.

Platform-tab `getUserMedia` is explicit and separate from application-under-test permissions. MediaRecorder chunks are transported locally; browser/OS permission and codec support remain prerequisites. Cancellation of a pending permission request prevents any later granted stream from remaining active. The manual versioned transcript works independently. A typed transcription-provider boundary exists, but no automatic engine is installed, activated or contacted. Provider/model installation and actual activation require separately reviewed configuration and validation; manual mode is the only currently available mode.

## Evaluation boundaries

Real headed browser actions and worker lifecycle are exercised directly. The automated microphone fixture is explicitly synthetic input at the `getUserMedia` boundary; MediaRecorder, chunk transport, storage and decoded marker waveform are real. A five-minute real-time test compares actual recorded tone onsets with browser-action timestamps. This does not verify physical microphone hardware or OS consent dialogs. Native Chromium fake-device probes on the local Intel host timed out; do not claim that probe passed or hide it by relabeling the synthetic fixture as a device test. Physical microphone behavior remains a documented manual check.

## Sources

- [Playwright context binding and initialization](https://playwright.dev/docs/api/class-browsercontext#browser-context-expose-binding).
- [Playwright ARIA snapshots](https://playwright.dev/docs/api/class-locator#locator-aria-snapshot).
- [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/).
- [MediaStream Recording](https://www.w3.org/TR/mediastream-recording/).
- [WebRTC testing flags](https://webrtc.github.io/webrtc-org/testing/), used only for the diagnostic probe, not as proof of physical hardware.

- [W3C Beacon processing and unload semantics](https://www.w3.org/TR/beacon/).

The initial recorder permits one continuous audio stream per session. Restarting audio requires a new recording because concatenating independently initialized native streams is not guaranteed to produce a valid playback file. Manual narration remains editable after audio stops. A lost producer after platform-tab reload is explicitly stopped/error-marked; it is not represented as continuing audio capture.

CI exposed a navigation/context race and a concurrent transcript-save race. Observed actions now persist immediately; separately acquired context events retain `sourceEventId`, source timing and acquisition time, with a four-second deadline and explicit gaps. Duplicate transports share the in-flight context promise. Context acquisition never blocks the observed-action stream. Manual editing uses an edit-generation guard so a completed save cannot clear newer unsaved edits. Dedicated delayed-font and delayed-save regression fixtures preserve the original assertions.
