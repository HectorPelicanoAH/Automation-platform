# Phase 3 report

Historical report snapshot: Phase 4 was subsequently approved with an explicit owner sequencing exception. Current authorization is in [phase status](phase-status.md); Phase 3 itself remains VALIDATION.

PHASE: 3 — AI-assisted UI generation

STATUS: VALIDATION. Functionality has local, real-model and native-runner evidence. The required final three-system CI is blocked by GitHub billing; this phase is not COMPLETED. Phase 4 remains unapproved.

## IMPLEMENTED

- Opt-in incremental TypeScript/JavaScript/Gherkin indexes across registered sources and the managed target, with Git revision, independent dirty-tree hash, source-policy checks and bounded retrieval.
- Provider-neutral tasks and pinned Codex app-server integration: named restricted permissions, isolated authentication/configuration, scoped tools, streamed progress, history, cancellation and provider usage.
- Evidence-linked Gherkin drafts, explicit unresolved questions and approval of the exact contract before implementation.
- Capability reuse plans, private full-file diffs, conservative code guards, separately trusted native validation and exact reviewed application with stale-base checks and journaling.
- Working Generate UI, manual AI-disabled workflows and actual promotion automation. No Phase 4 API generation, Phase 5 repair or Phase 6 autonomous evolution services.

## ARCHITECTURAL DECISIONS

[ADR 0011](decisions/0011-reviewed-ai-generation.md) records host-owned permissions/approvals, a bounded syntax index, isolated agent turns and separate execution/application grants. Both thread and turn select `qa-proposals`; direct filesystem access and command networking are denied. Provider service traffic remains separately authenticated. Unknown profiles/tools and model fallback fail closed.

Real integration exposed an obsolete `readOnly.access` request, an unrecognized `base.extend` fixture alias and ambiguous reuse-plan symbol instructions. The fixes preserve strict validation: resolve the actual fixture name and require exact indexed symbols. Existing Page assertions remain unchanged. A worker or reviewed validation overlay is not an OS sandbox.

## VALIDATION

Runtime code checkpoint: `9145c8c19ababe8f497641f3dde464eae5fbe0ae`, branch `codex/phase-3-ui-generation`. An additional multi-source/Git regression is included in the final branch. Commands used pinned Node 24.22.2 and the existing pinned framework toolchains.

| Check                                                                                                              | Actual result                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` through their equivalent pinned Node entry points | PASS; final documentation is checked before commit                                                                                                          |
| `node --import tsx --test tests/*.test.ts`                                                                         | 33 PASS, zero failed/skipped/cancelled                                                                                                                      |
| Full headed browser suite on macOS 15.7.3 Intel                                                                    | 8 PASS in 10.7 minutes during implementation; includes the real five-minute synthetic-audio test                                                            |
| Final revised `generation-ui.spec.ts`, real browser/native runners with explicitly labeled provider fixture        | PASS in 34.8 seconds                                                                                                                                        |
| Actual Codex task and applied synthetic diff rendered through authenticated web APIs                               | PASS; screenshot visually inspected, zero browser errors                                                                                                    |
| Actual pinned CLI schema/profile/handshake/thread probe without authentication or inference                        | PASS locally                                                                                                                                                |
| Authenticated Codex recording → Gherkin → reused Playwright code                                                   | PASS on synthetic data; native negative control: 2 FAILED; correct UI: 2 PASSED; independent applied-target CLI: 2 PASSED, zero skips/flaky/unexpected      |
| Real Codex turn cancellation                                                                                       | CANCELLED in about 506 ms, no proposal; usage unavailable, not zero                                                                                         |
| Multi-source Git regression                                                                                        | Two opt-in sources plus target; real Git revision retained while an uncommitted edit changes tree identity; scoped lookup/read succeeds; no branch checkout |
| `pnpm audit --audit-level=low --json`                                                                              | Zero reported npm vulnerabilities across 276 dependencies at execution time; not a Java dependency audit                                                    |
| Final CI on all three systems                                                                                      | NOT RUN: GitHub rejected every job before its first step because of account payment/spending-limit state                                                    |

[Live evidence](evaluations/phase-3-live-evidence.json) retains actual usage, failures, cancellation, source references, native outcomes and the [reviewed generated diff](evaluations/fixtures/phase-3-real-generation.diff). The acceptance actor uses disposable synthetic repositories and a predefined rubric; it does not represent owner approval of production changes. The separate browser provider fixture is never presented as real inference.

[CI evidence](evaluations/phase-3-ci-evidence.json) distinguishes earlier successful Ubuntu 24.04 x64/macOS 15 ARM64 jobs on `94f3eea` from the [blocked final run](https://github.com/HectorPelicanoAH/Automation-platform/actions/runs/42221332271). Earlier successes and local Intel checks do not constitute final-revision three-system CI acceptance. No final CI test failed: none started. Current-revision multi-system validation is the remaining required check. The final evidence/documentation and additional regression commit uses `[skip ci]` to avoid another known-blocked automatic attempt; it must be included in the full matrix rerun once billing is resolved.

Earlier failures remain recorded: initialization/cancellation races, UTF-8 transport boundaries, unsupported legacy permissions, unknown reuse symbols and rejected discovery-skill evidence references. Fixes did not weaken business assertions or add retries, forced actions or arbitrary waits. A first incomplete recording was retained; the complete replacement has 19 genuine events, both language contexts and zero gaps.

The owner explicitly authorized temporary session reuse for synthetic testing. Each client used isolated credentials; the complete temporary Codex home was removed afterwards and AI was disabled in the acceptance workspace. No owner application repository was modified.

## KNOWLEDGE

Updated architecture, security/domain notes, operating guide, phase roadmap and [curated generation conventions](knowledge/generation-conventions.md). The index now discovers the newly implemented Then step; after application it reparsed two changed files and reused four.

Two skill names have three versioned candidate bundles. Discovery v1 was rejected; proposed discovery v2 and Playwright v1 passed their small applicable trials. [The proposal](skills/proposal-0001-recording-provenance.md) and [manifest](evaluations/phase-3-skill-manifest.json) preserve exact hashes, failures and evaluation states. All remain inactive. One paired attempt per case is exploratory; general quality improvement and token savings are not established. Some candidate trials used more tokens and context than the baseline.

## QUALITY

Known limits: alpha/experimental provider interfaces, bounded syntax extraction and context, imperfect secret recognition, nondeterministic model proposals and host-privileged reviewed execution. Scenarios cover visible promotional fields, not checkout eligibility or actual shipping charges. Native API checks do not establish UI correctness. Physical microphone verification remains a separate manual check from Phase 2.

Remaining validation debt: final three-system CI. GitHub billing/settings were not modified, support targets were not reduced, and unavailable checks were not marked passing.

## NEXT PHASE

Phase 4 remains PROPOSED: read-only API/contract discovery, repository-aware Karate generation, reusable authentication/data preconditions and explicit UI/API coverage mapping. Expected proof is independently executable API automation for the two demonstration datasets, retained UI assertions, real combined reporting and safe independent/parallel setup. Dependencies are completed Phase 3 acceptance, the existing pinned Java/Gradle/Karate stack and exact owner authorization `APPROVE PHASE 4`. No Phase 4 functionality has begun.

## APPROVAL REQUIRED

The owner must resolve the GitHub account billing/spending-limit block before the full workflow can validate the final branch. No payment or spending-limit change is authorized for the agent. Repeat the complete matrix after that external issue is resolved. Phase 3 stays VALIDATION, and Phase 4 authorization is not requested until Phase 3 is complete.
