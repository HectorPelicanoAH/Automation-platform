# Architecture decision records

Records 0001–0008 are **accepted planning baselines for Phase 0**; record 0009 captures verified decisions inside the explicitly approved Phase 1. They never authorize later phases. Revisit with measured evidence and record a superseding ADR; do not erase history.

| ADR                                               | Decision                                                               | Implementation starts                |
| ------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| [0001](0001-local-modular-monolith.md)            | Local modular monolith and supervised workers                          | P1                                   |
| [0002](0002-repository-boundaries.md)             | Separate repositories, canonical roots and least privilege             | P1                                   |
| [0003](0003-storage-and-incremental-index.md)     | SQLite metadata, filesystem artifacts and structured incremental index | P1 storage; P3 index                 |
| [0004](0004-functional-contract-and-execution.md) | Canonical Gherkin with separate framework bindings and coverage        | P1 manual bindings; P3/P4 generation |
| [0005](0005-recording-and-evidence.md)            | Public Playwright capture plus narration with explicit provenance      | P2                                   |
| [0006](0006-agent-integration-and-approval.md)    | Provider-neutral orchestration, Codex app-server and staged changes    | P3                                   |
| [0007](0007-knowledge-and-skill-evolution.md)     | Evaluated, approved, reversible knowledge and skill evolution          | P0 policy; P6 engine                 |
| [0008](0008-health-and-measurement.md)            | Deterministic health checks and comparable measurements                | P1 readiness; P6 full health         |

Phase 1 implementation amendment: [0009 — runtime and boundaries](0009-phase-1-runtime-and-boundaries.md).

Each ADR records context, decision, alternatives, consequences and a validation/revisit trigger. Exact dependency pins are implementation evidence, not architecture-only claims. Research references are in [sources](../sources.md).

- [ADR 0010 — Recorder evidence and privacy](0010-recorder-evidence-and-privacy.md): Phase 2 implementation, real capture boundaries, manual transcription and synthetic audio evaluation limits.
