# Phase 4 validation report

PHASE: 4 — API generation and cross-layer intelligence

STATUS: VALIDATION. The owner authorized `APPROVE PHASE 4` and explicitly answered “Si” to proceeding with Phase 3 CI outstanding. That exception retains every missing cross-system check and does not mark Phase 3 complete.

## IMPLEMENTED

- Read-only bounded inline OpenAPI/Fastify route discovery and Karate feature/helper facts; hashes, incremental caching, repository scope and questions distinguish known contracts from route-only observations.
- Explicit Playwright/Karate target choice and selected endpoint, framework-scoped proposals, reuse of bound API features, host-authored manifest diff and preserved canonical examples/API assertions.
- Private API overlays, real native Karate validation, separate exact-diff application, independent target execution and stale/rejected/unsafe proposal controls using the existing orchestration.
- UI/API coverage declarations and native results kept distinct, including environment and executable freshness.
- Capability-backed read-only hybrid plans, owned disposable context preparation, reusable native schema/setup helpers and equivalent API/UI setup helpers with original visible Page assertions.

## ARCHITECTURAL DECISIONS

[ADR 0012](decisions/0012-api-contracts-and-coverage.md) records reusing current orchestration and runners, updating existing bindings rather than duplicating features, host-owned manifest translation and explicit observability. Automatic translation has a supported public-GET/inline-JSON subset. Unknown auth, referenced/missing schemas and write operations require manual implementation or a future supported-case extension; no inferred defaults or expanded execution fallback.

## VALIDATION

Versioned [local evidence](evaluations/phase-4-local-evidence.json), [case inputs](evaluations/fixtures/phase-4-v1.json), [generated native feature](evaluations/fixtures/phase-4-generated.feature) and [reviewed diff](evaluations/fixtures/phase-4-reviewed.diff) preserve actual outcomes. Runtime branch: `codex/phase-4-api-generation`.

