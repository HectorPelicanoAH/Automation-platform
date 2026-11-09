# ADR 0003: Local SQLite, artifact manifests and incremental capabilities

Date: 2026-11-05. Status: accepted planning baseline.

## Context

Persistence must be easy locally, version-aware, and economical for repeated retrieval. Recordings/traces are large; source trees change independently of the platform. Most capability questions are structured relationships rather than semantic similarity searches.

## Decision

Use SQLite for metadata, revisions, jobs, capabilities and edges; filesystem storage for large immutable artifacts with checksums/retention manifests. One backend owns database writes. Enable foreign keys and short transactions; WAL only on local disk with verified engine 3.51.3+ or a documented fixed backport. [SQLite's WAL documentation](https://www.sqlite.org/wal.html) describes the relevant concurrency/storage constraints and WAL-reset fix.

Add a structured index incrementally in P3, with file content/config/extractor hashes, source commit plus dirty state, deletion reconciliation and bounded provenance-aware lookup. Add relational graph edges in P5. A watcher is a hint, not the consistency source. No universal full-repository model context.

## Alternatives

PostgreSQL/graph services increase setup cost. Storing blobs in rows increases database/backup burden. Embeddings alone provide weak provenance and invalidation. Git commit alone misses dirty-tree changes. Re-parsing every file wastes work.

## Consequences

Single-writer throughput and synchronous driver calls need measurement. Artifact/filesystem and SQLite updates need journals/reconciliation, not claims of cross-store atomicity. Native driver version and build availability are P1 compatibility risks. Supported extractors are deliberately limited and visible.

## Validation and revisit

P1 records the actual embedded SQLite version, integrity and restore tests. P3 measures unchanged-file extraction reuse, deleted/stale result behavior, retrieval bytes and precision. Introduce FTS/embeddings or another database only after measured misses/contention. See [domain model](../domain-model.md).
