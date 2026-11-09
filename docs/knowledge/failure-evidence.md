# Failure evidence and locator revisions

Source: implementation and local synthetic/native acceptance in `tests/failure-revision.test.ts` and `tests/failure-revision-ui.spec.ts`. Confidence applies only to the bounded supported subset. See the [2026-11-09 correction report](../usability-corrections-2026-11-09.md) and its execution record for outcomes.

- Read the native trace's failed call **before and after** events as well as its log tail. Repeated polling can otherwise displace the selector/expression that explains the failure. The actual pinned Playwright trace uses `method: expect` and `params.expression: to.have.count`, not necessarily an `apiName: toHaveCount`.
- Distinguish current target files, current private proposal, executed fingerprint and historical recording states. Only the latest matching failed private UI validation can seed a locator revision. A successful revised proposal never overwrites the earlier failed run.
- A saved sanitized DOM/accessibility reconstruction helps choose candidates but cannot establish live uniqueness. Retrieve one relevant page/frame event through `qa_recording_snapshot` rather than loading every page tree. Stored hashes and delivered bytes are provenance and accounting, not token-saving measurements.
- Constructor locators can be corrected through the same AST literal machinery as method-local locators. Preserve all statements/assertions, expose a new diff, then require native validation and exact application approval.
- Missing trace contents, absent historical snapshots, removed private regions and expired evidence must remain explicit. Do not ask the user to paste an available trace merely because only its name appeared in older prompts; inspect the bounded supplied trace evidence first.
