# ADR 0008: Deterministic health diagnostics and comparable improvement metrics

Date: 2026-11-05. Status: accepted planning baseline.

## Context

Framework health, stale knowledge and inefficiency can be inspected cheaply without an LLM. Heuristics such as unused components and brittle locators can be wrong; aggressive automated fixes risk changing behavior.

## Decision

Start with readiness checks in P1, then deliver full on-demand/scheduled platform, automation and knowledge diagnostics in P6. Use deterministic checks first and optional model explanation only where it adds justified value. Findings include severity, evidence, stable fingerprint, source revision, confidence and recommended action.

Read-only scheduled checks run only within registered policy and while the service is active. Diagnostic execution itself has a cost/budget; never launch arbitrary repository scripts as an alleged read-only check. Suggested changes to code, behavior, instructions or active skills require explicit review.

Measure context bytes/files, exposed provider tokens or labeled proxies, searches, reuse, generation success and maintenance success on controlled case/config versions. Compare quality and total cost, not just prompt length. No unmeasured token-saving or performance claims.

## Alternatives

LLM-only health checks cost more and vary unnecessarily for deterministic rules. Auto-fixing findings creates hidden behavioral changes. Unversioned benchmarks cannot support causal claims. Adding a monitoring service before local health needs are known increases installation cost.

## Consequences

Some findings are candidates requiring verification. Scheduled checks need cancellation, deduplication and quotas. Static knowledge candidates should not be promoted merely because a metric improves on a tiny dataset.

## Validation and revisit

P6 uses fixture-backed expected findings, false-positive review, comparable baseline/candidate evidence and exact rollback. Broader optimization is deferred until metrics show a real bottleneck. See [health design](../autohealth.md) and [measurement policy](../evaluations/README.md).
