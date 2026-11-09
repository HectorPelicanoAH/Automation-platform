# Knowledge, skills, metrics and Autohealth

## Knowledge during normal work

A completed target run or approved automation application queues a bounded collector. Collection can also be started in **Knowledge & Skills**. It writes private platform state, not application sources or Git files. Static Page/component/fixture/builder/helper facts, actual native outcomes, retrieved source provenance and validated locator repairs retain their evidence type, source IDs, relative paths, content hashes and available Git revisions.

Repository facts are candidates until reviewed. Passing UI evidence remains UI evidence; API results do not establish rendering. A source change, disabled/excluded source or changed revision makes relevant guidance stale. One-off failures are temporary and cannot become active documentation; temporary records expire under the configured retention period. Curated observations support repository/procedural/decision/skill-improvement classification and visibly observed versus inferred provenance. Inferred claims need an explicitly observed replacement before approval; they are not promoted silently.

Select a current candidate, inspect its exact hash and sources, and approve or reject it. Approval publishes one concise private Markdown document stored with immutable versions in SQLite. It does not edit the application's README or instructions. Unchanged reprocessing creates no extra claim/document version. To restore older documentation, inspect that version and explicitly approve restoration; old source hashes can still be stale after restoration.

Active advisory knowledge is retrieved only for a matching authorized file, at most three records per hit within the existing context budget. Tasks retain those knowledge hashes. Rejecting/changing knowledge or its sources prevents using an earlier task/proposal as if that evidence were still approved. AGENTS.md is not expanded and no full knowledge corpus is prepended to prompts.

## Portable skill improvement

No existing discovery, Playwright or Karate candidate from earlier phases is silently activated. The initial supported behavioral workflow is the `summarize-health-findings` procedural bundle:

1. Propose the inactive v1 baseline and inspect SKILL.md plus its helper. The helper reads only the supplied redacted JSON and returns a summary to stdout; it does not inspect source repositories or apply fixes.
2. Explicitly trust the exact packaged evaluator to execute its fixed scripts locally. Eight versioned cases exercise complete evidence, repeated findings, separate roots/severities, empty input and invalid/oversized refusal. Format validation alone is insufficient.
3. Inspect the result and prepare an exact activation diff for a registered automation target. Explicitly approve it to create `.agents/skills/summarize-health-findings/`. Existing unmanaged skills, source roots, symlinks, changed target content and mismatched evaluations are refused.
4. Run read-only health checks at least twice. With a reviewed active v1 baseline and repeated actual finding fingerprints, propose v2. Its problem/benefit and observed health-run references are retained. It groups by root/fingerprint/severity while preserving evidence unions and occurrence counts.
5. Compare v2 with its immutable parent on identical cases, then inspect and approve the exact change separately. One deterministic execution per case/arm measures the helper, not stochastic agent reasoning.
6. Explicitly run the active helper on selected recent health evidence. The resulting job records input run IDs/count/bytes, output bytes, bundle hash and actual summary. The projection contains identity/evidence fields; original health runs remain authoritative for recommendations and other metadata.
7. For reversal, select the prior approved bundle, choose rollback, inspect the new diff and approve it. The exact previous bundle hash/files are restored. No passing execution is implied by restoring instructions.

The installed bundle is usable directly from Codex through its standard SKILL.md and can also be run independently:

```sh
node .agents/skills/summarize-health-findings/scripts/summarize.mjs redacted-findings.json
```

The input is an array with `root`, `fingerprint`, `severity` (INFO/WARNING/ERROR) and string `evidence` arrays. Use already-redacted data. The UI's portable export exposes the exact relative file bundle for inspection; it does not imply installation. The app does not accept a global/home/source installation path.

Additional JSON proposals can be stored and rejected, with exact files, parent, problem, benefit and evidence. Arbitrary scripts or instruction-only changes without an applicable behavioral evaluator remain unvalidated/inactive. The built-in evaluator supports only the exact shipped v1/v2 procedure. Broader skill routing/reasoning quality and prior exploratory candidates require separate appropriate agent trials; this implementation makes no claim that those are evaluated.

