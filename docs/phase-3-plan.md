# Phase 3 implementation plan

Status: VALIDATION. Approved by the exact human instruction `APPROVE PHASE 3` on 2026-11-06. Phase 4 is subsequently approved with its entry gate pending; Phases 5–6 remain PROPOSED. Required remaining evidence is listed in the [report](phase-3-report.md).

Objective: turn actual recording evidence into a reviewed functional contract and reusable, independently executable Playwright automation.

## Scope and milestones

1. Opt-in incremental TypeScript/JavaScript frontend and automation index, bounded capability lookup with repository/file hashes, Git revision and explicit unsupported/stale/truncated states. No backend API discovery or graph engine.
2. Provider-neutral tasks and a pinned, contract-tested Codex app-server stdio adapter: isolated configuration, structured results, streaming progress/tool visibility, cancellation, persisted history and actual usage when exposed. No imported tools/hooks/instructions; no unrestricted agent shell or direct target writes.
3. Evidence-bound scenario/outline proposals from P2 recordings and explicit narration, with observed/narrated/inferred distinctions, source references and unresolved questions. User editing and approval of exact Gherkin revision precede implementation.
4. Reuse lookup and explicit implementation plan; generated files remain in private staging. Review exact diff/base hashes, reject stale bases/unsafe paths, authorize one concrete proposal, journal application and preserve rollback evidence. Generated code executes only under a separate trusted-project/run action.
5. Working web workflow, manual/provider-disabled behavior, real promotion recording-to-Gherkin-to-Playwright demonstration, security evaluations and three-system regression. Documentation and evaluated skill candidates remain inactive pending separate activation approval.

## Decisions and tradeoffs

Use the existing modular monolith, private SQLite and workspace gateway. TypeScript AST parsing is deterministic and never executes source/configuration. Incremental indexes reuse unchanged hashes and report extraction coverage honestly. Retrieval has file/byte limits and excludes secrets/instructions; a preferred branch never triggers checkout. Codex receives bounded evidence and application-owned tools, not registered filesystem roots. Its configuration/authentication live outside Git and outside model-readable context. Pin the verified protocol and fail closed on unsupported versions/capabilities.

Return structured Gherkin or file-change proposals; provider output is untrusted and cannot approve changes. Review and application are platform-owned, independent of provider approvals. Avoid executing staged generated code before authorization; static parsing/type checks do not certify safety. Reuse the existing native runner after explicitly trusting the reviewed target revision.

## Measurable acceptance

| ID    | Evidence required                                                                                                                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3-01 | Multiple opt-in sources plus managed target indexed by hash/revision; unchanged files are not reparsed, exclusions/symlinks/secrets enforced, bounded relevant context and unsupported syntax disclosed.                                      |
| P3-02 | Actual Codex app-server handshake and real inference on synthetic evidence; streaming/tool calls, cancellation, provider errors and token usage or labeled missing/estimates persisted. Deterministic protocol fixtures are labeled fixtures. |
| P3-03 | Real P2 promotion recording plus explicit narrated datasets yields a two-row outline with evidence links; missing expectations stay questions. Unobserved UI assertions cannot be justified by API state alone.                               |
| P3-04 | Exact edited Gherkin must be reviewed/approved before planning/code generation; rejection, editing, stale evidence and provider-disabled state preserve manual functionality and target files.                                                |
| P3-05 | Capability lookup and plan reuse an existing Page/component and step when applicable; resulting Playwright-BDD code keeps thin steps, fixtures and scoped locators, without duplicate abstraction or invented business rules.                 |
| P3-06 | Exact diff inspection/approval before managed writes; changed base/target/path, source writes, critical instructions/skills and prompt injection cannot bypass scope. Application journaling reports partial errors honestly.                 |
| P3-07 | Reviewed automation independently executes actual promotion UI title/amount/subtitle assertions for both rows; provider output and simulated reports never count as successful execution.                                                     |
| P3-08 | Real web flow, task history/cancellation/tool visibility, manual AI-disabled fallback, deterministic security cases, type/lint/format/build and retained Phase 1–2 checks pass on Ubuntu x64/macOS ARM64/Intel.                               |

## Dependencies and risks

P2 is complete. Codex needs a compatible CLI, isolated configuration and explicit authentication; model catalog is not proof of inference entitlement. AI may consume account quota. Restrict live acceptance to synthetic inputs and record its actual provider/model/usage. Configuration, protocol instability, AST limitations, inference ambiguity, generated code execution and filesystem races are material risks. Never load complete repositories or secret stores into prompts. Unsupported sources remain inspectable manually. Skill activation is separately gated and is not implied by this phase approval.

Record significant decisions, executed commands and real artifacts. If required inference or platform validation cannot run, retain VALIDATION and list the missing evidence. Stop after the completion report; Phase 4 requires `APPROVE PHASE 4`.
