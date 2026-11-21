import { randomUUID } from 'node:crypto';
import { open, stat, unlink } from 'node:fs/promises';
import { mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const lockTimeout = 15 * 60 * 1000;
export const recoveryTimeout = 30000;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

function staleRecord(source: string, modified: number, timeout: number) {
  let record: { pid?: number; timestamp?: number } = {};
  try { record = JSON.parse(source) ?? {}; } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  if (Number.isInteger(record.pid) && record.pid! > 0) {
    try { process.kill(record.pid!, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true; }
  }
  return Date.now() - (Number.isFinite(record.timestamp) ? record.timestamp! : modified) > timeout;
}

function removeGuard(path: string, owner: string) {
  // Unique markers keep a late guard reaper from deleting a replacement owner.
  try { unlinkSync(join(path, owner)); } catch (error) { if (!missing(error)) throw error; }
  try { rmdirSync(path); } catch (error) {
    if (!missing(error) && (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY' && (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

function recoveryGuard(path: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(path, { mode: 0o700 });
      const owner = randomUUID();
      try {
        writeFileSync(join(path, owner), JSON.stringify({ pid: process.pid, timestamp: Date.now() }), { flag: 'wx', mode: 0o600 });
        const entries = readdirSync(path);
        if (entries.length === 1 && entries[0] === owner) return () => removeGuard(path, owner);
      } catch (error) { if (!missing(error)) throw error; }
      removeGuard(path, owner);
      return;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    try {
      const entries = readdirSync(path);
      if (!entries.length) {
        if (Date.now() - statSync(path).mtimeMs > recoveryTimeout) rmdirSync(path);
      } else for (const entry of entries) {
        const marker = join(path, entry);
        if (staleRecord(readFileSync(marker, 'utf8'), statSync(marker).mtimeMs, recoveryTimeout)) removeGuard(path, entry);
      }
    } catch (error) {
      if (!missing(error) && (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error;
    }
  }
}

async function recoverLock(path: string, beforeRecovery?: () => Promise<void>) {
  const file = await open(path, 'r').catch(error => { if (!missing(error)) throw error; });
  if (!file) return;
  let source: string;
  try {
    source = await file.readFile('utf8');
    if (!staleRecord(source, (await file.stat()).mtimeMs, lockTimeout)) return;
  } finally { await file.close(); }
  await beforeRecovery?.();
  const release = recoveryGuard(path + '.recover');
  if (!release) return;
  try {
    const current = readFileSync(path, 'utf8');
    if (current === source && staleRecord(current, statSync(path).mtimeMs, lockTimeout)) unlinkSync(path);
  } catch (error) { if (!missing(error)) throw error; }
  finally { release(); }
}

async function removeLock(path: string, owner: string) {
  const file = await open(path, 'r').catch(error => { if (!missing(error)) throw error; });
  if (!file) return;
  try {
    const original = await file.stat();
    let record: { pid?: number; timestamp?: number; owner?: string } = {};
    try { record = JSON.parse(await file.readFile('utf8')) ?? {}; } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    if (record.owner !== owner) return;
    const current = await stat(path).catch(error => { if (!missing(error)) throw error; });
    if (current && current.ino === original.ino && current.dev === original.dev)
      await unlink(path).catch(error => { if (!missing(error)) throw error; });
  } finally { await file.close(); }
}

export async function tryLock(path: string, beforeRecovery?: () => Promise<void>): Promise<(() => Promise<void>) | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const file = await open(path, 'wx', 0o600).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    });
    if (file) {
      const owner = randomUUID();
      try { await file.writeFile(JSON.stringify({ pid: process.pid, timestamp: Date.now(), owner })); }
      catch (error) {
        await file.close();
        await unlink(path);
        throw error;
      }
      await file.close();
      return () => removeLock(path, owner);
    }
    if (attempt === 0) await recoverLock(path, beforeRecovery);
  }
}
