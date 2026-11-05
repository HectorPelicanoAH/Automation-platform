# ADR 0009: Phase 1 verified runtime and conservative execution boundaries

Date: 2026-11-05. Status: accepted within the approved Phase 1 scope; acceptance validation is in progress.

## Context

Phase 0 deliberately left exact package pins, native compatibility, report schema details and local session implementation to a real compatibility milestone. The available workstation is macOS 15.7.3 Intel, not Apple Silicon. The owner chose MIT and explicitly retained mandatory multi-system support.

## Decision

Pin the [recorded toolchain](../local-development.md). Native SQLite 3.53.4 satisfies the WAL fix requirement. Use TypeScript 5.9.3 within the selected linter's supported peer range rather than incompatible TypeScript 7. Use pnpm 11's explicit `allowBuilds` for only SQLite/esbuild. Verify and retain official Gradle wrapper/distribution hashes and original license.

Use cookie + origin-scoped session proof + CSRF. Cookies are shared across ports, so cookie alone is insufficient for a privileged localhost tool that may test another local application. Artifacts stay attachments with checksums; native HTML does not execute on the privileged origin.

Keep imported layout support explicit. Literal tags and unique scenario IDs support safe fixed argument construction. Disable row selection and leave unavailable native row attribution null. Bind API coverage to the reviewed canonical content hash; semantic or textual contract changes require an explicit API assertion review rather than silently claiming coverage.

Test Ubuntu 24.04, macOS Apple Silicon and macOS Intel through a pinned GitHub Actions matrix. Record actual versions/architecture and outcomes. Do not lower required support to the local host merely to complete the phase.

## Alternatives

Using the latest TypeScript outside the linter range produces a known compatibility mismatch. Trusting cookies alone leaves cross-port credential exposure. Guessing row mapping from generated line numbers fabricates traceability. Rewriting API expectations on each Gherkin save weakens independent coverage. Declaring a configured CI matrix passing would fabricate validation.

## Consequences

Private launch/session handling and deliberate CLI setup are necessary. Strict API binding freshness can require review even for whitespace-only contract changes; this is conservative, visible and reversible. Exact native row reconciliation and broader import layouts remain future measured extensions, not hidden capabilities.

## Validation and revisit

Local native runners and SQLite compatibility are proven; full acceptance, security, cancellation/performance and cross-platform evidence must be finalized in the [phase report](../phase-1-report.md). Revisit these limits only with evidence and within an approved phase. No Phase 2 functionality is introduced.
