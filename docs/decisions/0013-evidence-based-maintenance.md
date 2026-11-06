# ADR 0013 — Evidence-based maintenance and bounded locator repairs

Status: accepted for the approved Phase 5 scope, 2026-11-06.

## Problem

A failed native execution alone cannot establish whether the product, environment, data or test is wrong. General model-generated fixes risk changing business intent to obtain a pass. Existing recording generation deliberately preserves Page methods and is therefore the wrong entry point for modifying a broken locator.

## Decision

Introduce a maintenance module with persistent diagnoses and repairs. Diagnose only completed failed/interrupted target runs. Preserve actual test/step errors, source hashes, current-versus-executed identity, relationship provenance and bounded Git metadata. Regex symptom recognition produces several possible categories with `symptom` confidence; it never confirms a root cause. Human classification requires a rationale and observed evidence. Missing evidence remains UNKNOWN.

The automatic repair subset is deterministic: replace a literal name/test identifier in existing `getByRole`, `getByLabel` or `getByTestId` calls inside an inspected Page/component. Preserve every other source byte, canonical requirements, original assertions, steps, fixtures and configuration. JSON string encoding prevents literal replacement becoming code insertion. Existing generated-file policy still applies. This static policy is not an execution sandbox.

A separate maintenance record reuses the existing proposal overlay, native execution, fingerprint and journal primitives. It does not manufacture a recording contract or impersonate an AI task. Target content, Git revision and relevant source evidence must remain fresh. Staged canonical feature hashes are checked independently of the executable fingerprint, which intentionally excludes canonical features.

Validate all example rows in the chosen failing feature. Application requires complete scenario-linked passing native evidence and approval of the exact diff. Product regression, data/environment and unknown findings cannot enter locator repair. A controlled product regression must remain failing after the locator correction.

Store the original file content in the private repair record. Offer a separate reversal diff and hash bound to current target content. Reversal requires its own approval, refuses concurrent edits and writes a recovery journal. It restores the original implementation, potentially its original failure, and does not imply a successful rerun. Interrupted journals require manual recovery rather than an automatic overwrite.

Static relationship snapshots use version, content hashes and Git revisions. Step→Page edges follow the supported destructured-fixture/named-import pattern. Scenario→endpoint edges come from manifest declarations and expose current/stale/unavailable source state. They do not establish runtime coverage. No graph service or regression-selection engine is introduced.

## Consequences and limits

This delivers an inspectable, offline-capable workflow without additional inference or credentials. It deliberately requires human investigation for uncertain intent, dynamic selectors, general repairs, indirect fixtures and unsupported source syntax. A reviewer-entered observation is labelled human testimony, not silently elevated to independently captured browser evidence. Native artifacts remain inspectable through Runs.

The validation scope may omit other shared Page consumers. Relationship evidence and the complete selected feature are shown for review; a broad regression selection system remains future work. Both overlays and imported dependencies execute with host privileges. Existing retention removes expired maintenance overlays during startup; normalized diagnoses and reversal journals remain private records. Cross-platform acceptance remains a separate required gate.

Each repaired locator must retain an existing `toHaveCount(1)` assertion in the same supported function/method scope, either on the exact locator expression or its local variable. Indirect/dynamic uniqueness proofs require manual engineering. Native validation still establishes the actual count against the selected environment.
