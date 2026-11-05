# ADR 0006: Provider-neutral tasks with Codex app-server and staged diffs

Date: 2026-11-05. Status: accepted planning baseline.

## Context

The product needs visible progress, task cancellation/history, scoped context, tool visibility and review of generated changes. Provider prompts and protocol details should not own workspace permissions or the functional model.

## Decision

Implement a task-oriented provider port in P3, with Codex app-server over local stdio as the first adapter. It suits the interactive event/approval lifecycle described by the [official app-server documentation](https://learn.chatgpt.com/docs/app-server). Pin and contract-test the protocol; the SDK remains an alternative for future simpler jobs.

The orchestrator selects deterministic lookup/context and a user-configured supported model/reasoning budget. It owns authoritative grants and proposal state independently of provider decisions. Untrusted content cannot override instructions. Use platform-owned configuration and restricted tools, not arbitrary imported hooks/skills or user-global integrations.

Generate into a disposable proposal tree. Validate permitted paths, preserve business intent, run relevant checks under the execution policy and show exact diff/results. A human approval binds base/diff hashes and destination before apply. Reject, cancel or changed bases leave the target unchanged. External sources and active skills remain protected.

## Alternatives

A generic unrestricted shell agent is easy but unsafe. Direct provider calls spread protocol details across workflows. SDK-only is simpler for scripts but would need lifecycle/approval integration for this UI. Automatically applying passing code removes meaningful human control.

## Consequences

Adapter contract tests, authentication setup and cancellation/reconciliation cost are necessary. Local-first does not imply local inference: configured AI can use network and incur provider costs. Manual functions remain available with AI disabled. Tests passing do not replace diff review.

## Validation and revisit

P3 verifies streaming/cancel/history, tool visibility, injection denial, base conflicts and proposal rejection/application. Record provider usage or labeled estimates without assuming account entitlement/prices. Revisit adapter choice only if the pinned supported interface cannot meet these needs.
