# ADR 0005: Public browser observation and calibrated narration evidence

Date: 2026-11-05. Status: accepted planning baseline; recorder feasibility remains unproven.

## Context

Real human demonstrations need user actions, DOM/accessibility context, locator candidates, network evidence and synchronized narration. Existing codegen/trace workflows are useful but do not by themselves provide the whole product recording stream.

## Decision

Use a fresh headed Playwright-controlled Chromium and public lifecycle/observation APIs. Supplement with a small bounded browser event observer, not another automation driver. Prefer semantic accessible locators, validated within page/frame/component scope. Capture limited evidence under explicit privacy policy.

Record microphone in the platform tab through permission-gated browser APIs. Store chunk acknowledgments, calibrated monotonic offsets, original timestamps and uncertainty. Manual timestamped transcript editing is required; automatic transcription is configurable and optional until a provider is actually validated. Distinguish observations, narrated requirements and inferences requiring confirmation.

## Alternatives

Parsing codegen text loses provenance and timing. Traces alone do not establish business requirements. A browser extension could improve capture but expands installation/permissions; private recorder APIs create upgrade risk. Recording microphone within arbitrary test origins expands privacy risk.

## Consequences

Cross-origin frames, native controls, closed shadow DOM, canvas and background throttling may have gaps. Show incomplete evidence rather than inventing actions. Raw traces/audio/screenshots may contain secrets and cannot be presumed fully redacted. Video is optional and excluded from minimum P2.

## Validation and revisit

P2 first proves public capture, frame/page tracking, redaction, microphone denial fallback and 500 ms local marker alignment over 5 minutes. If impossible, revise the approved plan with explicit limitations before claiming a working recorder. See [recorder design](../recording.md).
