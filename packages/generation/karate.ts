import { AppError } from '../domain/model.ts';
import { hash, parseFeature } from '../domain/gherkin.ts';
import type { ApiOperation } from '../intelligence/api.ts';

export const apiFeaturePath = (featurePath: string) =>
  'api/src/test/resources/features/generated/' + featurePath.slice('contracts/features/'.length);
export function boundApiFeaturePath(manifestText: string, featurePath: string) {
  const manifest = JSON.parse(manifestText);
  const entry = manifest.features?.find((f: { path: string }) => f.path === featurePath);
  const bindings = [
    ...new Set<string>(
      (entry?.scenarios || [])
        .map((s: { bindings?: { karate?: { path: string } } }) => s.bindings?.karate?.path)
        .filter(Boolean),
    ),
  ];
  if (bindings.length > 1)
    throw new AppError(
      422,
      'Multiple API feature bindings require a separately reviewed per-scenario plan',
    );
  return bindings[0] || apiFeaturePath(featurePath);
}
export const apiCoverage =
  'HTTP status, response contract and explicit business-state assertions; UI rendering is not validated';
export function requireSupportedOperation(operation: ApiOperation) {
  const questions = [...operation.questions];
  if (operation.authentication !== 'none')
    questions.push(
      'Confirm authentication through an explicitly supported reviewed helper before API generation.',
    );
  if (operation.method !== 'GET')
    questions.push(
      'Automatic generation currently supports read-only GET operations; write operations need a separately reviewed implementation.',
    );
  if (!operation.responses['200'])
    questions.push('Confirm an explicit successful 200 response contract.');
  if (questions.length)
    throw new AppError(422, 'API generation needs answers: ' + [...new Set(questions)].join(' '));
}
export function validateKarate(
  text: string,
  canonical: string,
  path: string,
  operation: ApiOperation,
) {
  requireSupportedOperation(operation);
  const feature = parseFeature(text, path),
    original = parseFeature(canonical, 'canonical.feature');
  if (
    feature.scenarios.length !== original.scenarios.length ||
    feature.scenarios.some((s) => {
      const source = original.scenarios.find((o) => o.id === s.id);
      return !source || s.examples.length !== source.examples.length;
    })
  )
    throw new AppError(
      422,
      'Karate must preserve every canonical scenario identity and example count',
    );
  for (const scenario of feature.scenarios) {
    const source = original.scenarios.find((s) => s.id === scenario.id)!;
    for (const [index, row] of source.examples.entries()) {
      const translated = scenario.examples[index];
      for (const [key, value] of Object.entries(row.values)) {
        if (
          key in translated.values
            ? translated.values[key] !== value
            : !Object.values(translated.values).includes(value) &&
              !text.includes("'" + value + "'") &&
              !text.includes('"' + value + '"')
        )
          throw new AppError(422, 'API translation changed a canonical example value: ' + key);
      }
    }
  }
  // Conservative static guards supplement review; Karate remains executable trusted code.
  if (
    /\b(Java|java|eval|exec|configure|karate\s*\.|callonce|callSingle|function)\b|=>|__proto__|constructor|prototype|\b(read|call)\s*\([^)]*https?:|https?:\/\/|file:|\.\./i.test(
      text,
    )
  )
    throw new AppError(
      422,
      'Karate proposal requires manual review of executable code or external access',
    );
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const steps = lines
    .filter((l) => /^(Given|When|Then|And|But|\*)\s/.test(l))
    .map((l) => l.replace(/^(Given|When|Then|And|But|\*)\s+/, ''));
  if (
    steps.some(
      (s) =>
        !/^(url baseUrl$|path |param(?:s)? |method get$|status 200$|match |def \w+ = call read\(['"]classpath:[A-Za-z0-9_/-]+\.feature['"]\))/.test(
          s,
        ),
    )
  )
    throw new AppError(
      422,
      'Unsupported Karate statement: use native read-only HTTP assertions and reviewed feature composition',
    );
  if (
    !steps.includes('url baseUrl') ||
    !steps.includes('method get') ||
    !steps.includes('status 200') ||
    !steps.some((s) => s.startsWith('match response'))
  )
    throw new AppError(
      422,
      'Karate needs the configured environment, GET, explicit status and response assertions',
    );
  const parameterNames = new Set(
    operation.parameters.map((p) => String((p as { name?: unknown }).name)),
  );
  const assertions = steps.filter((s) => s.startsWith('match response')).join('\n');
  if (/#ignore|#\?|\bmatch response\s*==\s*['"]#(?:object|present|notnull)['"]/.test(assertions))
    throw new AppError(
      422,
      'API business expectations cannot be replaced by permissive assertions',
    );
  for (const scenario of original.scenarios) {
    const translated = feature.scenarios.find((s) => s.id === scenario.id)!;
    for (const key of Object.keys(scenario.examples[0]?.values || {})) {
      if (parameterNames.has(key)) continue;
      const values = scenario.examples.map((row) => row.values[key]);
      const column = Object.keys(translated.examples[0]?.values || {}).find((name) =>
        translated.examples.every((row, i) => row.values[name] === values[i]),
      );
      const constant = values.every((v) => v === values[0]);
      if (
        !(column && assertions.includes('<' + column + '>')) &&
        !(
          constant &&
          (assertions.includes("'" + values[0] + "'") || assertions.includes('"' + values[0] + '"'))
        )
      )
        throw new AppError(
          422,
          'API assertions must reference the reviewed expected example values: ' + key,
        );
    }
  }
  const paths = steps.filter((s) => s.startsWith('path '));
  if (
    paths.length !== 1 ||
    ![`path '${operation.path}'`, `path "${operation.path}"`].includes(paths[0])
  )
    throw new AppError(422, 'Karate path differs from the reviewed discovered endpoint');
  return feature;
}
export function bindKarate(
  manifestText: string,
  canonical: string,
  featurePath: string,
  path: string,
  endpoint: unknown,
) {
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new AppError(422, 'Invalid automation manifest');
  }
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.features))
    throw new AppError(422, 'Unsupported automation manifest');
  const feature = parseFeature(canonical, featurePath);
  const existing = manifest.features.find((f: { path: string }) => f.path === featurePath);
  const entry = {
    ...(existing || { id: 'feature-' + hash(featurePath).slice(0, 16) }),
    path: featurePath,
    canonicalHash: feature.hash,
    scenarios: feature.scenarios.map((s) => {
      const prior = existing?.scenarios?.find((p: { id: string }) => p.id === s.id);
      return {
        ...prior,
        id: s.id,
        tag: '@scenario:' + s.id,
        title: s.name,
        bindings: { ...prior?.bindings, karate: { path, coverage: apiCoverage, endpoint } },
      };
    }),
  };
  manifest.features = [
    ...manifest.features.filter((f: { path: string }) => f.path !== featurePath),
    entry,
  ];
  return JSON.stringify(manifest, null, 2) + '\n';
}
