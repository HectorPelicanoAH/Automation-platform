import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { AppError } from '../domain/model.ts';

// Platform-owned private paths only; verify existing ancestors before creating descendants.
export function privateDirectory(path: string): void {
  if (!isAbsolute(path) || path.includes('\0'))
    throw new AppError(403, 'Invalid private directory');
  let exists = false;
  try {
    lstatSync(path);
    exists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (exists) {
    if (
      lstatSync(path).isSymbolicLink() ||
      realpathSync(path) !== path ||
      !lstatSync(path).isDirectory()
    )
      throw new AppError(403, 'Private directory symlink or alias denied');
    return;
  }
  privateDirectory(dirname(path));
  mkdirSync(path, { mode: 0o700 });
}
