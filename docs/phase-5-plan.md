# Phase 5 — Intelligent maintenance

Status: VALIDATION. Local implementation and acceptance are recorded in the [report](phase-5-report.md); three-system CI remains pending. Owner explicitly approved Phase 5 and the sequencing exception on 2026-11-06. Phases 3 and 4 remain VALIDATION with required CI outstanding.

## Objective and scope

Diagnose actual failed runs, retain source-linked evidence and uncertainty, propose minimal locator repairs, inspect exact diffs, validate impacted canonical features in a private overlay, approve application separately and support reviewed reversal. Add bounded recent Git change lookup and versioned static capability relationships using the existing index. All core functionality works without a model.

## Decisions and tradeoffs

- Deterministic symptoms produce hypotheses, never proof of product intent. A reviewer records an explicit classification and rationale. Product/environment/data findings cannot generate locator repairs. No application probing is automatic: native validation requires the chosen environment and an execution grant.
- Initially repair only one literal argument of an existing getByRole/getByLabel/getByTestId call in an existing Page/component. Preserve all other bytes, canonical Gherkin, assertion expressions, fixture/step structure and configurations. Require independently reviewed locator evidence. Dynamic locators, selector strategy changes and general code repairs require manual engineering outside this automatic subset.
- Reuse existing staging, path checks, fingerprints, runner evidence and journalled application. A repair has its own persisted identity and freshness checks rather than pretending it came from a recording generation task.
- Native validation runs the whole affected feature, including all example rows. This is intentionally broader than one failing row because a Page can be shared. Record related dependents for review; no intelligent regression engine.
- Static graph edges describe imports/fixture use and declared scenario/API bindings with source hashes and provenance. They are not inferred runtime coverage. Bounded Git commands read names and commit IDs, never execute repository configuration, hooks or textconv.
- No new AI credential use, dependency installation by the platform, active skill activation or autonomous knowledge evolution.

## Acceptance criteria

| ID    | Measurable evidence                                                                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P5-01 | Versioned cases distinguish locator symptoms, product mismatch, unavailable environment and invalid setup data; ambiguous evidence remains UNKNOWN; every finding links to the failed run and source hashes, with human-confirmed intent recorded separately. |
| P5-02 | Actual native locator failure is repaired through an existing Page, original assertions preserved byte-for-byte outside the locator literal; all feature example rows pass in overlay and independent target execution.                                       |
| P5-03 | Wrong product data still fails after the same locator repair; cannot repair confirmed product/environment/data findings or change assertions through the repair endpoint.                                                                                     |
| P5-04 | Reject, cancel, untrusted execution and stale base/source/stage paths preserve target. Exact validated diff application and separately reviewed reversal are journalled; concurrent edits prevent reversal.                                                   |
| P5-05 | Versioned graph answers step→Page via fixture/import evidence and scenario→endpoint declarations. Edits/deletions/revision changes invalidate snapshots. Recent-change lookup is bounded to inspected paths; non-Git roots report unavailability.             |
| P5-06 | Web Runs exposes diagnosis, rationale, diff, execution trust, actual validation results, approval and rollback. Loading, empty, failure and cancellation states are real.                                                                                     |
| P5-07 | Typecheck, lint, formatting, deterministic security/domain tests and affected browser/native flows pass locally. Required three-system CI remains explicitly pending unless actually executed.                                                                |

## Dependencies and risks

Existing normalized reports may lack source locations or business intent. Such evidence cannot prove a root cause. Read-only target inspection and explicit reviewer observations fill gaps without inventing expected behavior. Private workers execute with host privileges, not a security sandbox. Shared Pages may affect features beyond the selected one; dependency edges and explicit validation scope must be displayed. Git history can be absent/shallow. The supported OS matrix remains Ubuntu x64 and macOS ARM64/Intel; local Intel evidence alone does not complete it.

## Validation and stopping rule

Versioned fixtures plus real positive/negative native runs establish the supported subset. Export evidence without credentials or personal paths. Update architecture/security, operating guidance and curated diagnostic knowledge. Produce the mandatory phase report and stop before Phase 6, which requires `APPROVE PHASE 6`.
