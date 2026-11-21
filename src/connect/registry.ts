import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readOptional } from '../review/posts.js';
import type { Keychain } from './keychain.js';

export type Route = 'postiz' | 'buffer' | 'api' | 'browser';
export interface Connection { platform: string; route: Route; account: string; connectedAt: string; profile?: string }
const social = ['x', 'linkedin', 'instagram', 'facebook', 'tiktok', 'youtube', 'threads', 'bluesky', 'reels', 'shorts'];
export const platforms = [...social, 'devto', 'github-release', 'show-hn', 'reddit', 'product-hunt'];
export function routes(platform: string): Route[] {
  return social.includes(platform) ? ['postiz', 'buffer'] : ['devto', 'github-release'].includes(platform) ? ['api'] : ['show-hn', 'reddit', 'product-hunt'].includes(platform) ? ['browser'] : [];
}
export const connectionHome = () => process.env.LIFTOFF_HOME ?? join(homedir(), '.config', 'liftoff');
export async function connections(home = connectionHome()): Promise<Connection[]> {
  return JSON.parse(await readOptional(join(home, 'connections.json')) ?? '[]');
}
async function save(records: Connection[], home: string) {
  const temporary = join(home, `connections.${process.pid}.tmp`);
  await writeFile(temporary, JSON.stringify(records, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, join(home, 'connections.json'));
}
async function withRegistryLock<T>(home: string, action: () => Promise<T>): Promise<T> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const path = join(home, 'connections.lock');
  for (let attempt = 0; attempt < 100; attempt++) {
    const lock = await open(path, 'wx', 0o600).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    });
    if (lock) {
      try { return await action(); }
      finally { await lock.close(); await unlink(path); }
    }
    await setTimeout(100);
  }
  throw new Error('Connection registry busy; inspect connections.lock before retrying');
}
export async function connect(input: Omit<Connection, 'connectedAt'>, token: string | undefined, keychain: Keychain, home = connectionHome()) {
  if (!routes(input.platform).includes(input.route)) throw new Error(`Unsupported route ${input.route} for ${input.platform}`);
  if (!input.account.trim() || /[\r\n]/.test(input.account)) throw new Error('A connected account handle is required');
  if (input.route === 'browser' && !input.profile) throw new Error('Browser connections require --profile pointing to your Chrome user data directory');
  if (input.route !== 'browser' && !token?.trim()) throw new Error('Token required via --token-env or stdin');
  const record: Connection = { platform: input.platform, route: input.route, account: input.account,
    connectedAt: new Date().toISOString(), ...(input.profile ? { profile: resolve(input.profile) } : {}) };
  await withRegistryLock(home, async () => {
    if (token) await keychain.set(`${input.platform}:${input.account}`, token);
    const records = await connections(home);
    await save([...records.filter(r => r.platform !== input.platform || r.account !== input.account), record], home);
  });
  return record;
}
export async function removeConnection(platform: string, account: string, keychain: Keychain, home = connectionHome()) {
  await withRegistryLock(home, async () => {
    const record = (await connections(home)).find(r => r.platform === platform && r.account === account);
    if (record && record.route !== 'browser') await keychain.delete(`${platform}:${account}`);
    const records = await connections(home);
    await save(records.filter(r => r.platform !== platform || r.account !== account), home);
  });
}
export async function requireConnection(platform: string, account?: string, home = connectionHome()) {
  const found = (await connections(home)).filter(r => r.platform === platform && (!account || r.account === account));
  if (found.length !== 1) throw new Error(`${platform}: connect your own account first with liftoff connect; use --account to disambiguate`);
  return found[0];
}
