import { randomUUID } from 'node:crypto';
import type { Run } from '../../packages/domain/model.ts';
import type { FailureReply } from '../../packages/generation/model.ts';
import type { generationFixture } from './generation.ts';
export const adviceReply: FailureReply = {
  summary:
    'El localizador no encuentra elementos; la causa todavía requiere evidencia de la página.',
  options: [
    {
      title: 'Revisar rol y nombre accesible',
      evidence: 'El resultado sintético contiene cero coincidencias para el botón Promoción.',
      steps: [
        'Inspeccionar la captura y el estado previo.',
        'Confirmar el rol y la unicidad antes de proponer un cambio.',
      ],
      risk: 'Cambiar el rol sin observar la página puede ocultar un problema de navegación.',
    },
  ],
  missingEvidence: ['Árbol accesible en el momento del fallo'],
};
export function adviceRun(p: ReturnType<typeof generationFixture>): Run {
  const run: Run = {
    id: randomUUID(),
    targetId: p.target.id,
    framework: 'playwright',
    status: 'FAILED',
    selection: { kind: 'suite' },
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    baseUrl: 'http://127.0.0.1:4311',
    idempotencyKey: randomUUID(),
    snapshot: [],
    artifacts: [],
    error: 'Synthetic conversation fixture; NOT native execution evidence',
    tests: [
      {
        nativeId: 'synthetic-locator',
        name: 'Synthetic failure for advice UI',
        status: 'FAILED',
        durationMs: 1,
        scenarioId: null,
        featurePath: null,
        row: null,
        steps: [],
        error: "getByRole('button', { name: 'Promoción' }).toHaveCount(1): received 0",
      },
    ],
  };
  p.store.put('runs', run);
  return run;
}
