import type { Framework, Run, Target } from '../domain/model.ts';
import { readText } from './files.ts';
import type { Workspace } from './workspace.ts';

// Bindings are declarations. Native outcomes remain separate evidence, never equivalence claims.
export function coverage(workspace: Workspace, target: Target, runs: Run[]) {
  const manifest = JSON.parse(readText(target.path, 'contracts/manifest.json').text);
  const fingerprint = workspace.fingerprint(target);
  return workspace.features(target).flatMap((feature) =>
    feature.scenarios.map((scenario) => {
      const mapped = manifest.features?.find((f: { path: string }) => f.path === feature.path);
      const declared = mapped?.scenarios?.find((s: { id: string }) => s.id === scenario.id);
      return {
        featurePath: feature.path,
        contractHash: feature.hash,
        scenarioId: scenario.id,
        name: scenario.name,
        frameworks: (['playwright', 'karate'] as Framework[]).map((framework) => {
          const binding = declared?.bindings?.[framework];
          let state = binding ? 'CURRENT' : 'MISSING';
          if (binding) {
            try {
              readText(target.path, binding.path);
            } catch {
              state = 'MISSING_FILE';
            }
            if (framework === 'karate' && mapped.canonicalHash !== feature.hash)
              state = 'STALE_CONTRACT';
          }
          const evidence = runs
            .filter(
              (r) =>
                r.targetId === target.id &&
                !r.proposalId &&
                r.framework === framework &&
                r.snapshot.some((f) => f.path === feature.path && f.hash === feature.hash) &&
                r.tests.some((t) => t.scenarioId === scenario.id),
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          const tests = evidence?.tests.filter((t) => t.scenarioId === scenario.id) || [];
          return {
            framework,
            bindingState: state,
            path: binding?.path || null,
            coverage: binding?.coverage || null,
            endpoint: binding?.endpoint || null,
            evidence: evidence
              ? {
                  runId: evidence.id,
                  baseUrl: evidence.baseUrl,
                  runStatus: evidence.status,
                  executableCurrent: evidence.executableHash === fingerprint,
                  tests: tests.map((t) => ({
                    name: t.name,
                    status: t.status,
                    durationMs: t.durationMs,
                  })),
                }
              : null,
          };
        }),
      };
    }),
  );
}
