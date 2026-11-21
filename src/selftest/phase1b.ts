import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { brief, validateBrief } from '../brief/index.js';
import type { Check } from './types.js';
export const checks: Check[] = [{ name: 'brief grounding, printable export, stale detection and negative validation', run({ cwd }) {
  const root = join(cwd, '.launch');
  mkdirSync(join(root, 'research'), { recursive: true });
  copyFileSync(join(cwd, '.liftoff-fixture/phase1b-pains.json'), join(root, 'research/pains.json'));
  const result = brief(cwd);
  if (!validateBrief(cwd).valid || !existsSync(result.html)) throw new Error('Brief or HTML missing or invalid');
  const productPath = join(root, 'product.json');
  const originalProduct = readFileSync(productPath, 'utf8');
  const originalBrief = readFileSync(result.path, 'utf8');
  try {
    const product = JSON.parse(originalProduct);
    product.features[0].description += ' Updated.';
    writeFileSync(productPath, JSON.stringify(product));
    if (!validateBrief(cwd).warnings.some(w => w.includes('stale-brief')) || !brief(cwd).warnings.some(w => w.includes('stale-brief'))) throw new Error('Missing stale warning');
    writeFileSync(productPath, originalProduct);
    writeFileSync(result.path, originalBrief.replace('## Positioning statement', '## Positioning statement\n' + 'word '.repeat(151)));
    if (validateBrief(cwd).valid) throw new Error('Over-limit section accepted');
    writeFileSync(result.path, originalBrief.replace('No verified competitor claims available.', 'Competitor has no useful features.'));
    if (validateBrief(cwd).valid) throw new Error('Uncited competitor claim accepted');
  } finally {
    writeFileSync(productPath, originalProduct);
    writeFileSync(result.path, originalBrief);
  }
} }];
