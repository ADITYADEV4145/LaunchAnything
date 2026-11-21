import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readOptional } from '../review/posts.js';
import { tryLock } from './lock.js';

interface Entry { platform: string; day: string; account: string }
export const dailyCaps: Record<string, number> = { 'show-hn': 1, reddit: 1, 'product-hunt': 1, x: 5 };
export async function reserveCap(root: string, platform: string, account: string, now = new Date()) {
  const lockPath = join(root, 'publish-caps.lock');
  const release = await tryLock(lockPath);
  if (!release) throw new Error('Another assisted publish is running; inspect publish-caps.lock before retrying');
  try {
    const path = join(root, 'publish-caps.json');
    const ledger: Entry[] = JSON.parse(await readOptional(path) ?? '[]');
    const day = now.toISOString().slice(0, 10);
    if (ledger.filter(e => e.platform === platform && e.day === day).length >= (dailyCaps[platform] ?? 2))
      throw new Error(`${platform}: daily cap reached${platform === 'reddit' ? '; never more than one subreddit per day' : ''}`);
    ledger.push({ platform, day, account });
    await writeFile(path, JSON.stringify(ledger, null, 2) + '\n');
  } finally { await release(); }
}
