import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { validateFile } from '../core/schema.js';

export const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

export async function readJson(path: string, optional = false): Promise<unknown> {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (optional && missing(error)) return undefined;
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${path}`);
    throw error;
  }
}

export function checked<T>(schema: string, value: unknown): T {
  const result = validateFile(schema, value);
  if (!result.valid) throw new Error(`Invalid ${schema}: ${result.errors.join('; ')}`);
  return value as T;
}

export async function writeLocal(path: string, contents: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, contents, { flag: 'wx', mode: 0o600 });
    await rename(temp, path);
  } finally { await rm(temp, { force: true }); }
}

export function writeJson(path: string, value: unknown) {
  return writeLocal(path, JSON.stringify(value, null, 2) + '\n');
}

export async function withWriteLock<T>(path: string, action: () => Promise<T>) {
  const lockPath = `${path}.lock`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error(`Another write is in progress: ${lockPath}. Retry after it finishes.`);
    throw error;
  }
  try { return await action(); }
  finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
