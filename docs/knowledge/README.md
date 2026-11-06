# Knowledge lifecycle

Phase 0 introduced curated architecture decisions. Phase 3 adds a bounded capability index and evidence-linked proposal/task history; it does not automatically promote observations into permanent knowledge. There is no automatic documentation writer or learning engine. Full knowledge evolution belongs to Phase 6.

## Classification and promotion

| Classification                | Retention / destination                                            | Example                                                            |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Temporary execution context   | task/run lifetime and artifact policy; no permanent doc by default | current DOM state or one failed network call                       |
| Repository-specific knowledge | concise target/private source-linked record                        | an existing helper creates a catalog fixture                       |
| Reusable procedural knowledge | reviewed procedure, possibly skill candidate after repetition      | diagnostic steps for a recurring authentication failure            |
| Architectural decision        | ADR with rationale, tradeoffs and supersession                     | canonical Gherkin versus framework implementations                 |
| Potential skill improvement   | versioned proposal outside active discovery paths                  | reuse lookup avoids repeated searches without missing dependencies |

A discovery record contains ID, classification, concise claim, source IDs/relative locations, revision/content hashes, observed versus inferred status, confidence, created/last-validated time, owner/reviewer and intended use. Private runtime knowledge stays outside the platform Git repository unless explicitly curated into safe generic documentation. Do not commit external source content, secrets or personal paths by default.

Lifecycle: `CANDIDATE → REVIEWED → ACTIVE`; candidates may be rejected, active records become `STALE` when source/config changes, and approved replacements mark old revisions `SUPERSEDED`. Preserve history. Inferred behavior is never promoted to a business rule without user confirmation.

Meaningful source/behavior changes trigger a small proposed update, not a full document regeneration. Dedupe by source/capability/claim key and content, preserve source references, and remove duplicated explanations by linking existing records. Unchanged reprocessing must be a no-op. Source hash changes mark claims stale even when a Git commit has not changed.

## Knowledge retrieval

Lookup starts with capabilities and task IDs, then loads the relevant concise record and source excerpt only if needed. Every response indicates freshness and evidence. If stale, revalidate or mark it unusable for generation. No “read all knowledge first” instruction and no universal context preamble.

Knowledge is advisory data. It cannot change grants, authorize shell commands, overwrite active skills or suppress failing tests. A confident documented locator still requires relevant-state uniqueness validation before acceptance.

## Bootstrap record

| ID       | Claim                                                                                        | Evidence                                                           | State                             |
| -------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| ARCH-001 | Platform, application sources and automation target have separate lifecycles and permissions | [ADR 0002](../decisions/0002-repository-boundaries.md)             | Curated Phase 0 planning baseline |
| ARCH-002 | Shared business identity does not imply identical UI/API assertions                          | [ADR 0004](../decisions/0004-functional-contract-and-execution.md) | Curated Phase 0 planning baseline |
| ARCH-003 | Active skill changes require evaluation and explicit activation                              | [ADR 0007](../decisions/0007-knowledge-and-skill-evolution.md)     | Curated Phase 0 planning baseline |

These bootstrap records describe decisions. Current curated runtime conventions are in [runner-conventions.md](runner-conventions.md), [recorder-conventions.md](recorder-conventions.md) and [generation-conventions.md](generation-conventions.md). They distinguish actual native validation from provider fixtures and pending model evaluations. No performance or token improvement is inferred from caching alone.

## Phase 6 acceptance

Demonstrate a real repeated discovery becoming one source-linked record, an unchanged update doing nothing, source change marking it stale, a reviewed replacement preserving provenance, and rollback restoring a prior version. Use [evaluation cases](../evaluations/cases-v1.md) and [metrics](../evaluations/README.md). A smaller context bundle is useful only if quality and reuse remain at least comparable.
