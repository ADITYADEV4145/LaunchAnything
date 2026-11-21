import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { packageRoot } from './package-root.js';
import { validateFile } from './schema.js';

export function loadRule(group: 'profiles' | 'channels', id: string): Record<string, unknown> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid rule id');
  const rule: unknown = parse(readFileSync(join(packageRoot(), 'rules', group, `${id}.yaml`), 'utf8'));
  const result = validateFile('rules', rule);
  if (!result.valid) throw new Error(result.errors.join('; '));
  return rule as Record<string, unknown>;
}
