import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { packageRoot } from '../core/package-root.js';
import { validateFile } from '../core/schema.js';
import type { AdapterName } from './index.js';

export interface Metadata {
  id: AdapterName; name: string; priority: number;
  channels: string[]; envKeys: string[]; mcpAliases: string[];
  connectionRoute?: 'postiz' | 'buffer' | 'api'; connectionChannels?: string[]; requestUrl?: string;
}

export function loadAdapterMetadata(directory = join(packageRoot(), 'rules/adapters')): Metadata[] {
  return readdirSync(directory).filter(file => file.endsWith('.yaml')).map(file => {
    const path = join(directory, file);
    let data: unknown;
    try { data = parse(readFileSync(path, 'utf8')); }
    catch (error) { throw new Error(path + ': ' + (error as Error).message); }
    const result = validateFile('adapter', data);
    if (!result.valid) throw new Error(path + ': ' + result.errors.join('; '));
    return data as Metadata;
  }).sort((a, b) => a.priority - b.priority);
}

export const adapterMetadata = loadAdapterMetadata();
