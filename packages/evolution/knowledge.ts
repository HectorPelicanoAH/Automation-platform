import { randomUUID } from 'node:crypto';
import { hash } from '../domain/gherkin.ts';
import { AppError } from '../domain/model.ts';
import type { Workspace } from '../workspace/workspace.ts';
import type { CapabilityIndex, RootRef } from '../intelligence/index.ts';
import { readText } from '../workspace/files.ts';
import { recentChanges } from '../intelligence/relationships.ts';
import type { Repair } from '../maintenance/model.ts';
import type { GenerationTask } from '../generation/model.ts';
import { targetRevision } from '../generation/staging.ts';
import type { EvolutionRepository } from './repository.ts';
import type { EvidenceRef, Knowledge, KnowledgeClass, KnowledgeVersion } from './model.ts';
import { redact } from '../execution/reports.ts';
import { safeText } from '../recording/privacy.ts';

export class KnowledgeManager {
  constructor(
    readonly repository: EvolutionRepository,
    readonly workspace: Workspace,
    readonly index: CapabilityIndex,
    readonly tasks?: () => GenerationTask[],
    readonly repairs?: () => Repair[],
  ) {}
  fresh(version: KnowledgeVersion, cache = new Map<string, string | null>()) {
    try {
      return version.sources.every((source) => {
        const root =
          source.ref.kind === 'target'
            ? this.workspace.target(source.ref.id)
            : this.index.root(source.ref);
        const rootKey = source.ref.kind + ':' + source.ref.id;
        if (source.revision !== undefined) {
          if (!cache.has('revision:' + rootKey))
            cache.set('revision:' + rootKey, recentChanges(root.path, []).revision);
          if (cache.get('revision:' + rootKey) !== source.revision) return false;
        }
        const key = [rootKey, source.type, source.path].join(':');
        if (!cache.has(key))
          cache.set(
            key,
            source.type === 'executable'
              ? this.workspace.fingerprint(root)
              : source.ref.kind === 'source'
                ? this.index.read(source.ref, source.path).hash
                : readText(root.path, source.path).hash,
          );
        return cache.get(key) === source.hash;
      });
    } catch {
      return false;
    }
  }
  records(targetId?: string) {
    const cache = new Map<string, string | null>();
    return this.repository
      .list('knowledge')
      .filter((k) => !targetId || k.targetId === targetId)
      .filter((k) => {
        const current = k.versions.find((v) => v.hash === k.currentHash)!;
        const expired =
          current.classification === 'TEMPORARY' &&
          !k.documentHash &&
          Date.now() - Date.parse(current.lastSeenAt || current.createdAt) >
            this.repository.store.settings().retentionDays * 86400000;
        if (expired)
          this.repository.store.db
            .prepare("DELETE FROM evolution_objects WHERE kind='knowledge' AND id=?")
            .run(k.id);
        return !expired;
      })
      .map((k) => {
        const current = k.versions.find((v) => v.hash === k.currentHash)!;
        if (!this.fresh(current, cache) && k.status !== 'REJECTED' && k.status !== 'STALE') {
          k.status = 'STALE';
          this.repository.put('knowledge', k);
        }
        return k;
      });
  }
  private capture(input: {
    targetId: string;
    key: string;
    claim: string;
    sources: EvidenceRef[];
    workflow: string;
    classification: KnowledgeClass;
    confidence: KnowledgeVersion['confidence'];
    provenance?: KnowledgeVersion['provenance'];
  }) {
    const claim = safeText(redact(input.claim)).slice(0, 1000);
    const data = {
      claim,
      sources: input.sources,
      classification: input.classification,
      confidence: input.confidence,
      provenance: input.provenance || ('OBSERVED' as const),
    };
    const digest = hash(JSON.stringify(data));
    const prior = this.repository.byKnowledgeKey(input.targetId, input.key);
    if (prior?.currentHash === digest) {
      const v = prior.versions.find((v) => v.hash === digest)!;
      if (!v.workflows.includes(input.workflow) && v.workflows.length < 50) {
        v.workflows.push(input.workflow);
        v.lastSeenAt = new Date().toISOString();
        this.repository.put('knowledge', prior);
      }
      return 'unchanged';
    }
    const version: KnowledgeVersion = {
      ...data,
      hash: digest,
      workflows: [input.workflow],
      createdAt: new Date().toISOString(),
    };
    const k: Knowledge = prior || {
      id: randomUUID(),
      key: input.key,
      targetId: input.targetId,
      currentHash: digest,
      status: 'CANDIDATE',
      versions: [],
      reviews: [],
    };
    if (!k.versions.some((v) => v.hash === digest)) k.versions.push(version);
    k.currentHash = digest;
    k.status = 'CANDIDATE';
    this.repository.put('knowledge', k);
    return prior ? 'changed' : 'created';
  }
  async collect(targetId: string, signal?: AbortSignal) {
    const target = this.workspace.target(targetId),
      ref: RootRef = { kind: 'target', id: targetId };
    const snapshot = await this.index.scan(ref, signal);
    const initial = targetRevision(target.path);
    const result = {
      created: 0,
      changed: 0,
      unchanged: 0,
      indexedFiles: snapshot.files.length,
      limitations: [
        'Static capability facts are not proof of executed interactions.',
        'Only current-contract/current-executable completed target runs establish native outcome knowledge.',
      ],
    };
    const runs = this.repository.store
      .list('runs')
      .filter(
        (r) => r.targetId === targetId && !r.proposalId && ['PASSED', 'FAILED'].includes(r.status),
      )
      .slice(-200)
      .reverse();
    const fingerprint = this.workspace.fingerprint(target);
    for (const f of snapshot.files) {
      if (signal?.aborted) throw new AppError(409, 'Knowledge collection cancelled');
      for (const c of f.capabilities
        .filter((c) =>
          ['page', 'component', 'fixture', 'builder', 'karate-helper'].includes(c.kind),
        )
        .slice(0, 6)) {
        const outcome = this.capture({
          targetId,
          key: `capability:${f.path}:${c.kind}:${c.name}`,
          claim: `${c.kind} ${c.name} exists in ${f.path}; static syntax fact, not a business rule or execution claim.`,
          sources: [{ ref, path: f.path, hash: f.hash, type: 'file', revision: snapshot.revision }],
          workflow: 'index:' + snapshot.treeHash,
          classification: 'REPOSITORY',
          confidence: 'SYNTAX',
        });
        result[outcome]++;
      }
    }
    const features = this.workspace.features(target);
    const seen = new Set<string>();
    for (const run of runs)
      for (const test of run.tests) {
        if (
          !test.scenarioId ||
          test.status !== 'PASSED' ||
          run.executableHash !== fingerprint ||
          run.status !== 'PASSED'
        )
          continue;
        const feature = features.find(
          (f) =>
            f.path === test.featurePath &&
            run.snapshot.some((s) => s.path === f.path && s.hash === f.hash),
        );
        const key = `native:${run.framework}:${test.scenarioId}`;
        if (!feature || seen.has(key)) continue;
        seen.add(key);
        const sources: EvidenceRef[] = [
          {
            ref,
            path: feature.path,
            hash: feature.hash,
            type: 'file',
            revision: snapshot.revision,
          },
          {
            ref,
            path: '@executable',
            hash: fingerprint,
            type: 'executable',
            revision: snapshot.revision,
          },
        ];
        const outcome = this.capture({
          targetId,
          key,
          claim: `Scenario ${test.scenarioId} has passing ${run.framework === 'playwright' ? 'visible UI' : 'API state'} native evidence for the current contract/executable. Coverage is limited to its actual assertions and selected dataset; UI/API equivalence is not inferred.`,
          sources,
          workflow: 'run:' + run.id,
          classification: 'REPOSITORY',
          confidence: 'NATIVE',
        });
        result[outcome]++;
      }
    for (const repair of (this.repairs?.() || []).filter(
      (r) => r.targetId === targetId && r.status === 'APPLIED' && r.rollback?.status !== 'APPLIED',
    )) {
      if (signal?.aborted) throw new AppError(409, 'Knowledge collection cancelled');
      const validation = repair.validationRunId
        ? this.repository.store.get('runs', repair.validationRunId)
        : undefined;
      if (
        !validation ||
        validation.status !== 'PASSED' ||
        repair.validationFingerprint !== fingerprint ||
        repair.approval?.hash !== repair.hash
      )
        continue;
      const feature = features.find(
        (f) => f.path === repair.featurePath && f.hash === repair.contractHash,
      );
      if (!feature) continue;
      for (const file of repair.files) {
        if (readText(target.path, file.path).hash !== hash(file.after)) continue;
        const sources: EvidenceRef[] = [
          {
            ref,
            path: file.path,
            hash: hash(file.after),
            type: 'file',
            revision: snapshot.revision,
          },
          {
            ref,
            path: feature.path,
            hash: feature.hash,
            type: 'file',
            revision: snapshot.revision,
          },
          {
            ref,
            path: '@executable',
            hash: fingerprint,
            type: 'executable',
            revision: snapshot.revision,
          },
        ];
        const outcome = this.capture({
          targetId,
          key: 'validated-repair:' + file.path + ':' + feature.path,
          claim: `A reviewed locator-only repair in ${file.path} preserved business assertions and passed all selected examples of ${feature.path} in native staged run evidence. Reuse this implementation under the recorded source/executable hashes; other consumers and changed environments remain unproven.`,
          sources,
          workflow: 'repair:' + repair.id,
          classification: 'REPOSITORY',
          confidence: 'NATIVE',
        });
        result[outcome]++;
      }
    }
    for (const run of runs
      .filter((r) => r.status === 'FAILED' && r.executableHash === fingerprint)
      .slice(0, 3)) {
      const feature = features.find((f) =>
        run.snapshot.some((s) => s.path === f.path && s.hash === f.hash),
      );
      if (!feature) continue;
      const outcome = this.capture({
        targetId,
        key: 'temporary-failure:' + run.framework + ':' + feature.path,
        claim: `Recent ${run.framework} failure evidence exists for ${feature.path}. Root cause and business intent are unconfirmed; inspect the linked native execution before proposing any repair.`,
        sources: [
          {
            ref,
            path: feature.path,
            hash: feature.hash,
            type: 'file',
            revision: snapshot.revision,
          },
          {
            ref,
            path: '@executable',
            hash: fingerprint,
            type: 'executable',
            revision: snapshot.revision,
          },
        ],
        workflow: 'run:' + run.id,
        classification: 'TEMPORARY',
        confidence: 'NATIVE',
      });
      result[outcome]++;
    }
    const seenSources = new Set<string>();
    for (const task of (this.tasks?.() || []).filter(
      (t) => t.targetId === targetId && t.status === 'SUCCEEDED',
    )) {
      for (const file of task.contextFiles.filter((f) => f.ref.kind === 'source' && f.bytes > 0)) {
        if (signal?.aborted) throw new AppError(409, 'Knowledge collection cancelled');
        const key = `source:${file.ref.id}:${file.path}`;
        if (seenSources.has(key) || seenSources.size >= 24) continue;
        try {
          const sourceIndex = this.index.get(file.ref),
            current = this.index.read(file.ref, file.path);
          if (current.hash !== file.hash || !sourceIndex) continue;
          const sources: EvidenceRef[] = [
            {
              ref: file.ref,
              path: file.path,
              hash: file.hash,
              type: 'file',
              revision: sourceIndex.revision,
            },
          ];
          if (
            !this.fresh({
              hash: '',
              claim: '',
              classification: 'REPOSITORY',
              confidence: 'SYNTAX',
              provenance: 'OBSERVED',
              sources,
              workflows: [],
              createdAt: '',
            })
          )
            continue;
          const outcome = this.capture({
            targetId,
            key,
            claim: `Source ${file.ref.id} / ${file.path} supplied scoped context to a completed task. Its current syntax exposes ${
              current.capabilities
                .slice(0, 3)
                .map((c) => c.kind + ' ' + c.name)
                .join(', ') || 'no supported static capability'
            }. This is provenance, not an inferred business rule.`,
            sources,
            workflow: 'task:' + task.id,
            classification: 'REPOSITORY',
            confidence: 'SYNTAX',
          });
          result[outcome]++;
          seenSources.add(key);
        } catch {
          /* Disabled, stale, excluded or unsupported sources are not promoted or broadly retrieved. */
        }
      }
    }
    if (targetRevision(target.path) !== initial)
      throw new AppError(409, 'Target changed during collection; recheck knowledge freshness');
    this.records(targetId);
    return result;
  }
  proposeObservation(input: {
    sourceRecordId: string;
    expectedHash: string;
    classification: KnowledgeClass;
    claim: string;
    provenance: KnowledgeVersion['provenance'];
  }) {
    const source = this.repository.get('knowledge', input.sourceRecordId),
      current = source.versions.find((v) => v.hash === source.currentHash)!;
    if (
      current.hash !== input.expectedHash ||
      !this.fresh(current) ||
      !input.claim.trim() ||
      input.claim.length > 1000 ||
      !['TEMPORARY', 'REPOSITORY', 'PROCEDURE', 'DECISION', 'SKILL_IMPROVEMENT'].includes(
        input.classification,
      )
    )
      throw new AppError(409, 'Choose current sourced evidence and a concise classified claim');
    this.capture({
      targetId: source.targetId,
      key: `curated:${source.id}:${input.classification}`,
      claim: input.claim,
      sources: current.sources,
      workflow: 'review-source:' + source.id,
      classification: input.classification,
      confidence: 'HUMAN',
      provenance: input.provenance,
    });
    return this.repository.byKnowledgeKey(
      source.targetId,
      `curated:${source.id}:${input.classification}`,
    )!;
  }
  review(id: string, expectedHash: string, approve: boolean) {
    const k = this.repository.get('knowledge', id),
      v = k.versions.find((v) => v.hash === k.currentHash)!;
    if (v.hash !== expectedHash || !this.fresh(v))
      throw new AppError(409, 'Review current source-backed knowledge');
    if (approve && (v.classification === 'TEMPORARY' || v.provenance === 'INFERRED'))
      throw new AppError(
        403,
        'Temporary/inferred observations cannot silently become active knowledge',
      );
    k.status = approve ? 'ACTIVE' : 'REJECTED';
    k.reviews.push({ hash: v.hash, at: new Date().toISOString(), approve, reviewer: 'local-user' });
    if (approve) {
      const text = `# Repository knowledge\n\n${v.claim}\n\nConfidence: ${v.confidence}; provenance: ${v.provenance}.\n\nSources:\n${v.sources.map((s) => `- ${s.ref.kind}:${s.ref.id} / ${s.path} @ ${s.hash}`).join('\n')}\n\nWorkflow evidence: ${v.workflows.join(', ')}.\n\nAdvisory data only; this record grants no execution, mutation or instruction authority.\n`;
      const docHash = hash(text),
        existing = this.repository
          .list('document')
          .find((d) => d.hash === docHash && d.recordId === k.id);
      if (!existing)
        this.repository.immutable('document', {
          id: randomUUID(),
          recordId: k.id,
          versionHash: v.hash,
          hash: docHash,
          text,
          createdAt: new Date().toISOString(),
        });
      k.documentHash = docHash;
    }
    return this.repository.put('knowledge', k);
  }
  document(id: string) {
    const k = this.repository.get('knowledge', id);
    const doc = this.repository
      .list('document')
      .find((d) => d.recordId === id && d.hash === k.documentHash);
    return {
      record: k,
      document: doc || null,
      history: this.repository.list('document').filter((d) => d.recordId === id),
      fresh: doc ? this.fresh(k.versions.find((v) => v.hash === doc.versionHash)!) : false,
    };
  }
  restoreDocument(id: string, input: { currentHash: string; restoreHash: string }) {
    const k = this.repository.get('knowledge', id);
    if (k.documentHash !== input.currentHash)
      throw new AppError(409, 'Document changed since review');
    const document = this.repository
      .list('document')
      .find((d) => d.recordId === id && d.hash === input.restoreHash);
    if (!document || hash(document.text) !== document.hash)
      throw new AppError(409, 'Reviewed document version unavailable');
    k.documentHash = document.hash;
    return this.repository.put('knowledge', k);
  }
  lookup(ref: RootRef, path: string) {
    const rows = this.repository.store.db
      .prepare(
        `SELECT data FROM evolution_objects k WHERE kind='knowledge' AND json_extract(k.data,'$.status')='ACTIVE'
      AND EXISTS (SELECT 1 FROM json_each(k.data,'$.versions') v, json_each(v.value,'$.sources') s
      WHERE json_extract(v.value,'$.hash')=json_extract(k.data,'$.currentHash') AND json_extract(s.value,'$.ref.kind')=? AND json_extract(s.value,'$.ref.id')=? AND json_extract(s.value,'$.path')=?) LIMIT 3`,
      )
      .all(ref.kind, ref.id, path) as { data: string }[];
    const cache = new Map<string, string | null>();
    return rows.flatMap((row) => {
      const k = JSON.parse(row.data) as Knowledge,
        v = k.versions.find((v) => v.hash === k.currentHash)!;
      if (!this.fresh(v, cache)) {
        k.status = 'STALE';
        this.repository.put('knowledge', k);
        return [];
      }
      return [
        { id: k.id, hash: v.hash, claim: v.claim, confidence: v.confidence, advisoryOnly: true },
      ];
    });
  }
}
