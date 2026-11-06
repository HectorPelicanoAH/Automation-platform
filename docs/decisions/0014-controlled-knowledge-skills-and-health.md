# ADR 0014 — Controlled knowledge, evaluated skill bundles and read-only health

Status: accepted for the explicitly approved Phase 6 scope, 2026-11-07.

## Context

Repository syntax, successful executions and repairs provide different kinds of evidence. Persisting everything as instructions creates noise and risks stale or contradictory guidance. An evaluation result must not grant its own activation permission. Health checks must remain useful without an AI account and must not execute imported configurations merely to inspect them.

## Decisions

Use separate SQLite records for discoveries, immutable document/bundle/evaluation versions, target-scoped active skill history, reviewed instruction changes, local jobs, invocation activity and health runs/schedules. Reuse existing native results, capability indexes, workspace boundaries and generation retrieval budgets. No external graph database or new product dependency is introduced.

Knowledge collectors run after target execution and approved automation application, or on demand. They record bounded static capabilities, current native outcomes, source excerpts actually used by completed tasks, and validated locator repair provenance. One-off failure evidence is temporary, not a skill. Unchanged content is a no-op; meaningful source/hash/revision changes create a candidate revision and stale prior guidance. Source facts are not inferred business rules. Reviewed facts generate concise private documentation; restoring a prior document preserves its hash and discloses stale sources. Runtime knowledge does not silently write platform Git documentation or application sources.

Generation lookup receives at most three relevant active advisory records per authorized file. Their hashes become task dependencies, are rechecked before completion/validation/application, and revocation invalidates the task/proposal. Unknown, rejected, inferred or stale knowledge is not mandatory context. Revalidation caches file/revision reads within a request, not across changing requests.

Skill proposals are immutable bundles outside runtime discovery. The initial behavioral evaluator is intentionally narrow: a portable read-only health-summary procedure with two explicit versions. Its helper runs as a real bounded Node child process against versioned valid/refusal/root/severity/evidence cases. Candidate and baseline use identical inputs; comparisons preserve root/fingerprint/severity occurrence counts and complete evidence unions. Output-byte measurements describe that representation only. No stochastic model routing, general agent decision quality, provider price or model-token saving is inferred. Other proposed skills remain inactive without an applicable reviewed behavioral evaluator.

An improvement proposal requires repeated actual health findings and the currently active baseline. Evaluation permission, activation permission and reversal permission are distinct. Target/root, prior bundle, exact diff, evaluation/case/evaluator hashes and approval are checked independently of candidate content. Initial baseline activation is explicit; prior versions are not silently imported or activated.

Stage an entire skill bundle in a hidden transaction directory outside `.agents/skills`. Move a managed old bundle to a hidden backup, then rename the complete stage into the agreed `.agents/skills/<name>` destination. This uses directory-level publication, with a brief possible absent-directory interval between renames; it is not an OS-wide atomic exchange. Journals preserve partial transaction/recovery state. Unknown concurrent edits and unmanaged existing skills are never overwritten. A proven prior bundle may be restored into an absent destination on publication failure. Uncertain recovery/cleanup remains explicit; a partial staging directory never becomes a discoverable skill. Successful explicit rollback restores the exact prior file bundle/hash. Global/user skills and external source repositories are not installation targets.

Autohealth uses fixed host dependency checks and bounded read-only repository syntax/metadata inspection. Severity, stable fingerprint, evidence, action and deterministic/heuristic confidence accompany findings. Unsupported/dynamic patterns, missing check prerequisites and externally unobserved skill use remain uncertain. Mixed outcomes and slow setup are candidates requiring investigation, not automatic flaky-test diagnoses or optimization permission. AI connectivity is an explicit configured-provider action; schedules do not infer consent to contact it.

Schedules live in the existing local process. They retain next/last status, paused/error state, missed intervals and overlap counts. Startup marks interrupted jobs and advances missed schedules without catch-up bursts. No OS wake-up, cloud automation, dependency installation or automatic repository/instruction remediation is added.

## Consequences

The supported improvement works offline and remains usable as standard SKILL.md plus a standalone helper. Fixed evaluator allowlisting avoids an arbitrary-script execution API. Imported runner code still requires existing execution trust; child processes are not a sandbox. Generic instruction-only skill changes need additional applicable agent evaluation before activation, not a format-only substitute.

Rates expose recorded windows, eligible denominators, cancellations/failures, custom/legacy provider provenance and missing usage. Known provider totals are retained once; cached/reasoning subsets are not summed again. Per-version script attempts and their outcomes are distinct from unknown external Codex invocations. A byte proxy is never presented as billed tokens. Dataset-labelled checks measure narrow fixture noise, not general diagnostic accuracy.

All prior CI obligations and the required Ubuntu/macOS ARM64/Intel matrix remain. Phase approval and the sequencing exception do not waive them or activate any real user instruction bundle.
