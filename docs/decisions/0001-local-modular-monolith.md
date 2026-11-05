# ADR 0001: Local modular monolith with supervised workers

Date: 2026-11-05. Status: accepted planning baseline.

## Context

Developers must clone and run locally with minimal infrastructure. Long browser/JVM/agent tasks must not block settings, editing or run inspection. Independent services and remote accounts would weaken offline manual usefulness.

## Decision

React/TypeScript frontend, Fastify control process, Node 24 LTS initial compatibility target and pnpm workspaces. Serve one loopback origin. Backend modules own workspace/scenario/execution/reporting boundaries; public contracts and domain logic remain framework-independent. A bounded supervisor launches workers when needed, starting with Playwright and Karate in P1. Database writes stay in the control process.

Create packages only for current behavior and actual sharing. Keep a separate real demo process so failures/URLs are observable and the platform does not mock the tested application.

## Alternatives

Microservices/external queues introduce discovery, lifecycle and installation cost without measured need. Next.js adds a server-rendering model without a clear requirement. Electron/Tauri may later simplify native integration, but also expand packaging and privilege scope. A single request-loop process for all work risks blocked UI and cancellation.

## Consequences

Simpler deployment and cross-module debugging; explicit discipline is needed to avoid a monolithic dependency tangle. Supervised processes improve crash/resource isolation but are not security sandboxes. Single-user/local-only is a supported limitation, not a hidden multi-tenant design.

## Validation and revisit

P1 proves real runners, cancellation, restart reconciliation, local session/Origin policy and responsive metadata reads. Revisit remote workers or service separation only with measured resource/deployment pressure and a separately approved security design. See [architecture](../architecture.md).
