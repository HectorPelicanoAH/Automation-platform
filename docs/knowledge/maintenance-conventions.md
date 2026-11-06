# Curated maintenance conventions

Scope: supported Phase 5 implementation; confidence is implementation/native-fixture evidence, not a universal root-cause classifier. Sources: [ADR 0013](../decisions/0013-evidence-based-maintenance.md), [maintenance guide](../maintenance.md), [versioned cases](../evaluations/fixtures/phase-5-v1.json).

- Start with the original failed target execution. Link its canonical scenario identity and framework. Current source is a separate snapshot; do not pretend it reconstructs historical implementation.
- Locator errors can also be product omissions. A mismatch can reflect product, data or stale requirements. Preserve uncertainty until reviewed evidence establishes intent.
- Karate 2.1.4 can report nested setup rejection as `called feature failed: ... expected status: 200, actual: 404`. Inspect both parent and nested failure details. A 404 symptom alone does not prove invalid test data.
- Reuse the inspected Page and preserve its business assertions. A locator-only repair must still fail against a controlled product defect and pass the correct product before application.
- Validate staged canonical hashes separately: the common executable fingerprint excludes canonical Gherkin by design. Native success must match the reviewed contract and all its selected feature examples.
- Keep cancellation, rejection, stale evidence, failed execution and reversed implementation separate from passing evidence. A reversal restores bytes, not proof of correctness.
- Relationship edges retain hashes/revisions and explicit static/declaration confidence. Unsupported patterns are missing knowledge, not absent dependencies.

This is curated project documentation. No active skill has been created, activated or silently evolved, and no permanent skill was introduced for a one-off failure.
