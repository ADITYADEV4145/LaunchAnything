import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';
import { loadRule } from '../core/rules.js';
import { loadPlatform } from './platforms.js';

export interface Product {
  name: string; features: {name: string; description: string}[];
  claims: {id: string; text: string; sources?: {type: string; ref: string}[]}[];
}
function plannedChannels(planPath: string) {
  if (!existsSync(planPath)) return undefined;
  const rows = readFileSync(planPath, 'utf8').split(/\r?\n/).map(line => line.split('|').map(cell => cell.trim()))
    .filter(cells => cells[0] === '' && /^\d{4}-\d{2}-\d{2}$/.test(cells[2] ?? ''));
  return rows.length ? rows.map(cells => cells[1]) : undefined;
}
export function context(cwd: string, selected?: string[]) {
  const paths = launchDir(cwd);
  function read(kind: 'config' | 'product') {
    const data = JSON.parse(readFileSync(paths[kind], 'utf8'));
    const result = validateFile(kind, data);
    if (!result.valid) throw new Error(kind + ': ' + result.errors.join('; '));
    return data;
  }
  const config = read('config') as {profile: string; channels: string[]; brandKit?: string};
  const product = read('product') as Product;
  const channels = [...new Set(selected?.length ? selected : plannedChannels(paths.plan) ?? config.channels)];
  channels.forEach(loadPlatform);
  const profile = loadRule('profiles', config.profile);
  const brandPath = config.brandKit ? resolve(cwd, config.brandKit) : undefined;
  const brand = brandPath && existsSync(brandPath) ? readFileSync(brandPath, 'utf8') : '';
  const copywriting = [...new Set([cwd, homedir()])].map(base => join(base, '.claude/skills/copywriting'))
    .filter(path => existsSync(join(path, 'SKILL.md')));
  return { paths, config, product, channels, profile, brand, copywriting };
}
