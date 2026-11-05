import { createHash } from 'node:crypto';
import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator, type FeatureChild } from '@cucumber/messages';
import { AppError, type Feature, type Scenario } from './model.ts';

export const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');

export function parseFeature(text: string, path: string): Feature {
  if (Buffer.byteLength(text) > 1_000_000) throw new AppError(413, 'Feature exceeds 1 MB');
  try {
    const document = new Parser(
      new AstBuilder(IdGenerator.incrementing()),
      new GherkinClassicTokenMatcher(),
    ).parse(text);
    if (!document.feature) throw new AppError(422, 'A Feature is required');
    const scenarios: Scenario[] = [];
    const inherited = document.feature.tags.map((t) => t.name);
    const visit = (children: readonly FeatureChild[], inheritedTags: string[]) => {
      for (const child of children) {
        if (child.rule)
          visit(child.rule.children, [...inheritedTags, ...child.rule.tags.map((t) => t.name)]);
        if (!child.scenario) continue;
        const scenario = child.scenario;
        const tags = [...inheritedTags, ...scenario.tags.map((t) => t.name)];
        const identity = tags.find((t) => t.startsWith('@scenario:'))?.slice(10);
        scenarios.push({
          id: identity || `unmapped:${hash(path + ':' + scenario.name).slice(0, 16)}`,
          name: scenario.name,
          line: scenario.location.line,
          tags,
          examples: scenario.examples.flatMap((block) =>
            block.tableBody.map((row) => ({
              row: row.location.line,
              values: Object.fromEntries(
                (block.tableHeader?.cells || []).map((cell, i) => [
                  cell.value,
                  row.cells[i]?.value || '',
                ]),
              ),
            })),
          ),
        });
      }
    };
    visit(document.feature.children, inherited);
    if (!scenarios.length) throw new AppError(422, 'At least one scenario is required');
    const ids = scenarios.map((s) => s.id);
    if (new Set(ids).size !== ids.length) throw new AppError(422, 'Duplicate scenario identities');
    return { path, name: document.feature.name, text, hash: hash(text), scenarios };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(422, error instanceof Error ? error.message : 'Invalid Gherkin');
  }
}
