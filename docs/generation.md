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
