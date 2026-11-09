# Failure diagnosis and reviewed repairs

## Use the web workflow

1. Run a trusted target against an authorized environment. Open **Runs**, inspect a completed failed target run and choose **Inspect failed run**. Proposal validation runs cannot serve as original target failure evidence.
2. Inspect errors, implementation excerpts, native artifacts, hypotheses and limitations. Git lookup is read-only, restricted to inspected paths, at most five commit IDs and dirty filenames. Non-Git roots report unavailable history.
3. Investigate the selected application independently when necessary. Record the observed evidence, business intent, classification and rationale. Product failures produce findings, not changed expectations. HTTP errors can reflect several causes; category suggestions are symptoms only.
4. For a confirmed locator defect, select an existing Page/component, the failed canonical feature, old locator literal and observed replacement. Inspect the proposed diff. Repeated uses of the same test identifier inside the Page are updated together, at most twelve literal occurrences. The locator strategy, assertion methods and expected business values remain intact.
5. Prepare the private overlay. Review its fingerprint, trusted dependency warning and environment URL, then explicitly trust and run native validation. All example rows of the selected feature must pass. Other features sharing a Page may need additional review/runs; static relationships are incomplete.
6. Inspect real validation results in Runs. Approve the exact repair diff separately to apply it. Rejecting, cancelling or failing validation leaves the managed target unchanged. Source/target edits and revision changes invalidate the evidence.
7. To undo an applied repair, inspect the reversal diff and approve it separately. Concurrent edits prevent reversal. The operation restores the original source and may restore the failure; run again to establish its current outcome.

No AI account is required. This workflow performs no automatic application probing, data mutation or provider request. Starting native validation authorizes the selected runner/environment under the existing execution policy, not arbitrary access to external systems. External application sources remain read-only.

## Supported repair subset

Only literal `getByRole(..., { name: '...' })`, `getByLabel('...')` and `getByTestId('...')` arguments in existing `ui/pages/` or `ui/components/` TypeScript files. Direct edits to steps, assertions, configurations, canonical Gherkin, fixtures and API behavior are unavailable through the repair endpoint. Dynamic selectors, selector-strategy changes, general code edits, assertion changes and automatic API repairs require manual engineering outside this automatic subset.

A current executable failure, explicit reviewer observation and native validation are mandatory. Static syntax checks cannot certify that a new locator is semantically right. Existing uniqueness, visibility and business assertions remain the executable guard. There is no retry/wait/force-click escape hatch.

## Relationships and provenance

`POST /api/intelligence/relationships` with a registered root reference refreshes the bounded incremental index. It returns a versioned relationship snapshot, identity hash, Git revision, content hash, static/declaration confidence, source evidence and limitations. The supported step→Page pattern follows named Page imports in `ui/fixtures.ts` and destructured fixture consumption in step callbacks. Dynamic factories, indirect fixture inheritance and inferred execution coverage are not supported.

Scenario→endpoint relationships are manifest declarations. An opted-in source is refreshed and checked against its declared file hash. Disabled, missing or unsupported references are UNAVAILABLE; changed content is STALE. Changing relevant source contents or Git revision prevents using an earlier diagnosis for application. Hash identities change when supported facts/revisions change; they are not a claim of exhaustive dependency discovery.

## Persistence and recovery

Diagnoses, human reviews, source snapshots, repairs, native run IDs, exact hashes and reversal metadata live in the private local SQLite store. Apply and reversal journals live in its maintenance directory. The original source is retained for exact reversal. Never put private run/trace or secret-bearing evidence into Git. Inspect APPLY_FAILED recovery journals before manual action; do not repeatedly apply a partially recovered change. Overlay cleanup uses the configured retention days during startup. The UI lists the latest 100 records; long-running stores may need a later archival policy.

## Reproduce validation

Use the pinned runtime and prerequisites in the README. After installation:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm exec playwright test --config tests/playwright.config.ts tests/maintenance-ui.spec.ts tests/generation-ui.spec.ts tests/api-generation-ui.spec.ts
```

The maintenance UI test uses disposable targets and controlled local demo apps. It proves actual locator failure, cancellation, incorrect-product failure, positive overlay validation, independent target execution, unavailable environment and reviewed reversal. A second native Karate control deliberately requests a missing synthetic precondition, retaining all original business assertions and reporting real failure. Provider fixtures in generation regression checks are labelled fixtures; none of these maintenance checks performs inference.

Each repaired locator must retain an existing `toHaveCount(1)` assertion in the same supported function/method scope, either on the exact locator expression or its local variable. Indirect/dynamic uniqueness proofs require manual engineering. Native validation still establishes the actual count against the selected environment.
