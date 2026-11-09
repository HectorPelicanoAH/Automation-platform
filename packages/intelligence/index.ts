import {
  openApiCapabilities,
  fastifyRoutes,
  karateCapabilities,
  type ApiOperation,
} from './api.ts';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync, lstatSync } from 'node:fs';
import { matchesGlob, join, relative, sep } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { AppError } from '../domain/model.ts';
import { hash, parseFeature } from '../domain/gherkin.ts';
import { Store } from '../storage/store.ts';
import { Workspace } from '../workspace/workspace.ts';
import { canonicalDirectory, permittedEntry, readText, safeFile } from '../workspace/files.ts';

export interface RootRef {
  kind: 'source' | 'target';
  id: string;
}
export interface Capability {
  kind: string;
  name: string;
  line: number;
  confidence: 'syntax';
  operation?: ApiOperation;
}
export interface IndexedFile {
  path: string;
  hash: string;
  capabilities: Capability[];
  warnings: string[];
}
export interface RepositoryIndex {
  ref: RootRef;
  extractor: string;
  revision: string | null;
  treeHash: string;
  preferredRef: string;
  branch: string | null;
  indexedAt: string;
  files: IndexedFile[];
  parsed: number;
  reused: number;
  skipped: number;
  truncated: boolean;
  policyHash: string;
  limits: string[];
}
const EXTRACTOR = 'repository-syntax-v3-api';
export type IndexSummary = Omit<RepositoryIndex, 'files'> & {
  fileCount: number;
  warningCount: number;
};
export function indexSummary(index: RepositoryIndex): IndexSummary {
  const { files, ...summary } = index;
  return {
    ...summary,
    fileCount: files.length,
    warningCount: files.reduce((n, f) => n + f.warnings.length, 0),
  };
}
function* indexPaths(
  root: string,
  exclude: string[],
  meter: { visited: number; truncated: boolean },
  directory = root,
  depth = 0,
): Generator<string> {
  if (depth > 12) {
    meter.truncated = true;
    return;
  }
  if (realpathSync(directory) !== directory || lstatSync(directory).isSymbolicLink())
    throw new AppError(403, 'Index directory symlink denied');
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (++meter.visited > 10000) {
      meter.truncated = true;
      return;
    }
    const absolute = join(directory, entry.name),
      path = relative(root, absolute).split(sep).join('/');
    if (
      !permittedEntry(entry.name) ||
      entry.isSymbolicLink() ||
      matches(path, exclude) ||
      matches(path + '/', exclude)
    )
      continue;
    if (entry.isDirectory()) yield* indexPaths(root, exclude, meter, absolute, depth + 1);
    else if (entry.isFile()) yield path;
    if (meter.visited > 10000) return;
  }
}
function featureCapabilities(
  text: string,
  path: string,
): Pick<IndexedFile, 'capabilities' | 'warnings'> {
  try {
    const feature = parseFeature(text, path);
    return {
      capabilities: [
        { kind: 'feature', name: feature.name, line: 1, confidence: 'syntax' as const },
        ...feature.scenarios.slice(0, 99).map((s) => ({
          kind: 'scenario',
          name: s.name,
          line: s.line,
          confidence: 'syntax' as const,
        })),
      ],
      warnings: feature.scenarios.length > 99 ? ['Scenario facts truncated'] : [],
    };
  } catch {
    return { capabilities: [], warnings: ['Invalid Gherkin; no functional contract inferred.'] };
  }
}

const matches = (path: string, patterns: string[]) =>
  patterns.some(
    (p) => matchesGlob(path, p) || path === p || path.startsWith(p.replace(/\/$/, '') + '/'),
  );
