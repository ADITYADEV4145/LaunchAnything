import { mkdir, rename, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readOptional } from '../review/posts.js';
import type { Keychain } from './keychain.js';
import { tryLock } from './lock.js';
import { officialServers } from './mcp.js';

export type Route = 'postiz' | 'buffer' | 'api' | 'browser' | 'mcp';
export interface Connection { platform: string; route: Route; account: string; connectedAt: string; profile?: string; server?: string }
const social = ['x', 'linkedin', 'instagram', 'facebook', 'tiktok', 'youtube', 'threads', 'bluesky', 'reels', 'shorts'];
export const platforms = [...social, 'devto', 'github-release', 'show-hn', 'reddit', 'product-hunt'];
export function routes(platform: string): Route[] {
  if (platform === 'product-hunt') return ['mcp', 'browser'];
  if (platform === 'x') return ['mcp', 'postiz', 'buffer'];
  if (platform === 'linkedin') return ['postiz', 'buffer', 'api'];
  return social.includes(platform) ? ['postiz', 'buffer'] : ['devto', 'github-release'].includes(platform) ? ['api'] : ['show-hn', 'reddit', 'product-hunt'].includes(platform) ? ['browser'] : [];
}
export function validateConnection(input: Pick<Connection, 'platform' | 'route' | 'server' | 'profile'>) {
  if (input.platform === 'linkedin' && (!['postiz', 'buffer', 'api'].includes(input.route) || input.server || input.profile))
    throw new Error('LinkedIn requires the official API directly or through Postiz/Buffer; browser and website-driving MCP servers are forbidden');
  if (!routes(input.platform).includes(input.route)) throw new Error(`Unsupported route ${input.route} for ${input.platform}`);
  if (input.route === 'mcp' && input.server !== undefined && input.server !== officialServers[input.platform as keyof typeof officialServers])
    throw new Error('Only the official platform MCP server is allowed');
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
    const release = await tryLock(path);
    if (release) {
      try { return await action(); }
      finally { await release(); }
    }
    await setTimeout(100);
  }
  throw new Error('Connection registry busy; inspect connections.lock before retrying');
}
export async function connect(input: Omit<Connection, 'connectedAt' | 'route'> & { route?: Route }, token: string | undefined, keychain: Keychain, home = connectionHome()) {
  const route = input.route ?? routes(input.platform)[0];
  validateConnection({ ...input, route });
  if (!input.account.trim() || /[\r\n]/.test(input.account)) throw new Error('A connected account handle is required');
  if (route === 'browser' && !input.profile) throw new Error('Browser connections require --profile pointing to your Chrome user data directory');
  if (route !== 'browser' && !token?.trim()) throw new Error('Token required via --token-env or stdin');
  const record: Connection = { platform: input.platform, route, account: input.account,
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
  validateConnection(found[0]);
  return found[0];
}