| Executed check                                                               | Actual outcome                                                                                                                                                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --import tsx --test tests/*.test.ts`                                   | 47 PASS, zero failed/skipped/cancelled; pinned Node 24.22.2                                                                                                                  |
| `pnpm typecheck`, `pnpm lint`, `pnpm build` through pinned Node entry points | PASS on final runtime code                                                                                                                                                   |
| `pnpm format:check` through pinned Node entry point                          | Checked before final commit                                                                                                                                                  |
| Full headed browser suite                                                    | 9 PASS in 10.3 minutes during implementation; includes real five-minute synthetic audio                                                                                      |
| Affected generation browser/native flows after binding/assertion changes     | 2 PASS in 3.2 minutes after host-correction changes; pure parser hardening additionally covered by deterministic positive/negative checks                                    |
| Private Karate validation and independent CLI                                | Two promotion examples PASS; applied independent full native suite contains exactly 2 scenarios, no duplicate generated feature                                              |
| Wrong-render control, same local environment                                 | Karate 2 PASS, original Playwright 2 FAILED on visible 99€ amounts; UI/API evidence remains separate                                                                         |
| Concurrent native preparation                                                | Two successful scenarios, distinct server-issued UUIDs, exact context read-back and overlapping native start intervals                                                       |
| Equivalent local setup comparison                                            | Three alternating samples per method; median UI 242.469 ms, API 89.846 ms, same final visible Page assertions; raw times retained, no statistical/general speedup claim      |
| Report normalization                                                         | Final mapper replay against genuine Karate report passes; nested helper timings no longer counted twice, child failures retained; prior stored history is not rewritten      |
| Candidate skill format                                                       | `quick_validate.py` PASS; not behavioral validation or activation                                                                                                            |
| Real authenticated Codex API generation                                      | Two real responses retained; exact second response accepted by corrected host replay and verified by actual native negative/positive controls, applied disposable-target CLI |
| Current three-system CI                                                      | NOT RUN; last Phase 3 final run was rejected before any steps for GitHub billing/spending state; no new Phase 4 Actions run launched                                         |

Commands use the pinned project dependencies, Java 21.0.13+9, Gradle 9.2.1 and Karate 2.1.4. No new product dependencies were introduced. The initial browser/native acceptance uses an explicitly labeled deterministic provider and synthetic QA review actor. The additional live acceptance uses a real Codex response, with corrected-host replay explicitly identified below. Neither represents owner approval of production code. The screenshot was visually inspected. Automatic skill effectiveness and token savings are unmeasured.

Initial failures are retained in local logs: an exact label selector did not identify the Gherkin editor; the test now uses its accessible textbox role. A sandboxed deterministic run could not listen on localhost; its permitted rerun passed. A conservative secret heuristic rejected a host-generated manifest's known content hash; the host-only manifest transformation now preserves raw base content and never exposes it to provider writes. A malformed negative-test Gherkin was corrected to test the intended unsafe statement. No functional assertion was weakened. Automatic review rejected one proposed command that also removed a test assertion; that command did not execute. The assertion was retained and explicit separate UI-failure/API-pass checks were added before the permitted rerun.

Missing required acceptance: the current three-system CI matrix. Candidate behavioral evaluation remains unexecuted; the candidate is inactive. The owner separately authorized temporary session reuse by saying “Autorizo”; both isolated credential homes were removed and AI was disabled in the acceptance environments.

### Real-model acceptance and host correction

[Live evidence](evaluations/phase-4-live-evidence.json) preserves two actual Codex responses, 50,879 reported tokens total, both original FAILED host tasks and subsequent offline replay. The first response incorrectly put a source endpoint in target automation reuse; the schema now makes that distinction explicit, and unknown reuse is still rejected. The second response added the missing business assertions and replaced an inline schema by the identical existing helper schema. The former line-preservation guard rejected that safe extraction.

The correction accepts only a single-scenario Background extraction through an inspected, unchanged target helper containing one flat immutable literal with exactly equal schema keys/values. Literal-only call-site expressions, alias-use checks and rejection of weaker/dynamic/malformed helpers keep the supported equivalence narrow. Other changed existing assertions remain rejected. No JavaScript or helper code is executed during this comparison.

The exact preserved second response was resubmitted to corrected host validation with unchanged input file hashes. That is **offline host replay**, not a new authenticated turn on the final validator revision; its usage is null and is not added to live token accounting. No further inference was needed. The [recorded model output](evaluations/fixtures/phase-4-real-output.json), [case fixture](evaluations/fixtures/phase-4-live-v1.json), [real generated feature](evaluations/fixtures/phase-4-real-generated.feature) and [exact reviewed diff](evaluations/fixtures/phase-4-real-reviewed.diff) retain provenance and support a deterministic regression.

Actual Karate checks show the deliberately incomplete baseline passing two cases against schema-correct but incorrect business data, the generated code failing both cases against those incorrect values, and both cases passing against correct API state. Target files stayed unchanged during staged validation. After coding-agent inspection of the exact diff and the synthetic QA approval action, only the owned disposable target was updated; its independent full Karate suite passed exactly two scenarios. Owner repositories and production systems were not modified. Native checks ran without a credential home present.

## KNOWLEDGE

[Operating guide](api-generation.md), ADR, Phase 4 plan/status and curated native helper patterns are documented. One new versioned skill candidate is outside discovery paths, format-valid and inactive. No active skill or universal AGENTS instruction was changed. Native setup does not cache authentication or mutable context; no cache speedup is claimed.

## QUALITY

Limits: supported syntax/operations rather than universal OpenAPI/backend support; generated code executes with host privileges after explicit trust; inherited Fastify hooks cannot be inferred safely; no automatic multi-framework transaction or precise Karate row selector. Coverage is traceability, not equivalence certification. Setup measurements are small local samples, not a general performance claim.

GitHub Actions previously rejected all final Phase 3 jobs for account payment/spending-limit state. No new CI runs, billing changes, support-target reductions or passing CI claims are made for Phase 4. Commits use `[skip ci]` to avoid a known-blocked automatic attempt; the entire final branch still requires the full matrix once the external issue is resolved. Required Ubuntu x64/macOS ARM64/Intel validation remains outstanding.

## NEXT PHASE

Phase 5 remains PROPOSED and unapproved. Its objective and proposed deliverables are failure classification, evidence-based diagnosis, minimal repair proposals, capability relationships and targeted native validation. It must preserve original assertions and requires its own exact approval after current validation/reporting. Proposed acceptance is to distinguish product/test/environment/data failures on versioned cases, repair a locator defect while preserving assertions, retain product regressions as failures and validate reviewed changes against impacted native behavior. Dependencies are current-phase acceptance, reliable artifacts and a separately approved Phase 5. No maintenance service was implemented.

## APPROVAL REQUIRED

No Phase 5 authorization is requested. Continue Phase 4 validation within approved scope; the real generated response has native evidence, while cross-system CI still awaits resolution of the external GitHub block. The phase remains incomplete until required checks are recorded honestly.
