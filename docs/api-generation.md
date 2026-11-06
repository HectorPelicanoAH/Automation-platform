# API generation and coverage

Phase 4 builds on the [reviewed generation workflow](generation.md). Its current acceptance state is [recorded separately](phase-status.md); local checks do not establish three-system CI acceptance.

## Generate a reviewed API binding

1. Register a separate backend source in Workspace, opt into indexing and select it for recording analysis. Do not place application sources inside the platform or target repository. An OpenAPI file name begins with `openapi` or `swagger` and ends in `.json`; include/exclude policies still apply.
2. Analyze recording/narration, answer missing business questions and approve the exact canonical Gherkin. API state alone is not evidence of an observed UI outcome.
3. Choose **Karate · API business state** under Execution target, then choose a current discovered endpoint. Route-only facts and incomplete/unsupported contracts show questions and block generation. The initial automatic subset is inline OpenAPI 3.0/3.1, public GET, known query parameters and an explicit successful 200 JSON response schema. No reference resolution, remote fetch, YAML, generated credential/auth flow, body/write generation or guessed schema.
4. Inspect the reuse plan and exact diff. Existing API bindings are reused rather than duplicated. The platform creates manifest changes itself; the provider cannot author them. Canonical identities/example values and prior API assertions must survive. Existing native helpers are read through bounded tools and explicitly named in the plan.
5. Prepare the private validation overlay. Review the staged code and existing dependencies, choose the authorized application URL and grant execution trust. Karate/Gradle/helpers run with host privileges; static checks are not a security sandbox. These controls are independent from business approval and target application.
6. Inspect genuine native results/artifacts. Only complete scenario-linked passing evidence for this exact staged executable permits separately approving and applying its diff. Cancellation, rejection and stale source/target/contract hashes leave target application unavailable.
7. Trust the applied target's new executable fingerprint before normal runs. Run the target CLI independently using its README and selected `QA_FEATURE` classpath. No provider/platform is required for subsequent manual execution.

Open **Scenarios → UI / API coverage** to inspect declarations and native results. Refresh after a run or edit. Results identify framework, environment URL, contract revision and whether executable code has changed. Missing or stale bindings are not passing tests. Two executions against different environments are displayed separately and must not be treated as equivalent evidence. Native outline-row filtering remains unsupported; use feature/scenario/tag selection where supported.

## Owned synthetic preparation demonstration

The local demo has `POST /api/demo/contexts` and `GET /api/demo/contexts/:id`, plus `/demo/setup`. These create only disposable in-memory guest context for the two demonstration datasets; there is no account, purchase or real shipping mutation. Context IDs are server-issued UUIDs, expire after 15 minutes and are bounded to 1,000 retained entries. Unsupported country/language/brand combinations are rejected. Restarting the demo discards them.

The target starter includes:

- `api/src/test/resources/helpers/promotion-schema.feature`: reusable native response schema.
- `api/src/test/resources/helpers/prepare-context.feature`: per-invocation native setup and response validation; no cached mutable result.
- `ui/builders/preconditions.ts`: explicit API preparation using an authorized request context and environment.
- `ui/pages/GuestSetupPage.ts`: equivalent serial UI preparation with scoped unique accessible locators.

Helpers are available for explicit reuse; merely indexing them does not execute them. **Inspect hybrid preparation plan** in Generate links the indexed API helper to existing Page navigation and visible assertions. The plan is reviewable capability lookup, not a claim of completed execution or an automatic authorization. Pass the prepared customer object (including contextId) to the existing Page and retain its visible assertions when implementing a reviewed hybrid scenario.

Do not use these demo-specific helpers against an unrelated external API. Imported authentication helpers may use native composition, but their credentials, side effects and cache lifecycle require explicit review. The automatic public-GET generator blocks unsupported auth; manual Karate editing/execution remains available.

## Reproduce validation

Use the pinned [local toolchain](local-development.md), install the existing target dependencies and cache locked Gradle dependencies as described in the starter. From the platform repository:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm exec playwright test --config tests/playwright.config.ts tests/api-generation-ui.spec.ts
```

The browser case explicitly uses a deterministic provider fixture. It performs real browser review, actual Karate staging, exact disposable-target application, independent native execution and the deliberate wrong-rendering comparison. It also checks unique concurrent setup, native overlapping start intervals and serial UI versus API preparation measurements with the same final Page assertions. Reports label the fixture and do not claim actual model inference.

An explicit live proposal harness is available, but it is not part of CI:

```sh
node --import tsx scripts/evaluate-api-generation.ts --allow-live-model \
  --binary "$QA_CODEX_BINARY" --auth-file "$QA_AUTH_FILE" --model "$QA_CODEX_MODEL"
```

Supply canonical regular files and an explicit model ID after authorizing synthetic provider sharing and credential use. There is no default credential path or model. The command may consume provider quota; it creates only an isolated synthetic proposal, removes its credential home and disables AI afterwards. It does not execute or apply generated code. Inspect its `review.diff` and then use the ordinary separately trusted validation/application workflow. An optional `--candidate-skill` tests the inactive candidate procedure without installing it; that trial is not activation.

A real-model case requires separately configured isolated authentication and approved synthetic input sharing. Never copy credentials automatically because a development phase was approved. Until such a case executes, its validation remains pending. The [Phase 4 report](phase-4-report.md) records actual evidence and limitations.
