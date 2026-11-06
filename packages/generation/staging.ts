import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  realpathSync,
  symlinkSync,
} from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { AppError, type Target } from '../domain/model.ts';
import { hash, parseFeature } from '../domain/gherkin.ts';
import { fileTree, readText, within } from '../workspace/files.ts';
import type { ChangeProposal, FileChange } from './model.ts';
import { privateDirectory } from './private-directory.ts';

export function allowedChangePath(path: string) {
  if (
    path.length > 180 ||
    !/^(contracts\/features\/[A-Za-z0-9_/-]+\.feature|ui\/(pages|components|steps|builders)\/[A-Za-z0-9_/-]+\.tsx?|ui\/fixtures\.ts|api\/src\/test\/resources\/(features|helpers)\/[A-Za-z0-9_/-]+\.feature|contracts\/manifest\.json)$/.test(
      path,
    ) ||
    path.split('/').some((p) => !p || p === '..' || p === '.' || p.startsWith('.'))
  )
    throw new AppError(
      403,
      'Generated changes are restricted to reviewed Gherkin and UI/API automation source',
    );
}
export function destination(root: string, path: string, createParents = false, created?: string[]) {
  allowedChangePath(path);
  if (realpathSync(root) !== root) throw new AppError(409, 'Target root changed');
  const parts = path.split('/');
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    parent = join(parent, part);
    if (!existsSync(parent)) {
      if (lstatExists(parent) || !createParents)
        throw new AppError(409, 'Parent directory is unavailable');
      mkdirSync(parent, { mode: 0o700 });
      created?.push(parent);
    }
    if (
      lstatSync(parent).isSymbolicLink() ||
      realpathSync(parent) !== parent ||
      !within(root, parent)
    )
      throw new AppError(403, 'Symlinked destination denied');
  }
  const result = join(root, ...parts);
  if (lstatExists(result) && (lstatSync(result).isSymbolicLink() || !lstatSync(result).isFile()))
    throw new AppError(403, 'Destination must be a regular file');
  return result;
}
function lstatExists(path: string) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
export function currentText(root: string, path: string) {
  // Check existing ancestors even when the file itself is new.
  allowedChangePath(path);
  let parent = root;
  if (realpathSync(root) !== root) throw new AppError(409, 'Target root changed');
  for (const part of path.split('/')) {
    parent = join(parent, part);
    if (!lstatExists(parent)) return null;
    if (lstatSync(parent).isSymbolicLink()) throw new AppError(403, 'Symlinked target path denied');
  }
  return readText(root, path).text;
}
export function targetRevision(root: string) {
  if (realpathSync(root) !== root) throw new AppError(409, 'Target root changed');
  return hash(
    fileTree(root)
      .map((path) => path + ':' + hash(readFileSync(join(root, path))))
      .join('\n'),
  );
}
export function validateGeneratedFile(path: string, text: string) {
  allowedChangePath(path);
  if (Buffer.byteLength(text) > 32000 || text.includes('\0'))
    throw new AppError(413, 'Generated file exceeds text budget');
  if (/-----BEGIN .*PRIVATE KEY|\bsk-[A-Za-z0-9_-]{20,}/.test(text))
    throw new AppError(422, 'Potential credential in generated output');
  if (path === 'contracts/manifest.json') {
    JSON.parse(text);
    return;
  }
  if (path.endsWith('.feature')) {
    parseFeature(text, path);
    return;
  }
  const file = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (
    (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics
      ?.length
  )
    throw new AppError(422, 'Generated TypeScript has syntax errors');
  const checkImports = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (!['@playwright/test', 'playwright-bdd'].includes(specifier)) {
        const resolved = posix.normalize(posix.join(posix.dirname(path), specifier));
        if (!specifier.startsWith('.') || specifier.includes('\\') || !resolved.startsWith('ui/'))
          throw new AppError(
            403,
            'Generated imports must stay in the UI target or approved framework packages',
          );
      }
    }
    ts.forEachChild(node, checkImports);
  };
  checkImports(file);

  const unsafe =
    /\b(waitForTimeout|setTimeout|eval|Function|execSync|execFile|spawn|require)\s*\(|\bforce\s*:\s*true|xpath\s*=|\/html\/|\bprocess\.|\bimport\s*\(|\bfetch\s*\(|\.(evaluate|route|request)\b/;
  if (unsafe.test(text) || /from\s*['"](?:node:|https?:|fs['"]|child_process['"])/.test(text))
    throw new AppError(422, 'Generated code violates the UI execution policy; review manually');
  if (
    path.startsWith('ui/steps/') &&
    /\.(click|fill|goto|locator|getByRole|getByLabel|getByTestId|selectOption|press)\s*\(/.test(
      text,
    )
  )
    throw new AppError(422, 'UI interaction belongs in Pages/components, not step definitions');
  if (/\.(getByRole|getByLabel|getByTestId)\s*\(/.test(text) && !/\.toHaveCount\(1\)/.test(text))
    throw new AppError(422, 'Generated locators require scoped uniqueness assertions');
  if (/\.locator\s*\(|\.nth\s*\(|\.first\s*\(/.test(text))
    throw new AppError(422, 'Unjustified positional/CSS locators require manual review');
}
export function makeDiff(files: FileChange[]) {
  return files
    .map(
      (f) =>
        `--- ${f.before === null ? '/dev/null' : 'a/' + f.path}\n+++ b/${f.path}\n@@ -${f.before === null ? '0,0' : '1,' + f.before.split('\n').length} +1,${f.after.split('\n').length} @@\n${
          f.before === null
            ? ''
            : f.before
                .split('\n')
                .map((x) => '-' + x)
                .join('\n') + '\n'
        }${f.after
          .split('\n')
          .map((x) => '+' + x)
          .join('\n')}\n`,
    )
    .join('\n');
}
export function buildStage(target: Target, proposal: ChangeProposal, root: string) {
  if (existsSync(root)) throw new AppError(409, 'Stage already exists');
  privateDirectory(root);
  let bytes = 0,
    files = 0;
  for (const path of fileTree(target.path)) {
    if (!/^(ui\/.*\.(tsx?|json)|contracts\/.*\.(feature|json)|api\/.*)$/.test(path)) continue;
    const text = readFileSync(join(target.path, path));
    bytes += text.byteLength;
    files++;
    if (bytes > 4_000_000 || files > 500)
      throw new AppError(413, 'Validation overlay exceeds budget');
    const output = join(root, path);
    mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
    writeFileSync(output, text, { mode: path === 'api/gradlew' ? 0o700 : 0o600 });
  }
  for (const file of proposal.files) {
    const output = destination(root, file.path, true);
    writeFileSync(output, file.after, { mode: 0o600 });
  }
  if (proposal.framework === 'karate') return;
  const dependencies = join(target.path, 'ui/node_modules');
  if (!existsSync(dependencies) || lstatSync(dependencies).isSymbolicLink())
    throw new AppError(409, 'Install the trusted target UI dependencies before validation');
  // Explicit execution trust covers existing dependencies. This link is not exposed to agent tools.
  symlinkSync(realpathSync(dependencies), join(root, 'ui/node_modules'), 'dir');
}
export function applyFiles(root: string, proposal: ChangeProposal, journalPath: string) {
  const journal: {
    proposalId: string;
    diffHash: string;
    state: string;
    applied: string[];
    createdDirectories: string[];
    error?: string;
  } = {
    proposalId: proposal.id,
    diffHash: proposal.hash,
    state: 'APPLYING',
    applied: [],
    createdDirectories: [],
  };
  const save = () => writeFileSync(journalPath, JSON.stringify(journal, null, 2), { mode: 0o600 });
  for (const f of proposal.files) {
    const before = currentText(root, f.path);
    if ((before === null ? null : hash(before)) !== f.baseHash)
      throw new AppError(409, 'Base file changed; review a new proposal');
  }
  save();
  try {
    for (const f of proposal.files) {
      const output = destination(root, f.path, true, journal.createdDirectories);
      const before = currentText(root, f.path);
      if ((before === null ? null : hash(before)) !== f.baseHash)
        throw new AppError(409, 'Base changed during application');
      const temporary = join(dirname(output), '.qa-apply-' + randomUUID());
      try {
        writeFileSync(temporary, f.after, { flag: 'wx', mode: 0o600 });
        destination(root, f.path);
        renameSync(temporary, output);
      } finally {
        if (existsSync(temporary)) unlinkSync(temporary);
      }
      journal.applied.push(f.path);
      save();
    }
    journal.state = 'APPLIED';
    save();
    return journal;
  } catch (e) {
    journal.state = 'ROLLING_BACK';
    journal.error = e instanceof Error ? e.message : 'Application failed';
    save();
    for (const path of [...journal.applied].reverse()) {
      const f = proposal.files.find((f) => f.path === path)!;
      try {
        const output = destination(root, path);
        if (hash(readFileSync(output)) !== hash(f.after))
          throw new Error('Concurrent edit; rollback refused', { cause: e });
        if (f.before === null) unlinkSync(output);
        else writeFileSync(output, f.before, { mode: 0o600 });
      } catch {
        journal.state = 'PARTIAL_FAILURE';
      }
    }
    for (const directory of [...journal.createdDirectories].reverse()) {
      try {
        if (realpathSync(directory) !== directory)
          throw new Error('Directory changed', { cause: e });
        rmdirSync(directory);
      } catch {
        journal.state = 'PARTIAL_FAILURE';
      }
    }
    if (journal.state !== 'PARTIAL_FAILURE') journal.state = 'ROLLED_BACK';
    save();
    throw new AppError(409, 'Application failed: ' + journal.state + '; inspect journal', {
      cause: e,
    });
  }
}

export function preserveExistingCapabilities(
  before: string | null,
  after: string,
  path: string,
  equivalentApiAssertions: ReadonlySet<string> = new Set(),
) {
  if (before === null) return;
  if (path.endsWith('.feature')) {
    if (path.startsWith('api/')) {
      const assertions = before
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => /^(Given|When|Then|And|But|\*)\s+(match|status|assert)\s/.test(s));
      const current = new Set(after.split('\n').map((s) => s.trim()));
      if (assertions.some((s) => !current.has(s) && !equivalentApiAssertions.has(s)))
        throw new AppError(422, 'Existing API assertions must be preserved during generation');
    }
    return;
  }
  const signatures = (text: string) => {
    const file = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const result = new Map<string, string>();
    const walk = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
        const parent = node.parent;
        const owner =
          ts.isClassDeclaration(parent) || ts.isClassExpression(parent)
            ? parent.name?.text || 'anonymous'
            : 'unknown';
        result.set(
          owner +
            ':' +
            (ts.isConstructorDeclaration(node) ? 'constructor' : node.name.getText(file)),
          node.getText(file).replace(/\s+/g, ''),
        );
      }
      if (ts.isCallExpression(node) && /^(Given|When|Then)$/.test(node.expression.getText(file)))
        result.set(
          'step:' + node.arguments[0]?.getText(file).replace(/["']/g, ''),
          node.getText(file).replace(/\s+/g, ''),
        );
      ts.forEachChild(node, walk);
    };
    walk(file);
    return result;
  };
  const previous = signatures(before),
    next = signatures(after);
  for (const [name, body] of previous)
    if (next.get(name) !== body)
      throw new AppError(
        422,
        'Existing methods/steps must be preserved during generation: ' + name,
      );
}
