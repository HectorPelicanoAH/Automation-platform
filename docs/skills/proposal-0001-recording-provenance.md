# Proposal 0001: Keep recording claims separate from repository observations

Status: E01/E02 exploratory evaluation completed for v2; activation NOT_APPROVED. This is a manually curated Phase 3 proposal, not an autonomous evolution engine.

Observed problem: one live E01 trial of `discover-business-scenarios` v1 produced the correct two example rows but put repository file paths and an unevidenced parser-status statement in behavioral `claims`. The host correctly rejected those references. The baseline application procedure succeeded on the same recording. The failed version and its output remain retained; a correct table does not turn a rejected proposal into a success.

Proposed change: preserve [v1](candidates/v1/discover-business-scenarios/SKILL.md), and add [v2](candidates/v2/discover-business-scenarios/SKILL.md) with one paragraph explaining structured-field semantics: use supplied recording/narration IDs exactly; keep repository reuse and parser limitations separate from recorded business behavior; use only granted tools; never claim host parsing as an agent action.

Expected benefit: fewer invalid evidence references without losing business assertions or weakening host validation. No improvement rate or token savings is claimed.

Evaluation: E01 and E02 were rerun with the same synthetic inputs, model, reasoning and host boundaries; The results compare the application baseline, rejected v1 where run, and v2. V2 passed both cases in one exploratory trial each. One paired attempt per case is exploratory and cannot establish statistical improvement. Record actual failures, usage, retrieval size and exact candidate hashes in the [manifest](../evaluations/phase-3-skill-manifest.json) and [evaluation results](../evaluations/phase-3-results.md).

Activation and rollback: no version has been installed in runtime discovery or user-global skills. Owner approval is required before activation of an evaluated exact hash. Retaining v1 and the application baseline makes the proposal reversible; full activation/version/rollback services remain Phase 6.
