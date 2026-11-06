# Phase 3 skill candidates

These are versioned proposals, not installed/active skills. They live outside runtime discovery and can be exported as standard standalone bundles after evaluation and explicit owner approval. Phase approval does not activate them. No `.agents/skills` or user-global skill directory has been modified.

| Candidate                                                                            | Purpose                                                                            | Format validation | Behavioral evaluation | Activation   |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------- | --------------------- | ------------ |
| [discover-business-scenarios v1](candidates/v1/discover-business-scenarios/SKILL.md) | Evidence-linked Gherkin and unanswered requirements; portable recording exports    | PASS              | PENDING E01/E02       | NOT_APPROVED |
| [implement-playwright v1](candidates/v1/implement-playwright/SKILL.md)               | Bounded capability reuse, thin steps and separately reviewed execution/application | PASS              | PENDING E04/E12       | NOT_APPROVED |

Observed problems: repeating broad repository exploration, promoting observed text into business rules, recreating existing Pages/steps, and treating test success as write approval. Expected benefits are more focused retrieval and better preservation of intent; no measured improvement is claimed yet.

Both bundles are self-contained and do not require the web application or private database. The skill-creator format validator passed locally using PyYAML 6.0.2 from a temporary tool directory. The system and bundled Python initially lacked YAML; those attempts failed and are not passes. No product runtime dependency was added for skill validation.

Before activation, compare the baseline application procedure with the exact candidate on the same case/evidence/model configuration. Retain outputs, safety failures, retrieval/usage and uncertainty. Current platform fixtures validate host boundaries, not the behavior of a model using these candidates. Record candidate hashes and actual behavioral outcomes before requesting activation. Any content change invalidates its prior evaluation. Full automatic skill evolution/rollback remains Phase 6.
