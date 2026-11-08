# Reviewed UI generation

Phase 3 remains in validation. Real authenticated Codex generated a reviewed two-row outline and thin Playwright step; negative/positive native validation and independent execution passed. Final three-system CI is blocked before startup by GitHub billing. See [phase plan](phase-3-plan.md), [live evidence](evaluations/phase-3-live-evidence.json) and [report](phase-3-report.md). Automatic transcription, API generation, repair and autonomous skill evolution are outside this phase.

## Configure Codex

AI is disabled by default. Manual Scenarios and Runs work independently. The supported app-server protocol is pinned to `codex-cli 0.162.0-alpha.2`; other versions are rejected until separately verified. Install only when AI is needed:

```sh
npm install --global --ignore-scripts @openai/codex@0.162.0-alpha.2
codex --version
command -v codex
```

In Generate, enter the canonical absolute executable path, explicitly trust it, then Verify Codex CLI. Resolve a command symlink to its real file before configuration. Check authentication and models to create/inspect the private Codex home. The page displays the exact isolated `CODEX_HOME=... codex login` command; run it locally to authenticate. Credentials stay outside Git and model-readable context. The platform does not import global credentials, configuration, hooks or plugins automatically. The executable fingerprint is rechecked before tasks.

The adapter also requires the named `qa-proposals` permission profile to be available and allowed. Thread and turn select that profile, which denies direct filesystem access and command networking. Environment tools remain disabled; only host-scoped lookup/read tools are exposed. There is no fallback to legacy `readOnly.access` or broader permissions when compatibility checks fail.

Select explicit analysis/implementation models and reasoning efforts, then enable AI. A catalog is not an entitlement check: a completed inference verifies access for that request. Tasks may consume provider/account quota. No monetary or token-saving estimates are presented as measured costs. Disabling AI stops new generation while manual editing, results and existing proposal inspection remain available; cancel an active task before changing configuration.

## Evidence and repository lookup

Stop a recording before analysis. Review missing capture evidence and edit timestamped narration in Record. Observed text is evidence of current behavior, not proof of the intended rule. Narrated requirements and inferred questions are separate.

Choose the managed target and opt-in source repositories. Workspace controls source enable/index flags and include/exclude patterns. Index selected repositories, then search capabilities. Git revision labels and working-tree hashes remain separate; indexing never checks out a branch or executes source configuration. Unchanged hashes reuse syntax facts. Deleted/changed files and policy revocation invalidate retrieval.

Extraction supports TypeScript/TSX/JavaScript/JSX syntax and official Gherkin parsing: Pages/components, methods, steps, fixtures/builders, imports, accessible attributes and literal locator hints. Dynamic behavior and unsupported syntax are incomplete. Scans are bounded to 500 files, 8 MB, 200 KB per parsed file, 10,000 visited entries and 12 levels. Default secret/dependency/generated/instruction exclusions cannot be bypassed by includes; symlinks are excluded. Oversized/unsupported input requires narrowing or manual work. UI responses use index summaries and relevant facts.

A task can invoke only scoped lookup and indexed-file reads. All tool-result JSON, including capability lookup, shares a 64 KB retrieval budget; full reads are limited to eight files, 16 KB each, with 32 provenance dependencies and 16 tool calls. Recording context is also bounded and disclosed as selective. No unbounded repository dump, raw audio or secret store is provided to the model. Known sensitive text is redacted; arbitrary literals cannot be universally identified. Files containing redacted content cannot be automatically replaced lossily.

Reuse-plan symbols must exactly match a capability name returned for that file. A descriptive label such as “Given/When bindings” is not an indexed identity. The extractor recognizes the standard `test as base` / `export const test = base.extend(...)` fixture pattern; extractor-version changes invalidate old facts. Behavioral claims reference recording/narration IDs, while repository findings remain context. Neither file paths nor parser-status notes constitute recording evidence.

## Review and execute

1. Analyze the selected recording. Inspect streaming progress, tool activity, retrieved-file provenance, questions and actual provider usage when available. Missing usage stays missing; a clearly labeled byte-based proxy is not billing usage.
2. Inspect each claim's recording/transcript reference. Edit Gherkin and answer open questions. Approval binds exact text, answers, evidence and destination. Stable `@scenario:` identities are required for traceability. Editing or changing bases invalidates implementation approval.
3. Plan and generate Playwright changes. Inspect existing-capability reuse and the exact diff. Generation cannot edit sources, configs/dependencies, critical instructions or skills. Existing methods/steps are preserved; unsupported/brittle constructs require manual work. A generated proposal is not an approved write.
4. Prepare private validation. It copies the target UI/configuration and contracts into a disposable overlay, then links the already installed target UI dependencies. Nothing executes yet. Missing dependencies require explicit installation in the trusted target; discovery never installs them.
5. Review the code, dependencies and environment, then explicitly trust execution. The existing runner typechecks, generates Playwright-BDD tests and executes the feature in the overlay. Inspect real outcomes/artifacts in Runs. Failed/cancelled/partial validation cannot enable application. This execution is **not an OS sandbox**; trusted code has workstation permissions.
6. Approve applying the exact validated diff. Fresh recording/context/target bases, stage integrity and complete scenario-linked native results are checked again. Writes are journaled. A changed base requires review; partial application/rollback failures remain explicit. Rejection leaves managed files unchanged. After application, review the new executable fingerprint before a managed run; the repository remains independently runnable.

