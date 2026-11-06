import type { EvolutionRepository } from './repository.ts';
import type { GenerationRepository } from '../generation/repository.ts';
import type { MaintenanceManager } from '../maintenance/manager.ts';
import type { Diagnosis, Repair } from '../maintenance/model.ts';
export function workflowMetrics(
  repository: EvolutionRepository,
  generation: GenerationRepository,
  maintenance: MaintenanceManager,
) {
  const tasks = generation.list('tasks'),
    changes = generation.list('changes');
  const implementations = tasks.filter((t) => t.kind === 'implementation');
  const diagnoses = maintenance.list<Diagnosis>('diagnosis');
  const eligible = diagnoses.filter(
    (d) => d.review && d.conclusion === 'LOCATOR_DEFECT' && d.executableCurrent,
  );
  const repairs = maintenance.list<Repair>('repair').map((r) => maintenance.repair(r.id));
  const successIds = new Set(
    repairs
      .filter(
        (r) =>
          r.status === 'APPLIED' &&
          r.approval?.hash === r.hash &&
          r.validationRunId &&
          repository.store.get('runs', r.validationRunId)?.status === 'PASSED',
      )
      .map((r) => r.diagnosisId),
  );
  const rate = (numerator: number, denominator: number) => ({
    numerator,
    denominator,
    rate: denominator ? numerator / denominator : null,
  });
  const completed = implementations.filter((t) => t.status === 'SUCCEEDED');
  const successful = implementations.filter((t) =>
    changes.some(
      (c) =>
        c.taskId === t.id &&
        c.status === 'APPLIED' &&
        c.approval?.hash === c.hash &&
        c.validationRunId &&
        repository.store.get('runs', c.validationRunId)?.status === 'PASSED',
    ),
  );
  const taskMetrics = tasks.map((t) => {
    const raw =
      t.usage && typeof t.usage === 'object' ? (t.usage as Record<string, unknown>) : null;
    const total =
      raw && typeof raw.total === 'object' ? (raw.total as Record<string, unknown>) : raw;
    const field = (...names: string[]) => {
      for (const name of names)
        if (
          total &&
          typeof total[name] === 'number' &&
          Number.isFinite(total[name]) &&
          total[name] >= 0
        )
          return total[name] as number;
      return null;
    };
    const searches = t.searches || [];
    return {
      id: t.id,
      kind: t.kind,
      status: t.status,
      model: t.model,
      executionClass: t.executionClass || 'UNKNOWN_LEGACY',
      retrievalBytes: t.retrievalBytes,
      promptBytes: t.promptBytes,
      files: t.contextFiles.filter((f) => f.bytes > 0).length,
      toolCalls: t.toolCalls,
      repeatedQueries:
        searches.length - new Set(searches.map((q) => q.queryHash + ':' + q.scopeHash)).size,
      searchInstrumentation: t.searches ? 'RECORDED' : 'UNAVAILABLE_LEGACY',
      providerTokens: {
        input: field('inputTokens', 'input_tokens'),
        output: field('outputTokens', 'output_tokens'),
        cachedInput: field('cachedInputTokens', 'cached_input_tokens'),
        reasoningOutput: field('reasoningOutputTokens'),
        total: field('totalTokens'),
      },
      rawUsageAvailable: t.usage != null,
      proxy: {
        method: 'UTF-8 bytes; not tokens or billing',
        contextBytes: t.promptBytes + t.retrievalBytes,
      },
    };
  });
  const active = repository.list('active');
  const skillInvocations = repository.store.db
    .prepare("SELECT COUNT(*) n FROM evolution_activity WHERE kind='skillInvocation'")
    .get() as { n: number };
  return {
    window:
      'Most recent 200 generation tasks and 100 maintenance records; not an all-time or wall-clock window.',
    definitions: {
      generation:
        'Validated and explicitly applied implementation tasks / recorded implementation tasks. Failed, cancelled, interrupted and running attempts stay in the denominator. Preflight rejections before task creation are unavailable, not counted as eligible tasks.',
      reuse:
        'Completed plans explicitly referencing at least one existing capability / completed implementation tasks; this is a plan-level reuse proxy, not opportunity-level coverage.',
      maintenance:
        'Reviewed current-executable locator-defect diagnoses with at least one validated/applied repair / reviewed current-executable locator-defect diagnoses. Reversal is reported separately.',
      providerTokens:
        'Expose recorded fields from the task total once. Cached input and reasoning output can be subsets; they are not added again to input/output/total. Absent fields remain null.',
      queries:
        'Repeated normalized exact query hash with identical indexed root tree hashes within a task; semantic similarity is not inferred.',
      invocation:
        'Execution-trusted fixed-bundle CLI invocations, including evaluations and explicit active-summary workflows, scoped to bundle hash. External Codex invocations are unavailable.',
    },
    generation: rate(successful.length, implementations.length),
    reusePlanProxy: rate(
      completed.filter((t) => changes.some((c) => c.taskId === t.id && c.plan.reuse.length)).length,
      completed.length,
    ),
    maintenance: rate(eligible.filter((d) => successIds.has(d.id)).length, eligible.length),
    states: Object.fromEntries(
      ['RUNNING', 'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED', 'INTERRUPTED'].map(
        (status) => [status, tasks.filter((t) => t.status === status).length],
      ),
    ),
    reversedRepairs: repairs.filter((r) => r.rollback?.status === 'APPLIED').length,
    productFindings: diagnoses.filter((d) => d.review && d.conclusion === 'PRODUCT_REGRESSION')
      .length,
    tasks: taskMetrics,
    activeSkills: active.map((s) => ({ targetId: s.targetId, name: s.name, bundleHash: s.hash })),
    repositoryAnalysis: (
      repository.store.db
        .prepare(
          "SELECT json_extract(data,'$.ref') ref,json_extract(data,'$.revision') revision,json_extract(data,'$.treeHash') treeHash,json_extract(data,'$.indexedAt') indexedAt,json_extract(data,'$.parsed') parsed,json_extract(data,'$.reused') reused,json_extract(data,'$.skipped') skipped,json_extract(data,'$.truncated') truncated FROM repository_indexes LIMIT 100",
        )
        .all() as {
        ref: string;
        revision: string | null;
        treeHash: string;
        indexedAt: string;
        parsed: number;
        reused: number;
        skipped: number;
        truncated: number;
      }[]
    ).map((r) => ({
      ...r,
      ref: JSON.parse(r.ref),
      cacheHitRatio: r.parsed + r.reused ? r.reused / (r.parsed + r.reused) : null,
      meaning:
        'Last stored bounded scan; cache-hit ratio is not token savings or a source-freshness guarantee.',
    })),
    skillInvocations: skillInvocations.n,
    skillVersions: (
      repository.store.db
        .prepare(
          "SELECT json_extract(data,'$.bundleHash') bundleHash, COUNT(*) invocations, SUM(CASE WHEN json_extract(data,'$.status')='CANCELLED' THEN 1 ELSE 0 END) cancelled, SUM(CASE WHEN json_extract(data,'$.status')='FAILED' THEN 1 ELSE 0 END) failed, SUM(CASE WHEN json_extract(data,'$.caseId') LIKE 'workflow:%' THEN 1 ELSE 0 END) workflowInvocations FROM evolution_activity WHERE kind='skillInvocation' GROUP BY json_extract(data,'$.bundleHash')",
        )
        .all() as { bundleHash: string; invocations: number; workflowInvocations: number }[]
    ).map((m) => ({
      ...m,
      name: repository.list('bundle').find((b) => b.hash === m.bundleHash)?.name || null,
      version: repository.list('bundle').find((b) => b.hash === m.bundleHash)?.version || null,
    })),
    claim:
      'No model-token savings, provider cost or general agent-quality improvement established. Deterministic script comparison is reported separately.',
  };
}
