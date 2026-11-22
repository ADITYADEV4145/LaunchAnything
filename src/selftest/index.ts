import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { packageRoot } from '../core/package-root.js';
import type { Phase } from './types.js';
import { checks as phase0 } from './phase0.js';
import { checks as phase0b } from './phase0b.js';
import { checks as phaseE } from './phaseE.js';
import { checks as phase1 } from './phase1.js';
import { checks as phase1b } from './phase1b.js';
import { checks as phase2 } from './phase2.js';
import { checks as phase3 } from './phase3.js';
import { checks as phase4 } from './phase4.js';
import { checks as phase5 } from './phase5.js';
import { checks as phase6 } from './phase6.js';
import { checks as phase2b } from './phase2b.js';
import { checks as launchOps } from './launch-ops.js';
import { checks as phase5b } from './phase5b.js';
import { checks as adoption } from './adoption.js';
import { checks as phaseF } from './phaseF.js';
import { checks as partD } from './part-d.js';
import { checks as phaseB } from './phaseB.js';

export const phases: Phase[] = [{ phase: 0, checks: phase0 }, { phase: '0b', checks: phase0b }, { phase: 1, checks: phase1 }, { phase: '1b', checks: phase1b }, { phase: 2, checks: phase2 }, { phase: '2b', checks: phase2b }, { phase: 3, checks: phase3 }, { phase: 4, checks: phase4 }, { phase: 5, checks: phase5 }, { phase: '5b', checks: phase5b }, { phase: 6, checks: phase6 }, { phase: 7, checks: partD }];
phases.push({ phase: 'I', checks: adoption });
phases.push({ phase: 'F', checks: phaseF });
phases.push({ phase: 'B', checks: phaseB });
phases.splice(2, 0, { phase: 'E', checks: phaseE });
phases.find(phase => phase.phase === 6)!.checks = [{
  name: 'phase 6 results and launch operations',
  async run(context) {
    for (const check of [...phase6, ...launchOps]) await check.run(context);
  },
}];
export async function selftest(through: number | string) {
  const order = phases.map(p => String(p.phase));
  const last = order.indexOf(String(through));
  if (last < 0) throw new Error('--through must be one of ' + order.join(', '));
  const results: { phase: number | string; fixture: string; check: string; ok: boolean; error?: string }[] = [];
  const fixtureRoot = join(packageRoot(), 'fixtures');
  const fixtures = (await readdir(fixtureRoot, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
  if (!fixtures.length) throw new Error('No fixtures found');
  for (const fixture of fixtures) {
    const cwd = await mkdtemp(join(tmpdir(), 'liftoff-'));
    try {
      await cp(join(fixtureRoot, fixture), cwd, { recursive: true });
      const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
      const env = { ...inherited, GIT_AUTHOR_NAME: 'Liftoff Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test',
        GIT_COMMITTER_NAME: 'Liftoff Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test',
        GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };
      const hooks = join(cwd, '.liftoff-fixture', '.empty-hooks');
      await mkdir(hooks, { recursive: true });
      const git = (...args: string[]) => execFileSync('git',
        ['-c', `core.hooksPath=${hooks}`, '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args],
        { cwd, env, stdio: 'pipe' });
      git('init', '--initial-branch=main');
      git('add', '--all');
      git('commit', '-m', 'Fixture baseline');
      git('tag', 'v0.1.0');
      await writeFile(join(cwd, 'CHANGELOG.md'), '# Changes\n\nImprove launch documentation.\n');
      git('add', 'CHANGELOG.md');
      git('commit', '-m', 'Improve launch documentation');
      for (const phase of phases.slice(0, last + 1)) {
        for (const check of phase.checks) {
          try { await check.run({ cwd, fixture }); results.push({ phase: phase.phase, fixture, check: check.name, ok: true }); }
          catch (error) { results.push({ phase: phase.phase, fixture, check: check.name, ok: false, error: (error as Error).message }); }
        }
      }
    } catch (error) {
      results.push({ phase: 1, fixture, check: 'fixture setup', ok: false, error: (error as Error).message });
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }
  return { through, results };
}
