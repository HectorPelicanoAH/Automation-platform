# ADR 0002: Separate repositories with explicit root grants

Date: 2026-11-05. Status: accepted planning baseline.

## Context

Users bring multiple frontend/backend sources and an automation target with independent Git history. A local web server must not become an unrestricted filesystem or shell interface.

## Decision

Platform code stays in its own repository. Context sources are registered by canonical absolute root and default read-only, with indexing opt-in and include/exclude policy. A managed target is a separate user-owned directory/Git root, independently executable. Reject root overlap and aliases that would bypass these roles. Never checkout a preferred ref in a source tree or initialize nested Git.

All reads/writes use root IDs, path-aware containment, symlink checks and explicit operation grants. Generated changes require exact diff/base approval; manual editor save authorizes its displayed change. Source writes require a separate explicit grant. Import registration alone executes no project code and rewrites nothing.

## Alternatives

Putting sources/tests under the platform simplifies paths but couples lifecycles and access. Arbitrary path APIs and broad shell tools are convenient but expose the user's workstation. Copying entire sources into the platform creates stale duplicates and secret exposure.

## Consequences

Path/security handling becomes a first-class subsystem. Existing automation projects need explicit layout mappings and unsupported-state diagnostics. Platform read-only policy is not a host sandbox for arbitrary test scripts; executing imported code requires user trust or real isolation.

## Validation and revisit

P1 tests traversal, symlink chains, sibling prefixes, alias/overlap, non-Git sources, imports, permissions and no unintended source changes. Revisit overlap support only with a concrete use case and permission intersection rules. See [security](../security.md).