const literal = (node: ts.Node | undefined) =>
  node && (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;

export function extractCapabilities(
  text: string,
  path: string,
): Pick<IndexedFile, 'capabilities' | 'warnings'> {
  const file = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('x')
      ? ts.ScriptKind.TSX
      : path.endsWith('.js')
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS,
  );
  const capabilities: Capability[] = [];
  const testBindings = new Set<string>();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !['@playwright/test', 'playwright-bdd'].includes(statement.moduleSpecifier.text)
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const binding of bindings.elements)
        if ((binding.propertyName?.text || binding.name.text) === 'test')
          testBindings.add(binding.name.text);
  }
  const add = (node: ts.Node, kind: string, name: string | undefined) => {
    if (name && capabilities.length < 100)
      capabilities.push({
        kind,
        name: name.slice(0, 240),
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
        confidence: 'syntax',
      });
  };
  const walk = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isPropertyAccessExpression(node.initializer.expression) &&
      node.initializer.expression.name.text === 'extend' &&
      ts.isIdentifier(node.initializer.expression.expression) &&
      testBindings.has(node.initializer.expression.expression.text)
    )
      add(node, 'fixture', node.name.text);
    if (ts.isClassDeclaration(node)) {
      add(
        node,
        /component/i.test((node.name?.text || '') + ' ' + path)
          ? 'component'
          : /page/i.test((node.name?.text || '') + ' ' + path)
            ? 'page'
            : 'class',
        node.name?.text,
      );
      for (const member of node.members)
        if (ts.isMethodDeclaration(member) && member.name)
          add(member, 'method', `${node.name?.text || 'anonymous'}.${member.name.getText(file)}`);
    }
    if (ts.isFunctionDeclaration(node))
      add(node, /builder/i.test(path) ? 'builder' : 'function', node.name?.text);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    )
      add(
        node,
        /^[A-Z]/.test(node.name.text) && /\.[jt]sx$/.test(path)
          ? 'component'
          : /builder/i.test(path)
            ? 'builder'
            : 'function',
        node.name.text,
      );
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node))
      add(node, 'model', node.name.text);
    if (ts.isImportDeclaration(node)) add(node, 'import', literal(node.moduleSpecifier));
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(file);
      if (/^(Given|When|Then)$/.test(name)) add(node, 'step', literal(node.arguments[0]));
      if (/getBy(Role|Label|TestId)$/.test(name))
        add(node, 'locator', `${name}(${literal(node.arguments[0]) || 'dynamic'})`);
    }
    if (
      ts.isJsxAttribute(node) &&
      ['role', 'aria-label', 'data-testid', 'href', 'path', 'htmlFor'].includes(
        node.name.getText(file),
      )
    )
      add(node, node.name.getText(file), literal(node.initializer));
    ts.forEachChild(node, walk);
  };
  walk(file);
  capabilities.push(...fastifyRoutes(file));
  const diagnostics =
    (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ||
    [];
  return {
    capabilities,
    warnings: diagnostics.length
      ? ['Syntax errors: extraction is partial; no code was executed.']
      : [],
  };
}

