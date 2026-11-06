# ADR 0012: Evidence-bound API generation and separate coverage

Status: accepted for approved Phase 4; runtime validation remains in progress.

## Context

Phase 1 already executes Karate independently. Phase 3 supplies bounded repository context, exact canonical-contract review, private proposals, native validation and journaled application. A second API orchestration engine would duplicate those authorization rules. Business Gherkin cannot be assumed directly executable as Karate DSL, and API state cannot validate visible UI properties.

## Decision

Extend the existing generator with a framework choice and an explicitly selected indexed endpoint. Discover inline OpenAPI 3.0/3.1 JSON and literal method calls on identified Fastify instances without executing source code. Fastify facts identify routes but leave inherited authentication and request/response contracts unknown. OpenAPI JSON has no external reference fetch, code execution or YAML parser dependency. Resolve path/operation parameters deterministically; referenced schemas, missing JSON responses, dynamic routes and unsupported authentication remain questions.

The initial automatic translation supports explicit public GET operations and successful JSON responses. Authenticated, body-based and write operations remain manually implementable and executable through the existing trusted runner; the generator refuses to invent them. Reusable native authentication features may be indexed as capabilities but are not automatically activated or supplied credentials. This is an explicit supported-syntax boundary, not general API discovery completeness.

Select the existing manifest binding whenever present. Creating a second feature for an already bound scenario would execute duplicate behavior in a native suite. Missing bindings receive one deterministic destination; split multi-file bindings require a separately reviewed plan. Preserve canonical identities/example values and existing API assertions. Reusable native feature calls must name inspected indexed target capabilities. Models cannot supply manifest JSON, Java, Gradle, credentials or configuration changes. The host generates binding metadata, including canonical hash, endpoint source hash and separate observable coverage, and includes it in the reviewable diff. The complete private overlay carries the existing trusted API project and wrapper; no UI dependency installation is required for API validation.

Reuse the current fixed Karate adapter. Require complete scenario-linked native evidence for the selected framework before applying the exact diff. Contract/source/target/stage freshness and execution trust remain separate gates. Static guards restrict the generated subset but do not make Karate, JavaScript, Gradle or existing helpers safe to execute with host permissions.

A read-only hybrid plan identifies actual API preparation, UI navigation and UI assertion capabilities. It grants no write or execution permission. Owned synthetic demonstration helpers create a fresh server-issued context per invocation with no mutable cache. UI and API preparation use equivalent data and the original visible assertions. Concrete environment mutation still needs authorization; source indexing never starts setup requests.

Coverage groups native evidence by canonical scenario and contract hash while displaying framework, environment and executable freshness separately. Declared bindings, stale bindings, missing files, absent execution and passed/failed native outcomes remain distinguishable. Grouping is traceability, not equivalence certification or an automatic hybrid runner.

## Consequences

No new product dependencies or external services are required for discovery/manual execution. The bounded subset is predictable and testable, at the cost of refusing common OpenAPI references, YAML, authenticated generation and arbitrary backend frameworks. Expansion needs concrete supported cases and appropriate validation rather than permissive fallbacks. Row-specific Karate execution remains unsupported until exact native selection is demonstrated; no entire-suite fallback is introduced.

Schema/helper reuse and actual setup measurements are evaluated separately from skill effectiveness. Candidate skill format validation is not behavioral validation or activation. Phase 3 CI debt is retained under the owner's explicit sequencing exception; Phase 4 cannot claim cross-system acceptance from local Intel results.

## Primary references

- [OpenAPI 3.1 specification](https://spec.openapis.org/oas/v3.1): operation parameters and security inheritance.
- [Karate feature composition](https://docs.karatelabs.io/reusability/calling-features/): isolated calls and cache lifecycle.
- [Karate parallel execution](https://docs.karatelabs.io/running-tests/parallel-execution/): independent scenarios and concurrency.
