import ts from 'typescript';
import type { Capability, IndexedFile } from './index.ts';

export interface ApiOperation {
  method: string;
  path: string;
  authentication: 'none' | 'required' | 'unknown';
  parameters: unknown[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
  questions: string[];
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
export function openApiCapabilities(text: string): Pick<IndexedFile, 'capabilities' | 'warnings'> {
  const capabilities: Capability[] = [],
    warnings: string[] = [];
  try {
    const doc = object(JSON.parse(text));
    if (!/^3\.(0|1)\./.test(String(doc.openapi)))
      return {
        capabilities,
        warnings: ['Only OpenAPI 3.0/3.1 JSON is supported; no external references fetched.'],
      };
    const paths = object(doc.paths);
    for (const [path, item] of Object.entries(paths)) {
      if (!path.startsWith('/') || path.length > 180) continue;
      const entry = object(item);
      for (const method of methods) {
        if (!entry[method]) continue;
        if (capabilities.length >= 100) {
          warnings.push('Operation facts truncated at 100');
          break;
        }
        const op = object(entry[method]);
        const security = Object.hasOwn(op, 'security')
          ? op.security
          : Object.hasOwn(doc, 'security')
            ? doc.security
            : [];
        const questions: string[] = [];
        const declaredParameters = [
          ...(Array.isArray(entry.parameters) ? entry.parameters : []),
          ...(Array.isArray(op.parameters) ? op.parameters : []),
        ];
        const parameters = [
          ...new Map(
            declaredParameters.map((p) => {
              const parameter = object(p);
              return [String(parameter.in) + ':' + String(parameter.name), p];
            }),
          ).values(),
        ];
        if (
          parameters.some(
            (p) =>
              !['query', 'path', 'header', 'cookie'].includes(String(object(p).in)) ||
              typeof object(p).name !== 'string',
          )
        )
          questions.push(
            'Confirm parameter names, locations and schemas; unresolved parameter references are unsupported.',
          );
        if (parameters.some((p) => object(p).in !== 'query'))
          questions.push(
            'Automatic generation supports query parameters only; review headers, cookies or path substitution manually.',
          );
        if (/[{}]/.test(path))
          questions.push(
            'Path-parameter substitution requires a separately reviewed implementation.',
          );
        if (op.requestBody)
          questions.push('Request-body generation requires a separately reviewed implementation.');
        const responses = object(op.responses);
        const jsonSchema = object(
          object(object(responses['200']).content)['application/json'],
        ).schema;
        if (!jsonSchema || !Object.keys(object(jsonSchema)).length)
          questions.push(
            'Confirm an explicit application/json schema for the successful 200 response.',
          );
        if (Object.keys(responses).length === 0) questions.push('Confirm the response contract.');
        const relevant = { parameters, responses, requestBody: op.requestBody };
        if (/"\$ref"\s*:/.test(JSON.stringify(relevant)))
          questions.push(
            'Resolve referenced request/response schemas explicitly; reference traversal is not supported.',
          );
        if (entry.$ref) questions.push('Resolve the referenced path item explicitly.');
        const validSecurity =
          Array.isArray(security) &&
          security.every(
            (s) =>
              s !== null &&
              typeof s === 'object' &&
              !Array.isArray(s) &&
              Object.values(s).every(
                (scopes) =>
                  Array.isArray(scopes) && scopes.every((scope) => typeof scope === 'string'),
              ),
          );
        const auth = !validSecurity
          ? 'unknown'
          : security.length === 0 || security.some((s) => Object.keys(object(s)).length === 0)
            ? 'none'
            : 'required';
        if (auth !== 'none')
          questions.push(
            'Select and review an existing authentication helper and credential reference; automatic credential generation is unavailable.',
          );
        const operation: ApiOperation = {
          method: method.toUpperCase(),
          path,
          authentication: auth,
          parameters,
          responses,
          questions,
          ...(op.requestBody ? { requestBody: op.requestBody } : {}),
        };
        capabilities.push({
          kind: 'endpoint',
          name: `${operation.method} ${path}`,
          line: 1,
          confidence: 'syntax',
          operation,
        });
      }
    }
    if (!capabilities.length)
      warnings.push('No supported inline operations; path-item references are not resolved.');
  } catch {
    warnings.push('Invalid OpenAPI JSON; no endpoint contract inferred.');
  }
  return { capabilities, warnings };
}
export function fastifyRoutes(file: ts.SourceFile): Capability[] {
  const capabilities: Capability[] = [];
  const bindings = new Set<string>();
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'fastify' &&
      statement.importClause?.name
    )
      bindings.add(statement.importClause.name.text);
  }
  const instances = new Set<string>();
  const walk = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      bindings.has(node.initializer.expression.getText(file))
    )
      instances.add(node.name.text);
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      instances.has(node.expression.expression.getText(file)) &&
      methods.includes(node.expression.name.text)
    ) {
      const arg = node.arguments[0];
      if (
        arg &&
        ts.isStringLiteralLike(arg) &&
        arg.text.startsWith('/') &&
        capabilities.length < 100
      ) {
        const method = node.expression.name.text.toUpperCase();
        capabilities.push({
          kind: 'endpoint',
          name: `${method} ${arg.text}`,
          line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
          confidence: 'syntax',
          operation: {
            method,
            path: arg.text,
            authentication: 'unknown',
            parameters: [],
            responses: {},
            questions: [
              'Source route only: confirm inherited hooks/authentication, request parameters and response schema through an explicit API contract.',
            ],
          },
        });
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(file);
  return capabilities;
}
export function karateCapabilities(text: string): Pick<IndexedFile, 'capabilities' | 'warnings'> {
  const capabilities: Capability[] = [];
  text.split('\n').forEach((line, index) => {
    const feature = /^\s*Feature:\s*(.+)/.exec(line);
    if (feature)
      capabilities.push({
        kind: 'karate-feature',
        name: feature[1].trim(),
        line: index + 1,
        confidence: 'syntax',
      });
    const call = /\b(call|callonce)\s+read\(\s*['"]([^'"]+)['"]\s*\)/.exec(line);
    if (call)
      capabilities.push({
        kind: 'karate-call',
        name: call[2],
        line: index + 1,
        confidence: 'syntax',
      });
    const variable = /^\s*\*\s+def\s+(\w+)\s*=/.exec(line);
    if (variable)
      capabilities.push({
        kind: 'karate-helper',
        name: variable[1],
        line: index + 1,
        confidence: 'syntax',
      });
  });
  return {
    capabilities: capabilities.slice(0, 100),
    warnings: capabilities.length > 100 ? ['Karate facts truncated'] : [],
  };
}
