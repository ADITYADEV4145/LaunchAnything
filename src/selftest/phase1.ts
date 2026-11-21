import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { validateFile } from '../core/schema.js';
import type { Check } from './types.js';
export const checks: Check[] = [
  { name: 'fixture loads', async run({ cwd }) { await access(join(cwd, 'README.md')); } },
  { name: 'fixture product validates', async run({ cwd }) {
    const product = JSON.parse(await readFile(join(cwd, '.liftoff-fixture/product.json'), 'utf8'));
    const result = validateFile('product', product);
    if (!result.valid) throw new Error(result.errors.join('; '));
  } },
];
