import { mkdir, writeFile } from 'node:fs/promises';
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
  await mkdir(home, { recursive: true, mode: 0o700 });
  await writeFile(join(home, 'connections.json'), JSON.stringify(records, null, 2) + '\n', { mode: 0o600 });
}
export async function connect(input: Omit<Connection, 'connectedAt'>, token: string | undefined, keychain: Keychain, home = connectionHome()) {
  if (!routes(input.platform).includes(input.route)) throw new Error(`Unsupported route ${input.route} for ${input.platform}`);
  if (!input.account.trim() || /[\r\n]/.test(input.account)) throw new Error('A connected account handle is required');
  if (input.route === 'browser' && !input.profile) throw new Error('Browser connections require --profile pointing to your Chrome user data directory');
  if (input.route !== 'browser' && !token?.trim()) throw new Error('Token required via --token-env or stdin');
  const records = await connections(home);
  if (token) await keychain.set(`${input.platform}:${input.account}`, token);
  const record: Connection = { platform: input.platform, route: input.route, account: input.account,
    connectedAt: new Date().toISOString(), ...(input.profile ? { profile: resolve(input.profile) } : {}) };
  await save([...records.filter(r => r.platform !== input.platform || r.account !== input.account), record], home);
  return record;
}
export async function removeConnection(platform: string, account: string, keychain: Keychain, home = connectionHome()) {
  const records = await connections(home);
  const record = records.find(r => r.platform === platform && r.account === account);
  if (record && record.route !== 'browser') await keychain.delete(`${platform}:${account}`);
  await save(records.filter(r => r !== record), home);
}
export async function requireConnection(platform: string, account?: string, home = connectionHome()) {
  const found = (await connections(home)).filter(r => r.platform === platform && (!account || r.account === account));
  if (found.length !== 1) throw new Error(`${platform}: connect your own account first with liftoff connect; use --account to disambiguate`);
  return found[0];
}
