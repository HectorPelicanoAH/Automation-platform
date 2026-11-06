# Recorder conventions

Source: Phase 2 implementation and synthetic acceptance fixtures; confidence limited to tested event types and environments. See ADR 0010 and the Phase 2 report. Source revision must be recorded in that report after validation; no AI skill is activated by this document.

- Browser capture is observation, never a business assertion or implicit permission. Do not promote a click or a network response to an expected outcome.
- Check both locator count and actual target match. A unique candidate can still refer to the wrong element. Missing/detached detail stays a gap; do not generate selectors from it without new evidence.
- Keep source monotonic timestamp, offset, uncertainty, page/frame ID and screenshot acquisition timestamp. Delayed screenshots are not exact action-time state.
- All query values and form values are omitted. Do not request raw payload capture as a shortcut to infer requirements. Mask private regions explicitly and review screenshots before sharing. Audio needs separate consent and may contain secrets.
- Sequential audio upload acknowledgments and bounded backlog matter. MediaRecorder timeslices are approximate; a large/delayed/lost chunk is not silently complete. Only the full ordered stream is suitable for playback; later chunks need not be independently decodable.
- A native-device permission failure must leave manual timestamped narration available. Synthetic timestamped PCM validates the recording pipeline, not the user's microphone. Report those results separately.
- Stop recording closes the controlled browser. Stop microphone ends tracks in the platform tab. Server disconnect or a late permission result must not leave microphone tracks active.
- Manual transcript revisions express narrated intent and remain independently versioned; no scenario inference is implemented before Phase 3.

- Binding callbacks can race document unload. Use the bounded intercepted beacon backup and event identity deduplication; do not block navigation on evidence extraction or replay the user action. A CSP-blocked backup is a gap.

- The passive recording badge is recorder instrumentation, never an application requirement or business assertion. One continuous audio stream belongs to each recording; restarting audio requires a new session.

- Persist observed intent before optional DOM/ARIA/screenshot enrichment; retain separately linked context and a deadline. Never block action intake on a document that may be unloading. A save response must not clear edits made after that save began.

- PCM decoded duration can differ from container presentation time when samples arrive discontinuously. The benchmark checks actual PCM duration against monotonic capture span before scoring tone alignment. The pinned-Chromium test fixture supplies 48 kHz timestamped PCM frames at the getUserMedia boundary, paced against monotonic wall time; it checks producer lag and preserves diagnostics. A virtual AudioContext source proved discontinuous on CI and cannot certify alignment. Neither synthetic source certifies physical hardware.
