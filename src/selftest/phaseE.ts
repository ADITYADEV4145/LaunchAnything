import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageRoot } from '../core/package-root.js';
import { reportCommunities, checkCommunities } from '../communities/index.js';
import type { Check } from './types.js';
export const checks: Check[] = [{ name: 'community evidence and manual-only distribution gate', async run({ cwd }) {
  const root = join(cwd, '.launch/communities');
  await mkdir(join(root, 'raw/reddit'), { recursive: true });
  const fixtures = JSON.parse(await readFile(join(packageRoot(), 'fixtures/cli-tool/.liftoff-fixture/communities-evidence.json'), 'utf8'));
  for (const e of fixtures) await writeFile(join(root, 'raw/reddit', e.subreddit + '.json'), JSON.stringify(e));
  await reportCommunities(cwd);
  const gate = await checkCommunities(cwd); if (!gate.valid) throw new Error(gate.errors.join('; '));
} }];
