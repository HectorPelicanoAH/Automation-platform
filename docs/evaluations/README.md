# Evaluation and cost measurement policy

The [v1 case set](cases-v1.md) is a versioned specification for future checks, not executed tests. Phase 0 validates its presence/links only. Add small synthetic input fixtures, expected outputs and runnable harnesses in the approved phase that implements each behavior; never mark an unimplemented case passing.

## Evaluation discipline

Version case input/output rubric separately from implementation. Record case-set version, fixture hashes, repository/contract revision, skill bundle/prompt hash, model/provider/reasoning, toolchain, environment, capture policy and actual evidence. Compare active baseline and candidate on the same setup. Include both valid and refusal/failure cases. Reserve held-out variants for prompt/skill changes; do not tune all examples and claim general improvement.

Hard gates: no unauthorized mutation/data export, no invented rules or runner passes, no UI coverage claim from API-only evidence, no assertion weakening, no unapproved active instruction changes. Any hard-gate failure rejects activation even if latency/tokens improve. Required deterministic correctness cases must all pass. For model outputs, an explicit rubric and human review are needed; a model judging itself is not enough.

For initial nondeterministic skill comparisons, use at least five paired attempts per applicable case where budget permits, or label fewer attempts exploratory and insufficient for a savings claim. Report per-case outcomes and distributions, not just an aggregate score. A small dataset supports narrow conclusions only; the owner chooses activation after reviewing evidence. Financial budgets and provider configuration are explicit, never inferred.

## Metrics and denominators

| Metric              | Definition                                                                                                                 | Comparability caveat                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Retrieval size      | bytes, files, source excerpts and truncations actually sent to the model per workflow                                      | report actual sent content, not index size                                     |
| Provider token use  | input/cached/output/reasoning tokens when exposed, with unavailable fields null                                            | no double counting; provider definitions may differ                            |
| Token proxy         | clearly labeled UTF-8 byte/character counts or tokenizer estimate with method/version                                      | never present as provider-billed tokens or combine silently                    |
| Repeated searches   | semantically equivalent source query repeated without source/config change; raw tool counts retained                       | define normalization and review ambiguous repetition                           |
| Skill invocation    | invocations/completions by skill version per workflow                                                                      | invocation frequency alone is not usefulness                                   |
| Reuse rate          | eligible implementation needs satisfied by a validated existing capability / reviewed eligible needs                       | unknown/unavailable opportunities excluded explicitly, not scored as reuse     |
| Generation success  | workflows producing reviewed contract and validated real executable test / eligible attempted workflows                    | count failures/cancellations/blocked separately; do not drop difficult cases   |
| Maintenance success | eligible test-defect cases repaired minimally and validated without weakened intent / eligible attempted test-defect cases | product regressions should remain failing and have separate diagnosis accuracy |
| Index reuse         | unchanged supported files not re-extracted / unchanged supported files                                                     | keep dirty-tree correctness and changed-file recall                            |
| Quality             | rubric-level correctness, assertion coverage, duplicate abstraction count, security-gate failures                          | never offset a security failure with speed                                     |
| Time/cost           | cold/warm elapsed, direct runner vs platform overhead, retrieved bytes/tokens and provider price snapshot if available     | price absent means cost unavailable, not zero                                  |

The platform has **no measured token savings or quality improvement yet**. Local persistence alone does not prove either. Savings claims require paired equivalent successful tasks, comparable context/model/config, costs for indexing/evaluation included or separately stated, and a dated baseline. Use raw usage rather than guessed current pricing.

## Improvement report and rollback

Record observed problem, baseline, candidate diff/hash, expected benefit, case versions/attempts, actual results, quality/cost comparison, limitations and activation decision. Keep evaluation artifacts immutable and privately redact them. Activate only the evaluated version after explicit approval; record exact rollback reference. A changed underlying source/config may require reevaluation even if the skill text is unchanged.

## Execution status

All E01–E14 cases are `NOT_RUN` at Phase 0. They become applicable as their owning phase is approved and implemented. The completion reports must name which cases ran, which failed, and which remain unavailable. No Phase 0 documentation checker substitutes for these behavior tests.

Phase 1 deterministic coverage is recorded in [phase-1-results.md](phase-1-results.md). It does not constitute an AI or skill evaluation, and does not change the historical Phase 0 NOT_RUN record.
