# ADR 0004: Canonical Gherkin, explicit bindings and separate coverage

Date: 2026-11-05. Status: accepted planning baseline.

## Context

Users need a single understandable business contract, but Playwright-BDD and Karate do not execute interchangeable Gherkin DSLs. API state cannot prove rendering or visibility. Example rows and revisions must survive editing and report mapping.

## Decision

Keep authoritative business `.feature` files and portable identity/binding metadata in the automation target. Parse using official Gherkin semantics, preserve source text and stable scenario/row IDs, and store immutable executed snapshots. SQLite owns drafts/projections, not a competing canonical file version.

Use Playwright-BDD to compile the UI business contract to Playwright Test; Pages/components hold interactions, steps express intentions, fixtures/builders supply isolated setup. Karate has separately authored/generated technical features, native helpers and schema assertions. Each binding declares the properties it covers and links implementation to canonical revision/evidence.

Adapters advertise selection capabilities and normalize actual results while retaining native reports/attempts. Unsupported row filtering is explicit. No silent fallback to running a larger selection. P1 ships hand-authored demo bindings; generative translation arrives only in P3/P4.

## Alternatives

One raw feature for both engines leaks technical details or loses business intent. Two unrelated scenario catalogs lose traceability. Titles/line numbers alone are unstable IDs. Making the database the only contract store undermines independent CLI use and Git review.

## Consequences

Bindings, stale revision detection and mapping require deliberate metadata. Imported tests can remain unmapped until reviewed. Reports must distinguish UI/API assertions and missing step details instead of fabricating a unified pass.

## Validation and revisit

P1 proves outlines, persistence, native result mapping, unknown mappings and a UI-only failure with a correct API response. P4 validates generated API/hybrid coverage. Revisit serialization only if a proven round-trip preserves comments/dialects/structure. See [phase 1 proposal](../phase-1-plan.md).
