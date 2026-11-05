# ADR 0007: Provenance-based knowledge and approved reversible skill evolution

Date: 2026-11-05. Status: accepted planning baseline.

## Context

Accumulated knowledge should improve reuse and reduce repeated exploration. Automatically turning observations into mandatory instructions can increase context cost, encode false facts and regress useful workflows.

## Decision

Classify discoveries into temporary context, repository facts, reusable procedure, ADR or skill candidate. Promote only useful sourced claims with confidence, revision/hash, review and stale detection. Keep concise incremental docs and structured lookup; do not force an agent to read all knowledge.

Use the runtime-supported `.agents/skills/<name>/SKILL.md` layout for active approved skills, with frontmatter name/description and optional references/scripts only when needed. See [official skills guidance](https://learn.chatgpt.com/docs/build-skills). Candidates and immutable proposed versions stay outside any discovery path, referenced through docs or the private proposal store.

P6 evaluates candidate versus active versions on a small versioned dataset, records quality/cost regressions and requires explicit activation. Maintain a known-good pointer and exact bundle rollback. Initial static useful skills may be introduced in their owning phase with evaluation; no autonomous evolution before P6.

## Alternatives

Append-only knowledge dumps create stale contradictions. Silently rewriting skills makes regressions untraceable. Installing every possible skill at P0 adds untested scaffolding. Pure embeddings cannot establish correctness or freshness.

## Consequences

Promotion and evaluation add review cost; the small dataset is evidence, not proof of broad generalization. AGENTS remains short and universal. Generated repository instructions cannot grant access. Token savings require measured comparators, not an architectural promise.

## Validation and revisit

P6 proves deduplication, stale-source handling, comparable evals, activation denial and exact rollback. Add skills only for recurring measured needs. See [knowledge policy](../knowledge/README.md), [skill catalog](../skills/README.md) and [evaluations](../evaluations/README.md).