Directory publication stages complete bundles outside discovery. Activation/reversal journals are private. A crash or unknown concurrent edit requires recovery review; do not overwrite files because a journal says they were intended. Hidden transaction remnants are health findings. Active instructions cannot be changed while a target's test or agent task is running.

## Autohealth

Open **Autohealth**, select the target and run checks. Platform-only checking also works without a target. Check status and run status describe an inspection, not successful test execution or a universally healthy system. An inspection may finish with ERROR findings or UNAVAILABLE checks.

Supported checks include database integrity/private-state permissions, Chromium, configured Java, Node line and frontend/startup metadata; target permissions/dependency/configuration/trust; official Gherkin parsing and duplicate identities; static step/Page/repetition/selector candidates; mixed native outcomes and slow setup candidates; missing artifacts excluding declared retention expiry; stale indexes/documents/knowledge; unvalidated/duplicate/unobserved skill candidates, active-bundle drift, hidden transaction remnants and oversized/contradictory/obsolete instruction references.

Findings include severity, stable fingerprint, evidence, action and deterministic/heuristic classification. Syntax/import checks are incomplete for dynamic factories or excluded files. A missing import is not proof of unused code; a failed locator may be a product omission; a mixed-outcome test can reflect changing data/environment. No diagnostic auto-installs dependencies, weakens assertions, retries tests, modifies repositories or activates skills.

AI connectivity is not probed by scheduled diagnostics. Its explicit button uses only the separately configured/trusted Codex connection, with no inference or credential copy. An unconfigured or unavailable connection is not a passing health result.

## Local schedules

Enable a schedule explicitly, choose its interval (1–1440 minutes) and slow-setup threshold, then save. Scope is the registered target or platform-only. Checks run only while this local service is available. Pausing sets no next execution; cancellation retains partial findings with CANCELLED status. One inspection runs at a time. Overlaps and missed intervals are recorded; restarting marks interrupted work and schedules the next interval without replaying every missed job. There is no OS wake-up or cloud monitoring.

## Metrics and limits

Inspect metrics and definitions in **Knowledge & Skills**. Generation rates use recorded implementation tasks, not fabricated opportunities. Failed/cancelled/interrupted/running attempts remain in their stated denominator. Requests rejected before creating a task are not retroactively counted as eligible attempts. Reuse is explicitly a plan-level proxy; full opportunity-level reuse is unavailable. Maintenance rates use reviewed locator-defect diagnoses with their executable current at diagnosis; reversed repairs are separate.

Retrieval/prompt bytes and actual sent file counts come from task instrumentation. Repeated search is a normalized exact query hash with the same indexed scope/content/revision/policy, not an LLM similarity judgment. Provider usage preserves reported totals and known categories, leaves absent fields null and does not add cached/reasoning subsets twice. CODEX, CUSTOM and UNKNOWN_LEGACY provenance remain distinct. No provider pricing is hardcoded. UTF-8 byte counts are labelled proxies, not model tokens or billed cost.

Per-version script attempts include evaluation and active-workflow invocations with completion/refusal/cancellation/failure/interruption states. Direct external Codex invocations are not observed. Smaller summaries establish only the measured serialized-output difference on the compared inputs. They do not establish model-token savings, general agent quality or faster test setup.

Initial display windows are bounded: latest 1000 evolution records of a kind, 200 generation tasks, 100 maintenance/health/job records, bounded index/health file budgets and at most twenty local schedules. Larger datasets need pagination/archival work; a displayed window is not an all-time completeness guarantee. All runtime documents, reports, eval inputs and journals remain private; only deliberately redacted evaluation summaries belong in Git.

## Reproduce checks

Use the existing pinned Node/pnpm/Java toolchain and installed Chromium:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm test:smoke
```

The phase report records actual commands, case/bundle hashes and passing/missing checks. The required Ubuntu x64/macOS ARM64/Intel CI matrix remains separate from local Intel evidence.
