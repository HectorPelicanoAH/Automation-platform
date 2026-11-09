# Failure conversation to reviewed code and reusable page evidence

Owner request on 2026-11-09: connect failure advice to code corrections, let AI inspect error traces, and retain page DOM/accessibility during recording. This is an authorized correction of existing functionality; Phases 3–6 remain VALIDATION with CI pending. No active skill is changed or external target automatically rewritten.

## Workflow

A conversation associated with the latest **failed private Playwright proposal** offers **Propose locator correction** for each answered option. The current question box can supply additional instructions. This explicitly invokes the configured implementation model and can consume tokens. The output is a new proposal, linked to the parent diff hash, failed run and advice option. It does not mutate the parent, target, contract or execution history. **Review and validate correction** opens the new diff in Generate. Prepare it, explicitly trust and run native validation, then separately approve application of the exact passing diff.

The supported correction is deliberately narrow: AST-located literal accessible names, labels, test IDs or `getByRole` roles in proposed Pages/components, with existing uniqueness assertions. All assertions and other executable statements remain byte-for-byte unchanged. No arbitrary regenerated methods, waits, retries or force actions are accepted. Unsupported/missing-evidence output fails explicitly. Applied tests retain the existing reviewed maintenance workflow; API and general code repairs are not added here. The failed run must match the current proposal's executable fingerprint and validation ID. A stale proposal or changed approved contract cannot be revised against an unrelated run.

## Trace access

Explicitly sending a failure question shares bounded, redacted native trace call/error excerpts, when the registered Playwright trace is available. Archives are hash-checked and read in memory: no extraction, shell commands, screenshots, resource files, request/response bodies, form values or complete DOM snapshots are uploaded. Allowlisted before/after events for failed calls and a small log tail retain artifact/member/call provenance; importantly the initial failing selector is retained even when repeated polling fills the log. Missing, expired, modified, malformed, unsupported or over-budget traces are marked unavailable. Native artifacts remain local and can still be inspected through existing runner tools.

Limits: two registered trace archives, 32 MB compressed each; at most 2,000 archive entries, 4 MB per selected trace member, 8 MB inflated trace data, 10,000 trace events, and 16 KB of delivered selected events per archive. Supported ZIP methods are stored/deflate, excluding encrypted, multi-disk and ZIP64 inputs. Trace redaction remains best effort for arbitrary visible text.

## Recording evidence

New recordings sample allowed page/frame states after navigation/load and supported observed actions, with 500 ms coalescing. A saved context event contains sanitized structural DOM, reconstructed accessibility, page/frame, timestamp, URL with suppressed query values, document language, truncation and explicit accessibility provenance. Editable controls, configured masks, private regions, hidden regions, scripts/styles, handlers, resource URLs and iframe contents are excluded. Approved child frames are captured independently. Links retain their accessible link semantics with a placeholder destination.

Accessibility is derived with Playwright from the sanitized document in a separate headless helper browser with a JavaScript-disabled, network-denied context. The helper is reused during a recording and closed at stop, without opening windows in the demonstration browser. It is **not** the original browser's complete accessibility tree: styling, shadow DOM and removed private/editable content can affect semantics. It is evidence for locator selection, never proof of live uniqueness. Existing target-level action snapshots and candidate match counts remain available. No page is modified to obtain the snapshot.

Sampling is bounded to 100 saved states per recording, 64 observed frames and 30 pending frames with one queued snapshot per frame, 1,500 visited nodes, depth 24, approximately 6,000 serialized characters and 7 KB per saved DOM/accessibility excerpt. Consecutive unchanged states are deduplicated per frame; truncation is explicit. Optional enrichment does not delay observed action publication. Failed capture emits a gap. Transient states between samples may be missed. Old recordings are not retroactively reconstructed.

Generation prompts contain snapshot metadata; `qa_recording_snapshot` retrieves one saved event from the task's recording, through the existing 16-call/64 KB retrieval budget. It cannot select another recording or access the filesystem. Task history records snapshot sequence/hash/bytes; changes or expiry invalidate retrieved evidence. Snapshot bodies expire using the screenshot retention period, on reads and startup cleanup. Expiry removes DOM/accessibility from event rows and preserves an expired marker; contracts based on expired evidence require fresh analysis/review. Existing normalized event metadata and conversation history retain their existing lifecycle; this is not a general deletion/export feature.

## Validation

See [safe execution record](evaluations/failure-revision-and-page-evidence-2026-11-09.json) for executed commands, fixture corrections and final outcomes. Tests use synthetic providers and local demonstration pages, not the owner's website or live model credentials. A native negative run must remain FAILED after a new proposal passes; no failure history or assertions are overwritten.