Changing a canonical feature can stale its existing Karate binding. Phase 3 never rewrites API assertions to conceal that mismatch. API generation requires Phase 4 approval.

## Limits and recovery

One AI task runs at a time with a five-minute deadline. Cancel closes its process group; restart marks unfinished history interrupted and never automatically reruns inference or writes. Interrupted application journals require inspection. Private validation overlays expire at startup according to artifact retention; active credentials are not retention artifacts.

Static guards and a passing selected feature do not prove arbitrary program safety or unexecuted behavior. No automatic global skill activation exists. [Skill candidates](skills/phase-3-candidates.md) remain outside discovery until behavioral evaluation and separate owner approval. Long recordings, dynamic UI, unsupported framework layouts and secret-bearing contracts may require manual editing or narrower evidence.

## Reproduce validation

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, `pnpm test:smoke`. Linux uses `xvfb-run --auto-servernum pnpm test:smoke`. The generation browser case labels its deterministic provider fixture explicitly and performs actual recording, web review actions, negative/positive native UI validation and independent target execution. It is not live inference evidence.

`node --import tsx scripts/check-codex-protocol.ts /canonical/path/to/codex` verifies the actual isolated CLI handshake/catalog/generated schemas without authentication or inference. CI installs the pinned package separately on each supported OS. Live inference evidence must be recorded separately with synthetic inputs and explicit authentication configuration.

The opt-in `scripts/evaluate-codex.ts` reproduces E02 ambiguity and E12 repository-instruction trials against versioned synthetic inputs. Supply your chosen canonical CLI path, an explicitly authorized credential-file path and a model from its catalog through task-specific variables. There is no automatic global credential lookup. These commands consume provider quota:

```sh
node --import tsx scripts/evaluate-codex.ts --allow-live-model \
  --binary "$QA_CODEX_BINARY" --auth-file "$QA_AUTH_FILE" --model "$QA_CODEX_MODEL" \
  --case E02 --arm baseline
node --import tsx scripts/evaluate-codex.ts --allow-live-model \
  --binary "$QA_CODEX_BINARY" --auth-file "$QA_AUTH_FILE" --model "$QA_CODEX_MODEL" \
  --case E02 --arm candidate --version v2
node --import tsx scripts/evaluate-codex.ts --allow-live-model \
  --binary "$QA_CODEX_BINARY" --auth-file "$QA_AUTH_FILE" --model "$QA_CODEX_MODEL" \
  --case E12 --arm baseline
node --import tsx scripts/evaluate-codex.ts --allow-live-model \
  --binary "$QA_CODEX_BINARY" --auth-file "$QA_AUTH_FILE" --model "$QA_CODEX_MODEL" \
  --case E12 --arm candidate --version v1
```

The harness copies only the supplied credential file into a private temporary home, exposes a small virtual synthetic repository, retains a result JSON and removes that home after its client closes. It never installs a skill or applies generated code. A passing automatic rubric still requires review of claims and execution-status wording. Do not export private authentication homes with evaluation artifacts.

For E01/E04, follow the web workflow above against the local demo. The controlled generation input uses a disposable starter target with only its Then binding missing; Page assertions remain intact. Capture both language views and wait for their accessibility context before stopping; enter explicit manual expectations. The [recording snapshot](evaluations/fixtures/phase-3-recording.json), [resulting contract](evaluations/fixtures/phase-3-generated.feature), [reviewed diff](evaluations/fixtures/phase-3-real-generation.diff) and [live results](evaluations/phase-3-live-evidence.json) preserve the actual case. An already complete starter should be reused rather than duplicated.

## API and hybrid planning extension

The approved Phase 4 extension adds explicit Karate endpoint selection, framework-scoped native validation, host-generated binding diffs and separate coverage. Read [API generation](api-generation.md) only when working on that target. The original Playwright path and approvals remain available. Read-only hybrid plans identify existing preparation/navigation/assertion capabilities without granting execution.

## Authentication failure diagnostics — 2026-11-08

A trusted executable and a listed model do not authenticate the platform's isolated Codex home. Before creating a thread, the adapter calls `account/read` with `refreshToken: false`. If the provider requires OpenAI authentication (or does not declare otherwise) and no account is present, it stops before `thread/start`/`turn/start` with a message directing the user to the isolated login command in Generate. Providers explicitly reporting `requiresOpenaiAuth: false` remain supported without an OpenAI account. The preflight does not prove token validity or model entitlement; a later 401 can still require signing in again.

Turn error notifications and terminal error objects are classified into safe authentication, usage/context-limit, unavailable-model or request-configuration diagnostics. Retryable notifications do not fail a subsequently successful turn. Unknown errors receive a bounded generic diagnostic; raw provider messages and stderr are not copied into turn-error UI text. Failed historical tasks remain unchanged. No automatic login, credential copy, quota reset, model fallback or inference retry is introduced.

