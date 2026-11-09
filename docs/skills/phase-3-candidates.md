# Phase 3 skill candidates

These proposals live outside runtime discovery. No `.agents/skills` or user-global skill directory was modified; phase approval does not activate a skill.

| Candidate                                                          | Format | Behavioral evaluation                                                 | Activation   |
| ------------------------------------------------------------------ | ------ | --------------------------------------------------------------------- | ------------ |
| [Discovery v1](candidates/v1/discover-business-scenarios/SKILL.md) | PASS   | REJECTED E01: repository/parser observations used as recording claims | NOT_APPROVED |
| [Discovery v2](candidates/v2/discover-business-scenarios/SKILL.md) | PASS   | E01/E02 exploratory PASS, one trial per case                          | NOT_APPROVED |
| [Playwright v1](candidates/v1/implement-playwright/SKILL.md)       | PASS   | E04/E12 exploratory PASS; real negative/positive native validation    | NOT_APPROVED |

[Proposal 0001](proposal-0001-recording-provenance.md) preserves the observed failure, exact proposed change and expected benefit. [The manifest](../evaluations/phase-3-skill-manifest.json) records bundle hashes; [actual outputs/usage](../evaluations/phase-3-live-evidence.json) and [comparison results](../evaluations/phase-3-results.md) preserve baseline and candidate evidence. V1 was not silently overwritten.

All bundles are self-contained standard SKILL.md procedures usable with supplied safe evidence and authorized repository files. Skill-creator's format validator passed with temporary PyYAML 6.0.2; no product dependency was added. Behavioral trials supplied the procedure text as an evaluation-only prefix, without installation or activation.

One paired trial is exploratory. No general quality improvement or token savings is established; the Playwright candidate used more context/tokens in E04. Any future activation requires owner approval of the evaluated exact hash. Full automatic evolution, activation/rollback services and long-term monitoring remain Phase 6.
