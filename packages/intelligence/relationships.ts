import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import { hash } from '../domain/gherkin.ts';
import { readText } from '../workspace/files.ts';
import type { CapabilityIndex, RootRef } from './index.ts';

export interface Relationship {
  kind: 'step-page' | 'scenario-endpoint';
  from: string;
  to: string;
  evidence: { ref: RootRef; path: string; hash: string; line?: number }[];
  confidence: 'static' | 'declared';
  endpointState?: 'CURRENT' | 'STALE' | 'UNAVAILABLE';
}
// No git diff driver, pager, external diff, hooks or user configuration is executed.
function git(root: string, args: string[]) {
  return execFileSync(
    'git',
    [
      '--no-optional-locks',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=/dev/null',
      '-C',
      root,
      ...args,
    ],
    {
      encoding: 'utf8',
      timeout: 2000,
      maxBuffer: 64000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        PATH: process.env.PATH,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        GIT_NO_LAZY_FETCH: '1',
      },
    },
  ).trim();
}
export function recentChanges(root: string, paths: string[]) {
  try {
    const revision = git(root, ['rev-parse', '--verify', 'HEAD']);
    if (!/^[a-f0-9]{40,64}$/.test(revision)) throw new Error('Invalid revision');
    if (!paths.length) return { available: true, revision, commits: [], changedPaths: [] };
    return {
      available: true,
      revision,
      // Literal pathspecs prevent imported filenames from becoming git pathspec instructions.
      commits: git(root, [
        '--literal-pathspecs',
        'log',
        '-5',
        '--format=%H',
        '--',
        ...paths.slice(0, 12),
      ])
        .split('\n')
        .filter(Boolean),
      changedPaths: git(root, [
        '--literal-pathspecs',
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--name-only',
        revision,
        '--',
        ...paths.slice(0, 12),
      ])
        .split('\n')
        .filter(Boolean),
    };
  } catch {
    return { available: false, revision: null, commits: [], changedPaths: [] };
  }
}
export async function relationships(index: CapabilityIndex, ref: RootRef) {
  const snapshot = await index.scan(ref);
  const root = index.root(ref);
  const edges: Relationship[] = [];
  const warnings: string[] = [];
  const sources: { ref: RootRef; path: string; hash: string; revision: string | null }[] = [];
  if (ref.kind !== 'target')
    return {
      version: 1,
      identity: hash(
        JSON.stringify({ version: 1, treeHash: snapshot.treeHash, revision: snapshot.revision }),
      ),
      treeHash: snapshot.treeHash,
      revision: snapshot.revision,
      truncated: snapshot.truncated,
      edges,
      warnings,
      sources,
      limits: snapshot.limits,
    };
  const fixture = snapshot.files.find((f) => f.path === 'ui/fixtures.ts');
  const scannedSources = new Set<string>();
  const fixtures = new Map<string, { name: string; path: string }>();
  if (fixture) {
    const text = index.read(ref, fixture.path).text;
    const ast = ts.createSourceFile(fixture.path, text, ts.ScriptTarget.Latest, true);
    const imports = new Map<string, string>();
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const binding = node.importClause?.namedBindings;
      if (binding && ts.isNamedImports(binding))
        for (const element of binding.elements) {
          const base = posix.normalize(posix.join('ui', node.moduleSpecifier.text));
          const path = [base, base + '.ts', base + '.tsx'].find((p) =>
            snapshot.files.some((f) => f.path === p),
          );
          if (path) imports.set(element.name.text, path);
        }
    }
    const walk = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
        const constructors = new Set<string>();
        const find = (child: ts.Node) => {
          if (ts.isNewExpression(child) && ts.isIdentifier(child.expression))
            constructors.add(child.expression.text);
          ts.forEachChild(child, find);
        };
        find(node.initializer);
        if (constructors.size === 1) {
          const name = [...constructors][0],
            path = imports.get(name);
          if (
            path &&
            snapshot.files
              .find((f) => f.path === path)
              ?.capabilities.some((c) => ['page', 'component'].includes(c.kind) && c.name === name)
          )
            fixtures.set(node.name.text, { name, path });
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(ast);
  }
  for (const file of snapshot.files.filter((f) => f.path.startsWith('ui/steps/'))) {
    try {
      const ast = ts.createSourceFile(
        file.path,
        index.read(ref, file.path).text,
        ts.ScriptTarget.Latest,
        true,
      );
      const walk = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          /^(Given|When|Then)$/.test(node.expression.getText(ast)) &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          const fn = node.arguments[1];
          if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
            const parameter = fn.parameters[0]?.name;
            if (parameter && ts.isObjectBindingPattern(parameter))
              for (const binding of parameter.elements) {
                const key = binding.propertyName?.getText(ast) || binding.name.getText(ast),
                  page = fixtures.get(key);
                if (page && fixture)
                  edges.push({
                    kind: 'step-page',
                    from: node.arguments[0].text,
                    to: page.name,
                    confidence: 'static',
                    evidence: [
                      file,
                      fixture,
                      snapshot.files.find((f) => f.path === page.path)!,
                    ].map((f) => ({ ref, path: f.path, hash: f.hash })),
                  });
              }
          }
        }
        ts.forEachChild(node, walk);
      };
      walk(ast);
    } catch {
      warnings.push('Step relationship unavailable: ' + file.path);
    }
  }
  const manifest = readText(root.path, 'contracts/manifest.json');
  const parsed = JSON.parse(manifest.text);
  for (const feature of parsed.features || [])
    for (const scenario of feature.scenarios || []) {
      const endpoint = scenario.bindings?.karate?.endpoint;
      if (endpoint && typeof scenario.id === 'string') {
        let endpointState: Relationship['endpointState'] = 'UNAVAILABLE';
        const evidence: Relationship['evidence'] = [
          { ref, path: 'contracts/manifest.json', hash: manifest.hash },
        ];
        if (
          endpoint.ref?.kind === 'source' &&
          typeof endpoint.ref.id === 'string' &&
          typeof endpoint.path === 'string' &&
          typeof endpoint.hash === 'string'
        ) {
          try {
            const sourceRef: RootRef = { kind: 'source', id: endpoint.ref.id };
            if (!scannedSources.has(sourceRef.id)) {
              await index.scan(sourceRef);
              scannedSources.add(sourceRef.id);
            }
            const content = index.read(sourceRef, endpoint.path);
            const revision = recentChanges(index.root(sourceRef).path, []).revision;
            sources.push({ ref: sourceRef, path: endpoint.path, hash: content.hash, revision });
            evidence.push({ ref: sourceRef, path: endpoint.path, hash: content.hash });
            endpointState = content.hash === endpoint.hash ? 'CURRENT' : 'STALE';
          } catch {
            endpointState = 'UNAVAILABLE';
          }
        }
        edges.push({
          kind: 'scenario-endpoint',
          from: scenario.id,
          to: JSON.stringify(endpoint),
          confidence: 'declared',
          evidence,
          endpointState,
        });
      }
    }
  const identity = hash(
    JSON.stringify({
      extractor: 'relationships-v1',
      treeHash: snapshot.treeHash,
      revision: snapshot.revision,
      manifest: manifest.hash,
      edges,
      sources,
    }),
  );
  return {
    version: 1,
    identity,
    revision: snapshot.revision,
    treeHash: snapshot.treeHash,
    truncated: snapshot.truncated,
    edges,
    warnings,
    sources,
    limits: [
      'Static fixture/import subset; dynamic fixtures and indirect aliases require review.',
      'Endpoint bindings are declarations, not runtime coverage or UI/API equivalence.',
    ],
  };
}