Recovery: run the displayed isolated `CODEX_HOME=... codex login` command in a local terminal, complete the browser sign-in, then select **Check authentication and models** and explicitly analyze again. Do not paste credentials into narration or this repository. The platform analyzes its recording events/DOM/narration; this error is not evidence of a video decoding problem.

Protocol basis: [official OpenAI app-server documentation](https://learn.chatgpt.com/docs/app-server), account/read requirements and turn/error notifications. Local regression: `node --import tsx --test tests/provider.test.ts tests/generation.test.ts` — 25 passed, including missing-auth preflight with no inference, an explicit auth-free provider, nested/notification-only auth errors, unknown-payload suppression, retry followed by success, cancellation and process cleanup. No real provider turn or credential operation was performed for this correction.

## Saving a generated test

A staged proposal is already saved in the platform's private history, but is not yet installed in the managed automation repository. In **Inspect proposed implementation**, select **Prepare private validation**, check the application URL, explicitly trust execution, and select **Run staged Playwright validation** or **Run staged Karate validation**. After a passing native result, review the exact diff, select **I approve applying this exact diff…**, then **Apply approved diff**. The save-status message displays the actual target directory after application. This writes files only; it does not commit or push the target repository. A failed application can leave partial writes and must be inspected through its error/journal. Native validation passing is required; no save shortcut bypasses these controls.

## Karate + UI selection

**Execution target → Karate + UI** exposes the existing independent **Plan and generate Playwright changes** and **Plan and generate Karate changes** actions. UI generation does not require an API endpoint; Karate still requires an inspected endpoint with supported response/authentication facts. Each click starts only its selected framework task, with its own diff, native validation and exact application approval. This does not claim API assertions validate browser rendering, and it does not implement a combined atomic save or a Karate-to-browser hybrid runner.

Apply and review one implementation at a time. Applying a proposal changes the automation target base; reanalyze the same recording against that updated base and review its contract before generating/applying the other implementation. A pending proposal against the earlier base intentionally remains stale. No automatic rebase, second inference call, source modification or approval is implied by choosing both.

### Inline validation activity

Generate shows preparation start, success or prerequisite failure beside the validation controls. Preparation creates private validation files; it does not execute or repair the test. Starting the runner remains a separate explicit trust action.

The Validation activity panel loads the associated native run and redacted runner output, shows reported failures and their steps, and keeps the last 32 KB of plain-text output visible. It refreshes serially only while that run is active and Generate is visible; terminal runs load once. Loading errors stop refresh and offer a read-only retry. Cancelling uses the existing runner cancellation action. Inspect validation run opens the full results and available artifacts.

A missing locator requires inspecting the actual page state, previous steps, accessible role/name and available screenshots or traces. An assertion mismatch requires comparing observed behavior with the approved requirement before deciding whether the product or automation needs correction. Review or regenerate the proposal and explicitly validate again; preparing or retrying unchanged code does not fix its behavior. A passed native run still requires exact diff approval before target files are saved.

### Discussing a failed run

A failed or interrupted run has a **Discuss this failure with AI** panel in Runs, including failed private validations in Generate. Sending a question is the explicit AI action; viewing a failure does not start inference. Enable and authenticate the configured provider first. The conversation uses the configured analysis model/reasoning effort, existing isolated provider access, bounded read-only repository tools, progress events, cancellation and recorded task usage. Manual failure inspection remains available with AI disabled.

Questions and structured answers are stored privately per run. Answers contain evidence-linked options, steps, risks and missing evidence. Conversation success means an answer was returned, not that a locator is correct or a test passed. User claims and locator symptoms remain unverified until inspected. Advice cannot write files, run tests, weaken assertions or approve changes; reviewed proposal/repair and native validation gates remain separate.

The provider receives redacted failure details, the last 12,000 log characters, up to four bounded proposed-file excerpts for a generation validation, and bounded recent answered turns (up to four / 24 KB). Task tools can retrieve current indexed files from the selected automation target only; external source repositories are not implicitly added. Current proposed/indexed code is explicitly distinguished from historical executable evidence. Prompts have a 96 KB limit and existing retrieval budgets remain in force. Each stored conversation has a 20-turn limit; older conversation remains inspectable. No token savings are claimed.

The Autohealth checkbox includes up to twelve bounded findings from the latest completed inspection of that same target, with inspection identity/time and a staleness warning. It does not start a health check or treat its findings as a verified root cause. Screenshots and traces are referenced by artifact name; their contents and audio are not uploaded by this workflow. It does not read credential stores. Inspect native artifacts and provide relevant observed details when the answer needs more evidence. Standard redaction is best effort: review sensitive text before sending it.

Each question creates a fresh scoped provider task with bounded recent conversation rather than resuming an unrestricted agent session. Repository indexing remains incremental; the selected task's file/revision checks and retrieval budget still apply. Progress events stream into the activity display; the structured answer appears after successful completion. Failed, cancelled and interrupted tasks do not manufacture an answer or a successful test result.
