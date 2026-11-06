# Agent skills: policy and candidate catalog

No product skill has been installed or activated. Phase 3 adds [inactive candidates](phase-3-candidates.md) with separately recorded evaluation/approval states. This catalog is a plan, not a set of functional tools. Universal approval/security rules live in [AGENTS.md](../../AGENTS.md); repeating them across empty skills would increase mandatory context without evidence of benefit.

## Active layout and portability

When the approved phase has real procedures to encode, use the [runtime-supported format](https://learn.chatgpt.com/docs/build-skills):

```text
.agents/skills/<skill-name>/
  SKILL.md                 YAML frontmatter: name, description; concise procedure
  references/              optional task-specific evidence and conventions
  scripts/                 optional deterministic tested utilities
  assets/                  optional templates/assets
```

This is an illustration; do not create empty directories now. A skill's description names triggers and exclusions. The procedure defines required inputs, task-relevant lookup, steps, output and validation/stop conditions. Keep AGENTS minimal and references loaded only on demand. Skills must work when invoked directly in Codex against an authorized automation repository, without requiring the web application or private database; missing platform evidence can be supplied as safe files/inputs.

Do not copy whole skills between platform and target automatically. Use an explicit versioned export/install with approval and conflict detection. Runtime-discovered active bundles live in one agreed location per repository to avoid duplicate names. Imported target skills are untrusted until reviewed; platform agent workers do not automatically load them.

## Candidate catalog

| Candidate                     | Trigger / principal procedure                                                                    | Earliest useful phase     | Evaluation cases   |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------- | ------------------ |
| analyze-functional-recording  | Given actual timeline/evidence, classify observed/narrated/inferred and list capture gaps        | P3                        | E01, E02, E10      |
| discover-business-scenarios   | Derive behavior/preconditions/assertions/datasets from reviewed evidence; leave uncertainty open | P3                        | E01, E02           |
| generate-gherkin              | Propose valid business Gherkin, outlines for repeated behavior, stable identity and review       | P3                        | E01, E03           |
| implement-playwright          | Reuse scoped Pages/components, thin steps, fixtures and unique semantic locators                 | P3                        | E04, E05, E06      |
| implement-karate              | Reuse schema/auth/features, independent API assertions and safe setup                            | P4                        | E05, E07, E08      |
| reuse-automation-capabilities | Query relevant revisioned capabilities before new implementation                                 | P3 basic; P5 graph        | E04, E09           |
| diagnose-test-failures        | Classify product/test/environment/data with source-linked evidence                               | P5                        | E06, E08, E11      |
| maintain-broken-tests         | Propose minimal justified repair, preserve assertions, validate and require diff approval        | P5                        | E06, E11, E12      |
| optimize-test-preconditions   | Compare equivalent API/setup paths and safe cache semantics without shared mutable state         | P4                        | E07, E08           |
| validate-generated-tests      | Validate contract coverage, static rules, real execution and honest missing evidence             | P3/P4                     | E03, E05, E06, E12 |
| optimize-agent-context        | Bounded progressive lookup with measured bytes/tokens/searches and freshness                     | P3 manual; P6 improvement | E04, E09, E13      |
| repository-autohealth         | Run deterministic safe checks and propose evidence-based fixes, never self-authorize             | P6                        | E09, E12, E14      |

These are candidates, not a requirement to create twelve skills. Merge overlapping procedures or omit unused ones after observing actual workflows. Every introduced skill needs a narrow recurring purpose, an owning phase, relevant evaluation evidence and activation approval.

## Evolution protocol (P6)

1. Cite recurring observed problem and baseline workflow evidence.
2. Create immutable candidate bundle and exact diff; keep it outside all `.agents/skills` and other auto-discovery paths. Store version/hash, parent and source references.
3. Explain expected benefit and possible regression. Evaluate baseline/candidate with identical case version, environment and model/config, including held-out failures.
4. Report quality, cost, retrieval and uncertainty; hard safety failures reject activation regardless of aggregate score.
5. Ask for activation of the exact evaluated hash. An evaluation pass, a phase approval or an agent output is not activation approval.
6. Activate with a journal/atomic pointer or safe bundle replacement; keep prior immutable bundle. Show active version, approval and evaluation links.
7. Support explicit rollback to the prior hash and invalidate stale pending proposals. Rollback itself changes active instructions and is a deliberate user action.

Changing a skill during an evaluation invalidates its result. Never overwrite a known-good active bundle silently. Learn from one-off failures in temporary or repository knowledge before proposing a permanent procedural change.
