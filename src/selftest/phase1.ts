import { readFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateFile } from '../core/schema.js';
import { launchDir } from '../core/launch-dir.js';
import { init } from '../product/init.js';
import { scan } from '../product/scan.js';
import { validate, validateProduct } from '../product/validate.js';
import { plan } from '../planning/plan.js';
import { git } from '../product/files.js';
import type { Check } from './types.js';
export const checks: Check[] = [
  { name: 'init → scan → validate → plan', async run({ cwd }) {
    const paths = launchDir(cwd);
    const expected = JSON.parse(await readFile(join(cwd, '.liftoff-fixture/expected.json'), 'utf8'));
    const initialized = await init(cwd, { yes: true, date: '2026-02-10', timezone: 'UTC' });
    if (initialized.config.profile !== expected.profile) throw new Error('Detected profile does not match fixture expectation');
    const scanned = await scan(cwd, { github: false });
    const commits = scanned.scan.commits as { sha: string }[];
    if (commits.length !== 1 || commits[0].sha !== git(cwd, ['rev-parse', 'HEAD'])) throw new Error('Scan must include only the commit since v0.1.0');
    await copyFile(join(cwd, '.liftoff-fixture/product.json'), paths.product);
    const validated = await validate(cwd, 'product');
    if (!validated.valid) throw new Error([...validated.errors, ...validated.warnings].join('; '));
    const planned = await plan(cwd, { lessons: [] });
    if (planned.channels.length < 2 || planned.channels.length > 4 || planned.channels.some(c => !expected.allowedChannels.includes(c.id)))
      throw new Error('Plan contains unexpected channels');
  } },
  { name: 'product requires benchmark proof and money moment', async run({ cwd }) {
    const product = JSON.parse(await readFile(launchDir(cwd).product, 'utf8'));
    const mutations = [
      { ...product, proof: [] },
      { ...product, money_moment: undefined },
      { ...product, proof: product.proof.map((proof: Record<string, unknown>) => ({ ...proof, source_file: 'missing-benchmark.json' })) },
      { ...product, proof: product.proof.map((proof: Record<string, unknown>) => ({ ...proof, value: 'not the recorded value' })) },
    ];
    for (const invalid of mutations) {
      if (validateProduct(cwd, invalid).valid) throw new Error('Product accepted absent or invented benchmark proof / money moment');
    }
  } },
  { name: 'output contracts and plan bounds', async run({ cwd }) {
    const paths = launchDir(cwd);
    for (const kind of ['config', 'scan', 'product'] as const) {
      const data = JSON.parse(await readFile(paths[kind], 'utf8'));
      const result = validateFile(kind, data);
      if (!result.valid) throw new Error(kind + ': ' + result.errors.join('; '));
    }
    const expected = JSON.parse(await readFile(join(cwd, '.liftoff-fixture/expected.json'), 'utf8'));
    const markdown = await readFile(paths.plan, 'utf8');
    if (markdown.split('\n').length >= 120) throw new Error('Plan must be under 120 lines');
    const channels = [...markdown.matchAll(/^\| ([a-z][a-z-]+) \| \d{4}-\d{2}-\d{2} \|/gm)].map(match => match[1]);
    if (channels.length < 2 || channels.some(id => !expected.allowedChannels.includes(id))) throw new Error('Written plan contains disallowed channels');
    for (const day of ['T-7', 'T-6', 'T-5', 'T-4', 'T-3', 'T-2', 'T-1', 'T+0', 'T+1', 'T+2', 'T+3'])
      if (!markdown.includes(day + ':')) throw new Error('Missing checklist day ' + day);
  } },
];
