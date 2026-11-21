import { randomUUID } from 'node:crypto';
import { open, stat, unlink } from 'node:fs/promises';

export const lockTimeout = 15 * 60 * 1000;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

async function removeLock(path: string, stale: boolean, owner?: string) {
  const file = await open(path, 'r').catch(error => { if (!missing(error)) throw error; });
  if (!file) return;
  try {
    const original = await file.stat();
    let record: { pid?: number; timestamp?: number; owner?: string } = {};
    try { record = JSON.parse(await file.readFile('utf8')) ?? {}; } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    if (stale) {
      let dead = false;
      if (Number.isInteger(record.pid) && record.pid! > 0) {
        try { process.kill(record.pid!, 0); }
        catch (error) { dead = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
      }
      const timestamp = Number.isFinite(record.timestamp) ? record.timestamp! : original.mtimeMs;
      if (!dead && Date.now() - timestamp <= lockTimeout) return;
    } else if (record.owner !== owner) return;
    const current = await stat(path).catch(error => { if (!missing(error)) throw error; });
    if (current && current.ino === original.ino && current.dev === original.dev)
      await unlink(path).catch(error => { if (!missing(error)) throw error; });
  } finally { await file.close(); }
}

export async function tryLock(path: string): Promise<(() => Promise<void>) | undefined> {
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
      return () => removeLock(path, false, owner);
    }
    if (attempt === 0) await removeLock(path, true);
  }
}
