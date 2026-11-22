import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { packageRoot } from './package-root.js';
import { validateFile } from './schema.js';

export interface Site {
  custom?: boolean;
  id: string; name: string; label?: string; goal?: string;
  route: 'manual' | 'integration'; adapters?: string[]; submitUrl?: string;
  channel: Record<string, unknown>; copy: Record<string, unknown>;
  source: 'built-in' | 'project' | 'user'; path: string;
}
const cache = new Map<string, Map<string, Site>>();
const reservedIds = new Set(['fix-list']);
const files = (dir: string) => existsSync(dir) ? readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort().map(f => join(dir, f)) : [];
const read = (path: string) => parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
export function registry(cwd = process.cwd()) {
  const key = resolve(cwd);
  const cached = cache.get(key);
  if (cached) return cached;
  const sites = new Map<string, Site>();
  const metadata = read(join(packageRoot(), 'rules/sites.yaml')) as Record<string, Partial<Site>>;
  for (const path of files(join(packageRoot(), 'rules/channels'))) {
    const channel = read(path);
    const result = validateFile('rules', channel);
    if (!result.valid) throw new Error(path + ': ' + result.errors.join('; '));
    const id = String(channel.id);
    const copy = read(join(packageRoot(), 'rules/platforms', id + '.yaml'));
    sites.set(id, { id, name: String(channel.name), ...metadata[id], route: metadata[id]?.route ?? 'manual', channel, copy, source: 'built-in', path });
  }
  for (const [dir, source] of [
    [join(packageRoot(), 'rules/sites'), 'built-in'],
    [join(key, '.launch/sites'), 'project'],
    [join(process.env.LIFTOFF_HOME ?? join(homedir(), '.config/liftoff'), 'sites'), 'user'],
  ] as const) for (const path of files(dir)) {
    let data: Record<string, unknown>;
    try { data = read(path); } catch (error) { throw new Error(path + ': ' + (error as Error).message); }
    const result = validateFile('site', data);
    if (!result.valid) throw new Error(path + ': ' + result.errors.join('; '));
    const id = String(data.id);
    if (reservedIds.has(id)) throw new Error(path + ': reserved site id ' + id + ' (used for launch diagnostics)');
    if (sites.has(id)) throw new Error('Site collision ' + id + ': ' + sites.get(id)!.path + ' and ' + path);
    const site = data as unknown as Site;
    sites.set(id, { ...site, custom: true, route: site.route ?? 'manual', source, path,
      channel: { ...site.channel, id, name: site.label ?? site.name, kind: 'channel' },
      copy: { ...site.copy, id, name: site.name, kind: 'platform', version: typeof data.version === 'number' ? data.version : 1,
        lastVerified: data.lastVerified, sources: data.sources } });
  }
  cache.set(key, sites);
  return sites;
}
export function site(id: string, cwd?: string) {
  const sites = registry(cwd);
  const value = sites.get(id);
  if (!value) throw new Error('Unknown channel: ' + id + '. Known ids: ' + [...sites.keys()].join(', '));
  return value;
}
