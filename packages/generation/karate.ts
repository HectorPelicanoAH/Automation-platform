import ts from 'typescript';
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

// Allow a concrete inline-schema extraction only when the existing helper is a single,
// immutable flat literal and the same matcher is used in the same scenario scope.
// This is deliberately narrower than general Karate/JavaScript equivalence.
export function equivalentSchemaAssertions(
  before: string | null,
  after: string,
  helpers: ReadonlyMap<string, string>,
) {
  const equivalent = new Set<string>();
  if (!before || parseFeature(before, 'before.feature').scenarios.length !== 1) return equivalent;
  const parsed = parseFeature(after, 'after.feature');
  if (parsed.scenarios.length !== 1) return equivalent;
  const flatSchema = (expression: string): string | null => {
    const source = ts.createSourceFile(
      'schema.ts',
      'const schema = ' + expression,
      ts.ScriptTarget.Latest,
      true,
    );
    if (
      (source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics
        ?.length
    )
      return null;
    const statement = source.statements[0];
    if (!statement || source.statements.length !== 1 || !ts.isVariableStatement(statement))
      return null;
    if (statement.declarationList.declarations.length !== 1) return null;
    const value = statement.declarationList.declarations[0]?.initializer;
    if (!value || !ts.isObjectLiteralExpression(value)) return null;
    const fields: [string, string][] = [];
    for (const property of value.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ||
        !ts.isStringLiteral(property.initializer)
      )
        return null;
      const name = property.name.text,
        value = property.initializer.text;
      if (
        ['__proto__', 'constructor', 'prototype'].includes(name) ||
        fields.some(([key]) => key === name)
      )
        return null;
      if (
        value.startsWith('#') &&
        !/^#(string|number|boolean|object|array|null|notnull)$/.test(value)
      )
        return null;
      fields.push([name, value]);
    }
    return fields.length ? JSON.stringify(fields.sort(([a], [b]) => a.localeCompare(b))) : null;
  };
  const nativeSteps = after
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => /^(Given|When|Then|And|But|\*)\s/.test(s))
    .map((s) => s.replace(/^(Given|When|Then|And|But|\*)\s+/, ''));
  const calls = [
    ...after.matchAll(
      /^\s*\* def ([A-Za-z_]\w*) = call read\(['"]classpath:([A-Za-z0-9_/-]+\.feature)['"]\)\s*$/gm,
    ),
  ];
  for (const call of calls) {
    if (after.slice(0, call.index).split('\n').length >= parsed.scenarios[0].line) continue;
    const helper = helpers.get('api/src/test/resources/' + call[2]);
    if (!helper) continue;
    const lines = helper
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'));
    if (
      lines.filter((s) => s.startsWith('Scenario:')).length !== 1 ||
      lines.some((s) => !/^(@ignore$|Feature:|Scenario:|\* def )/.test(s))
    )
      continue;
    const definitions = lines.filter((s) => s.startsWith('* def '));
    if (definitions.length !== 1) continue;
    const definition = /^\* def ([A-Za-z_]\w*) = (\{.*\})$/.exec(definitions[0]);
    if (!definition) continue;
    const schema = flatSchema(definition[2]);
    if (!schema) continue;
    // Prevent reassignment or other uses of the result alias in the supported extraction.
    if (
      [
        ...nativeSteps
          .join('\n')
          .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '""')
          .matchAll(new RegExp('\\b' + call[1] + '\\b', 'g')),
      ].length !== 2
    )
      continue;
    const literalData = (expression: string) => {
      const source = ts.createSourceFile(
        'data.ts',
        'const data = ' + expression.replace(/<[A-Za-z_]\w*>/g, '0'),
        ts.ScriptTarget.Latest,
        true,
      );
      if (
        (source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics
          ?.length ||
        source.statements.length !== 1
      )
        return false;
      const declaration = source.statements[0];
      if (
        !ts.isVariableStatement(declaration) ||
        declaration.declarationList.declarations.length !== 1
      )
        return false;
      const literal = (node: ts.Node | undefined): boolean => {
        if (!node) return false;
        if (ts.isStringLiteral(node)) return !/#(?:#)?\(/.test(node.text);
        if (
          ts.isNumericLiteral(node) ||
          [
            ts.SyntaxKind.TrueKeyword,
            ts.SyntaxKind.FalseKeyword,
            ts.SyntaxKind.NullKeyword,
          ].includes(node.kind)
        )
          return true;
        if (ts.isPrefixUnaryExpression(node))
          return node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand);
        return (
          ts.isObjectLiteralExpression(node) &&
          node.properties.every(
            (p) =>
              ts.isPropertyAssignment(p) &&
              (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
              literal(p.initializer),
          )
        );
      };
      return literal(declaration.declarationList.declarations[0]?.initializer);
    };
    const stepBodies = nativeSteps;
    const helperCall = call[0].trim().replace(/^\*\s+/, '');
    if (
      stepBodies.some((step) => {
        if (
          step === helperCall ||
          step === 'url baseUrl' ||
          step === 'method get' ||
          step === 'status 200' ||
          step === 'match response == ' + call[1] + '.' + definition[1]
        )
          return false;
        const expression =
          /^(?:path |params |param [A-Za-z_]\w* = |match response(?:\.[A-Za-z_]\w*)? (?:==|contains) )(.+)$/.exec(
            step,
          )?.[1];
        return !expression || !literalData(expression);
      })
    )
      continue;
    const replacement = new RegExp(
      '^(Given|When|Then|And|But|\\*)\\s+match response == ' +
        call[1] +
        '\\.' +
        definition[1] +
        '$',
    );
    if (!after.split('\n').some((s) => replacement.test(s.trim()))) continue;
    for (const line of before.split('\n').map((s) => s.trim())) {
      const assertion = /^(?:Given|When|Then|And|But|\*)\s+match response == (\{.*\})$/.exec(line);
      if (assertion && flatSchema(assertion[1]) === schema) equivalent.add(line);
    }
  }
  return equivalent;
}
