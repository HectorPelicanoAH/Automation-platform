import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../domain/model.ts';
import { hash } from '../domain/gherkin.ts';

export const within = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
};
export const overlap = (a: string, b: string) => within(a, b) || within(b, a);
const blocked = /^(node_modules|dist|build|target|test-results|playwright-report)$/;
const secret = /^\.|\.(pem|key|p12|pfx)$|credentials|secrets/i;

export function canonicalDirectory(path: string) {
  if (!isAbsolute(path) || path.includes('\0'))
    throw new AppError(400, 'Choose an absolute local directory');
  try {
    const real = realpathSync(path);
    if (!statSync(real).isDirectory()) throw new Error('not directory');
    return real;
  } catch {
    throw new AppError(400, 'Directory is unavailable or inaccessible');
  }
}

export function safeFile(root: string, path: string, write = false) {
  if (!path || isAbsolute(path) || path.includes('\\') || path.includes('\0'))
    throw new AppError(403, 'Invalid relative path');
  const parts = path.split('/');
  if (parts.some((p) => p === '..' || secret.test(p) || blocked.test(p)))
    throw new AppError(403, 'Path is outside the permitted file policy');
  try {
    if (realpathSync(root) !== root) throw new Error('root changed');
    const destination = resolve(root, path);
    const real = realpathSync(destination);
    if (!within(root, real) || (write && lstatSync(destination).isSymbolicLink()))
      throw new AppError(403, 'Symlink escape denied');
    if (!statSync(real).isFile()) throw new AppError(400, 'Not a file');
    if (statSync(real).size > 1_000_000) throw new AppError(413, 'File exceeds preview limit');
    return real;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(404, 'File or registered root is unavailable');
  }
}

export function readText(root: string, path: string) {
  const text = readFileSync(safeFile(root, path), 'utf8');
  if (text.includes('\0')) throw new AppError(400, 'Binary previews are unavailable');
  return { path, text, hash: hash(text) };
}

export function fileTree(root: string) {
  canonicalDirectory(root);
  const result: string[] = [];
  let visited = 0;
  const visit = (directory: string, depth = 0) => {
    if (depth > 12) throw new AppError(413, 'Repository preview exceeds depth limit');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (++visited > 5000) throw new AppError(413, 'Repository preview exceeds entry limit');
      if (secret.test(entry.name) || blocked.test(entry.name) || entry.isSymbolicLink()) continue;
      if (result.length >= 1500)
        throw new AppError(413, 'Repository preview exceeds 1500 files; narrow the project');
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, depth + 1);
      else if (entry.isFile()) result.push(relative(root, absolute).split(sep).join('/'));
    }
  };
  visit(root);
  return result.sort();
}

export function replaceText(root: string, path: string, expected: string, text: string) {
  const destination = safeFile(root, path, true);
  if (hash(readFileSync(destination)) !== expected)
    throw new AppError(409, 'File changed; reload and review before saving');
  const temporary = resolve(dirname(destination), `.qa-save-${randomUUID()}`);
  try {
    writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 });
    if (safeFile(root, path, true) !== destination || hash(readFileSync(destination)) !== expected)
      throw new AppError(409, 'File changed during save');
    renameSync(temporary, destination);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
