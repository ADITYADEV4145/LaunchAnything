import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assertSafePath, atomicWrite } from '../copy/safe-path.js';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';

export const audiencePath = (cwd: string, ...parts: string[]) => join(launchDir(cwd).root, 'audience', ...parts);
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
export const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

export function readLocal(cwd: string, path: string) {
  assertSafePath(cwd, path);
  try { return readFileSync(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

export function checked<T>(kind: string, value: unknown): T {
  const verdict = validateFile(kind, value);
  if (!verdict.valid) throw new Error(kind + ': ' + verdict.errors.join('; '));
  return value as T;
}

export function readJson<T>(cwd: string, path: string, kind: string, fallback?: T): T {
  const contents = readLocal(cwd, path);
  if (contents !== undefined) return checked<T>(kind, JSON.parse(contents));
  if (fallback !== undefined) return fallback;
  throw new Error('Missing local file: ' + path);
}

export function writeLocal(cwd: string, path: string, contents: string) {
  assertSafePath(cwd, path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  atomicWrite(cwd, path, contents);
}
