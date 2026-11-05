# Autohealth design

P1 implements readiness diagnostics only. Full Autohealth, Knowledge & Skills health, configurable scheduled checks and optimization proposals belong to Phase 6. No check or scheduler is implemented in Phase 0.

## Finding contract

Each finding includes check ID/version, affected root/run/skill, severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`), concise problem, source revision/evidence, confidence, recommended action, stable fingerprint, first/last seen and state (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`, `STALE`). Separate check execution errors/unavailable prerequisites from a clean result. Severity reflects impact; confidence reflects evidence certainty.

## Check catalog

| Domain                   | Deterministic method first                                                                                       | Important limits                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Startup/backend/DB       | loopback readiness, migrations/version, integrity check and private data-root access                             | active integrity checks are bounded and scheduled carefully; no unauthorized repair                      |
| Browser/recorder         | exact installed browser/version, optional launch probe, microphone permission/capability summary                 | probe needs explicit allowed browser start; web permissions cannot be guessed from server                |
| Java/Karate/dependencies | configured executables/versions, wrapper checksum/manifest presence and run prerequisite checks                  | do not execute imported build scripts just to inspect health                                             |
| Provider                 | explicit configured connectivity probe with user policy, redacted error                                          | can contact a paid/cloud service; disabled is a valid state, not always unhealthy                        |
| Workspace/config         | root availability, permission/overlap/symlink policy, valid environment and framework paths                      | path existence is not proof imported code is safe                                                        |
| Gherkin/steps            | official parser, normalized step pattern ambiguity and referenced binding index                                  | dynamic/glob step registration can be unresolved; duplicate text is not automatically duplicate behavior |
| Pages/components/helpers | indexed inbound references, normalized candidate similarity                                                      | reflection, dynamic use and shared libraries create false positives; “unused candidate” requires review  |
| Locators                 | static forbidden-pattern rules plus optional authorized relevant-state uniqueness check                          | static inspection cannot prove uniqueness in live UI; broad auto-browsing is not read-only               |
| Flakiness/setup          | attempt history and setup-step timing distributions by revision/environment                                      | need minimum sample counts; retries changing environments are not comparable                             |
| Index/artifacts/config   | content/config hash freshness, missing artifact manifests/checksums, schema/version mismatch                     | external edits and retention tombstones are legitimate states to explain                                 |
| Docs/skills              | source hash staleness, duplicate names/content, instruction conflicts, active-eval hash and context-size budgets | contradictions may need reviewer judgment; no LLM-only silent verdict                                    |
| Context efficiency       | retrieval/search/usage metrics from comparable workflows                                                         | smaller bytes alone do not prove better outcomes or billed savings                                       |

Use named, configurable thresholds. Initial flakiness classification should require at least five comparable attempts and show counts, rather than declare a test flaky from one failure. Slow-setup thresholds use a named baseline/absolute budget; no universal time threshold for all projects. AGENTS size is a configurable budget with current byte/token estimate, not proof of poor instruction quality.

## On-demand and scheduled behavior

On-demand checks display scope, progress, cancel and exact unavailable prerequisites. A local schedule runs while the platform is running, with per-workspace opt-in, maximum concurrency of one check job initially, a timeout, byte/file budgets and explicit enabled checks. Persist schedule timezone and next/last run; after downtime report missed schedules and run at most one coalesced catch-up, never a burst of destructive jobs.

Allow automatically scheduled metadata/static reads inside grants. Browser navigation, test execution, provider probes and scripts have separate side effects/costs and must be explicitly enabled under their operation policy. Findings deduplicate by stable fingerprint; unchanged findings update last-seen without creating repeated notifications. Do not transmit telemetry or email/chat notifications without explicit configuration/authorization.

## Corrections and improvement

Read-only inspection never authorizes fixes. Show a specific proposed diff, affected behavior, source/base hashes, risks and validation. Changes to application/test code, assertions, instructions or active skills require explicit approval and corresponding execution/activation policy. Prefer deterministic remediation scripts only when reviewed, narrow and reversible. Never “repair” by weakening an assertion or deleting uncertain unused code.

The P6 demonstration uses E14 fixtures and real platform state, shows finding evidence and an unevaluated skill change blocked from activation, then evaluates/approves/rolls back a known revision. Publish detection outcomes and false positives separately from broad product success claims.
