import { AppError } from '../domain/model.ts';
import type { RepositoryIndex } from '../intelligence/index.ts';

export function hybridPlan(index: RepositoryIndex) {
  const find = (name: string) =>
    index.files.flatMap((file) =>
      file.capabilities
        .filter((c) => c.name === name)
        .map((c) => ({ path: file.path, symbol: c.name, hash: file.hash })),
    )[0];
  const prepare = find('prepareGuestContext');
  const visit = find('PromotionsPage.visit');
  const assertions = find('PromotionsPage.expectPromotion');
  if (!prepare || !visit || !assertions)
    throw new AppError(
      422,
      'A hybrid plan needs inspected API preparation, Page navigation and visible assertion capabilities.',
    );
  return {
    status: 'REVIEW_REQUIRED' as const,
    repositoryRevision: index.revision,
    treeHash: index.treeHash,
    steps: [
      {
        kind: 'API_PRECONDITION',
        capability: prepare,
        effect:
          'Create one isolated synthetic guest context; requires concrete environment authorization. Do not cache mutable context.',
      },
      {
        kind: 'UI_EXECUTION',
        capability: visit,
        effect:
          'Visit the promotion UI by passing the returned customer context, including contextId, to the existing Page.',
      },
      {
        kind: 'UI_ASSERTION',
        capability: assertions,
        effect:
          'Assert the visible title, amount and subtitle. An API response cannot satisfy this step.',
      },
    ],
    warning:
      'This is a capability-backed implementation plan, not an executed test or an authorization to mutate any environment. Verify helper semantics and data flow during code review.',
  };
}
