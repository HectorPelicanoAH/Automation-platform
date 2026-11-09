import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { AppError, type Source, type Target } from '../domain/model.ts';
import { hash, parseFeature } from '../domain/gherkin.ts';
import { canonicalDirectory, fileTree, overlap, readText } from './files.ts';
import { Store } from '../storage/store.ts';

export class Workspace {
  constructor(
    readonly store: Store,
    readonly platformRoot: string,
  ) {}

  validateRoot(path: string) {
    const canonical = canonicalDirectory(path);
    const occupied = [
      realpathSync(this.platformRoot),
      realpathSync(this.store.directory),
      ...this.store.list('sources').map((s) => s.path),
      ...this.store.list('targets').map((t) => t.path),
    ];
    if (occupied.some((root) => overlap(root, canonical)))
      throw new AppError(
        409,
        'Directory overlaps an existing source, target, platform or private data root',
      );
    return canonical;
  }
  addSource(
    input: Pick<
      Source,
      'name' | 'path' | 'kind' | 'preferredRef' | 'enabled' | 'indexEnabled' | 'include' | 'exclude'
    >,
  ) {
    const path = this.validateRoot(input.path);
    let git: Source['git'] = null;
    const detected: string[] = [];
    if (existsSync(join(path, 'package.json'))) {
      try {
        const pkg = JSON.parse(readText(path, 'package.json').text) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        detected.push('JavaScript / TypeScript');
        for (const name of ['react', 'vue', 'next', 'fastify', 'express', '@angular/core'])
          if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) detected.push(name);
      } catch {
        detected.push('Unparsed package manifest');
      }
    }
    if (existsSync(join(path, 'pom.xml')) || existsSync(join(path, 'build.gradle')))
      detected.push('Java');
    if (existsSync(join(path, 'pyproject.toml'))) detected.push('Python');
    try {
      const gitRead = (...args: string[]) =>
        execFileSync(
          'git',
          [
            '--no-optional-locks',
            '-c',
            'core.fsmonitor=false',
            '-c',
            'core.hooksPath=/dev/null',
            '-C',
            path,
            'rev-parse',
            ...args,
          ],
          { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] },
        ).trim();
      git = { branch: gitRead('--abbrev-ref', 'HEAD'), commit: gitRead('HEAD') };
    } catch {
      /* Non-Git sources are valid. */
    }
    const source: Source = { ...input, path, detected, git, id: randomUUID() };
    this.store.put('sources', source);
    return source;
  }
  initialize(path: string, name: string) {
    if (!existsSync(path)) {
      if (!isAbsolute(path)) throw new AppError(400, 'Choose an absolute destination');
      const parent = canonicalDirectory(dirname(resolve(path)));
      const destination = join(parent, basename(resolve(path)));
      const roots = [
        this.platformRoot,
        this.store.directory,
        ...this.store.list('sources').map((s) => s.path),
        ...this.store.list('targets').map((t) => t.path),
      ];
      if (roots.some((root) => overlap(realpathSync(root), destination)))
        throw new AppError(409, 'Destination overlaps a registered root');
      mkdirSync(destination, { mode: 0o700 });
    }
    const root = this.validateRoot(path);
    if (readdirSync(root).length)
      throw new AppError(409, 'Initialization requires an empty destination');
    let ancestor = root;
    while (true) {
      if (existsSync(join(ancestor, '.git')))
        throw new AppError(409, 'Destination is inside an existing Git repository');
      const next = dirname(ancestor);
      if (next === ancestor) break;
      ancestor = next;
    }
    const template = join(this.platformRoot, 'templates/automation');
    for (const entry of readdirSync(template))
      cpSync(join(template, entry), join(root, entry), {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    return this.importTarget(root, name);
  }
  importTarget(path: string, name: string) {
    const root = this.validateRoot(path);
    for (const required of [
      'contracts/manifest.json',
      'ui/playwright.config.ts',
      'ui/package.json',
      'api/gradlew',
      'api/build.gradle',
    ])
      readText(root, required);
    const manifest = JSON.parse(readText(root, 'contracts/manifest.json').text);
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.features))
      throw new AppError(422, 'Unsupported target manifest');
    const target: Target = { id: randomUUID(), name, path: root };
    this.features(target);
    this.store.put('targets', target);
    return target;
  }
  target(id: string) {
    const target = this.store.get('targets', id);
    if (!target) throw new AppError(404, 'Target not found');
    if (canonicalDirectory(target.path) !== target.path)
      throw new AppError(409, 'Target root identity changed');
    return target;
  }
  features(target: Target) {
    const features = fileTree(target.path)
      .filter((p) => p.startsWith('contracts/features/') && p.endsWith('.feature'))
      .map((p) => parseFeature(readText(target.path, p).text, p));
    const identities = features
      .flatMap((f) => f.scenarios.map((s) => s.id))
      .filter((id) => !id.startsWith('unmapped:'));
    if (new Set(identities).size !== identities.length)
      throw new AppError(422, 'Scenario identities must be unique across the target');
    return features;
  }
  fingerprint(target: Target) {
    const files = fileTree(target.path).filter((p) => !p.startsWith('contracts/features/'));
    return hash(
      files.map((path) => path + ':' + hash(readFileSync(join(target.path, path)))).join('\n'),
    );
  }
  readiness(target?: Target) {
    const checks: { name: string; ready: boolean; detail: string }[] = [];
    checks.push({
      name: 'Database integrity',
      ready: this.store.integrity() === 'ok',
      detail: String(this.store.integrity()),
    });
    if (target) {
      for (const [name, relative] of [
        ['Playwright dependencies', 'ui/node_modules/@playwright/test/package.json'],
        ['Gradle wrapper', 'api/gradle/wrapper/gradle-wrapper.jar'],
      ]) {
        const absolute = join(target.path, relative);
        checks.push({
          name,
          ready: existsSync(absolute),
          detail: existsSync(absolute) ? 'Present' : 'Install using the target README',
        });
      }
      checks.push({
        name: 'Execution trust',
        ready: target.trustFingerprint === this.fingerprint(target),
        detail:
          'Imported configs execute code with your OS permissions. Trust the current fingerprint before running.',
      });
    }
    return checks;
  }
}