export class CapabilityIndex {
  private active = new Set<string>();
  constructor(
    readonly store: Store,
    readonly workspace: Workspace,
  ) {
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS repository_indexes (id TEXT PRIMARY KEY, data TEXT NOT NULL);',
    );
  }
  root(ref: RootRef) {
    if (!['source', 'target'].includes(ref.kind) || typeof ref.id !== 'string')
      throw new AppError(400, 'Invalid repository reference');
    const item =
      ref.kind === 'source' ? this.store.get('sources', ref.id) : this.store.get('targets', ref.id);
    if (!item) throw new AppError(404, 'Registered repository not found');
    if ('indexEnabled' in item && (!item.enabled || !item.indexEnabled))
      throw new AppError(403, 'Source indexing requires explicit opt-in');
    if (canonicalDirectory(item.path) !== item.path)
      throw new AppError(409, 'Registered root changed');
    return item;
  }
  get(ref: RootRef, allowStalePolicy = false): RepositoryIndex | undefined {
    const item = this.root(ref);
    const row = this.store.db
      .prepare('SELECT data FROM repository_indexes WHERE id=?')
      .get(ref.kind + ':' + ref.id) as { data: string } | undefined;
    const index: RepositoryIndex | undefined = row ? JSON.parse(row.data) : undefined;
    const include = 'include' in item ? item.include : [];
    const exclude = 'exclude' in item ? item.exclude : [];
    if (
      index &&
      !allowStalePolicy &&
      index.policyHash !== hash(JSON.stringify({ include, exclude, extractor: EXTRACTOR }))
    )
      throw new AppError(409, 'Index policy changed; reindex before retrieval');
    return index;
  }
  async scan(ref: RootRef, signal?: AbortSignal): Promise<RepositoryIndex> {
    const key = ref.kind + ':' + ref.id;
    if (this.active.has(key)) throw new AppError(409, 'Index scan already running');
    this.active.add(key);
    try {
      const item = this.root(ref);
      const include = 'include' in item ? item.include : [];
      const exclude = 'exclude' in item ? item.exclude : [];
      const policyHash = hash(JSON.stringify({ include, exclude, extractor: EXTRACTOR }));
      const old = this.get(ref, true);
      const ensurePolicy = () => {
        const current = this.root(ref);
        const include = 'include' in current ? current.include : [];
        const exclude = 'exclude' in current ? current.exclude : [];
        if (hash(JSON.stringify({ include, exclude, extractor: EXTRACTOR })) !== policyHash)
          throw new AppError(409, 'Index policy changed during scan; restart indexing');
      };
      const previous = new Map(
        old?.policyHash === policyHash ? old.files.map((f) => [f.path, f]) : [],
      );
      let revision: string | null = null,
        branch: string | null = null;
      try {
        const git = (...args: string[]) =>
          execFileSync(
            'git',
            [
              '--no-optional-locks',
              '-c',
              'core.fsmonitor=false',
              '-c',
              'core.hooksPath=/dev/null',
              '-C',
              item.path,
              'rev-parse',
              ...args,
            ],
            { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] },
          ).trim();
        revision = git('HEAD');
        branch = git('--abbrev-ref', 'HEAD');
      } catch {
        /* A non-Git directory remains valid. */
      }
      const files: IndexedFile[] = [];
      let parsed = 0,
        reused = 0,
        skipped = 0,
        bytes = 0,
        truncated = false;
      const meter = { visited: 0, truncated: false };
      for (const path of indexPaths(item.path, exclude, meter)) {
        if (signal?.aborted) throw new AppError(409, 'Indexing cancelled');
        ensurePolicy();
        if (
          (exclude.length && matches(path, exclude)) ||
          (include.length && !matches(path, include)) ||
          !(/\.(tsx?|jsx?|feature)$/.test(path) || /(?:openapi|swagger)[^/]*\.json$/i.test(path)) ||
          /(^|\/)(AGENTS\.md|SKILL\.md|.*config\.[cm]?[jt]s)$/.test(path)
        ) {
          skipped++;
          continue;
        }
        if (files.length >= 500 || bytes >= 8_000_000) {
          truncated = true;
          break;
        }
        const content = readText(item.path, path);
        const size = Buffer.byteLength(content.text);
        if (size > 200_000) {
          skipped++;
          continue;
        }
        if (bytes + size > 8_000_000) {
          truncated = true;
          break;
        }
        bytes += size;
        const cached = previous.get(path);
        if (cached?.hash === content.hash) {
          files.push(cached);
          reused++;
        } else {
          const extracted = path.endsWith('.json')
            ? openApiCapabilities(content.text)
            : path.endsWith('.feature')
              ? path.startsWith('api/')
                ? karateCapabilities(content.text)
                : featureCapabilities(content.text, path)
              : extractCapabilities(content.text, path);
          files.push({ path, hash: content.hash, ...extracted });
          parsed++;
        }
        await setImmediate();
      }
      ensurePolicy();
      truncated ||= meter.truncated;
      const index: RepositoryIndex = {
        ref,
        extractor: EXTRACTOR,
        revision,
        branch,
        preferredRef: 'preferredRef' in item ? item.preferredRef : '',
        treeHash: hash(files.map((f) => f.path + ':' + f.hash).join('\n')),
        indexedAt: new Date().toISOString(),
        files,
        parsed,
        reused,
        skipped,
        truncated,
        policyHash,
        limits: [
          'TypeScript/JavaScript static syntax, OpenAPI 3.0/3.1 inline JSON and Karate feature syntax; dynamic routes/auth and referenced schemas require confirmation.',
          '500 files / 8 MB / 200 KB per parsed file; 10,000 visited entries / 12 directory levels. Secrets, instructions, symlinks and generated trees excluded.',
          'Working-tree file hashes are authoritative; Git HEAD is provenance, not a clean-tree claim.',
        ],
      };
      this.store.db
        .prepare(
          'INSERT INTO repository_indexes VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .run(key, JSON.stringify(index));
      return index;
    } finally {
      this.active.delete(key);
    }
  }
  lookup(ref: RootRef, query: string) {
    const root = this.root(ref);
    const index = this.get(ref);
    if (!index) throw new AppError(409, 'Index this repository first');
    const terms = query
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2)
      .slice(0, 20);
    const hits = index.files
      .map((file) => ({
        file,
        score: file.capabilities.reduce(
          (n, c) =>
            n +
            terms.filter((t) => (c.kind + ' ' + c.name + ' ' + file.path).toLowerCase().includes(t))
              .length,
          0,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    return hits.map(({ file, score }) => ({
      ref,
      path: file.path,
      hash: file.hash,
      revision: index.revision,
      treeHash: index.treeHash,
      score,
      capabilities: file.capabilities.slice(0, 30),
      stale: (() => {
        try {
          return hash(readFileSync(safeFile(root.path, file.path))) !== file.hash;
        } catch {
          return true;
        }
      })(),
    }));
  }
  read(ref: RootRef, path: string) {
    const root = this.root(ref);
    const file = this.get(ref)?.files.find((f) => f.path === path);
    if (!file) throw new AppError(403, 'File is not in the authorized index');
    const content = readText(root.path, path);
    if (content.hash !== file.hash)
      throw new AppError(409, 'Indexed file changed; reindex before retrieval');
    if (Buffer.byteLength(content.text) > 16000)
      throw new AppError(413, 'File exceeds task context limit; narrow it manually');
    return { ...content, ref, capabilities: file.capabilities };
  }
}
