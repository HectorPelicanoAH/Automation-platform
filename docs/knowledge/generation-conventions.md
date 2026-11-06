# Reviewed generation conventions

Scope: implemented Phase 3 behavior, with final model and cross-system acceptance tracked in [the report](../phase-3-report.md). This is curated procedural knowledge, not an automatically activated skill.

- The promotion starter already has `PromotionsPage.visit` and `expectPromotion`, scoped uniqueness checks, shared fixtures, a customer builder and thin business steps. The generation fixture deliberately removes only the Then step. Actual native negative/positive validation proves reuse of the existing UI assertions; its declared provider fixture does not prove model quality.
- Source index reuse depends on file hashes, include/exclude policy and extractor version. A preferred branch label does not check out a branch or identify uncommitted contents. Revalidate retrieved file hashes and source permissions before trusting a proposal.
- Evidence identifiers reference the original recording event or narration segment. Existing features provide reuse context and cannot establish a new business requirement. Missing thresholds must remain questions for human review.
- Gherkin approval, staged execution trust and managed diff application are separate grants. A passing run is insufficient for application. Contract edits/rejection invalidate dependent proposals and cancel active dependent work; applied history is retained.
- Codex metadata/catalog/schema checks verify protocol compatibility only. Real authenticated inference, skill behavior and model costs need their own evidence. Private credentials never belong in an index, prompt, repository or execution artifact.

Evidence: [generation tests](../../tests/generation.test.ts), [actual browser/native workflow](../../tests/generation-ui.spec.ts), [protocol boundary tests](../../tests/provider.test.ts) and [ADR 0011](../decisions/0011-reviewed-ai-generation.md). Recheck after changing these implementations. Confidence is high for executed local deterministic/native checks; model behavior remains unverified until the report records a real inference run.
