import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { packageRoot } from '../core/package-root.js';
import type { Phase } from './types.js';
import { checks as phase1 } from './phase1.js';
import { checks as phase2 } from './phase2.js';
import { checks as phase3 } from './phase3.js';
import { checks as phase4 } from './phase4.js';
import { checks as phase5 } from './phase5.js';
import { checks as phase6 } from './phase6.js';

export const phases: Phase[] = [{ phase: 1, checks: phase1 }, { phase: 2, checks: phase2 }, { phase: 3, checks: phase3 }, { phase: 4, checks: phase4 }, { phase: 5, checks: phase5 }, { phase: 6, checks: phase6 }];
export async function selftest(through: number) {
  if (!Number.isInteger(through) || through < 1 || through > 6) throw new Error('--through must be an integer from 1 to 6');
  const results: { phase: number; fixture: string; check: string; ok: boolean; error?: string }[] = [];
  const fixtureRoot = join(packageRoot(), 'fixtures');
  const fixtures = (await readdir(fixtureRoot, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
  if (!fixtures.length) throw new Error('No fixtures found');
  for (const fixture of fixtures) {
    const cwd = await mkdtemp(join(tmpdir(), 'liftoff-'));
    try {
      await cp(join(fixtureRoot, fixture), cwd, { recursive: true });
      const env = { ...process.env, GIT_AUTHOR_NAME: 'Liftoff Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test',
        GIT_COMMITTER_NAME: 'Liftoff Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test',
        GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };
      const git = (...args: string[]) => execFileSync('git', args, { cwd, env, stdio: 'pipe' });
      git('init', '--initial-branch=main');
      git('add', '--all');
      git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Fixture baseline');
      git('tag', 'v0.1.0');
      await writeFile(join(cwd, 'CHANGELOG.md'), '# Changes\n\nImprove launch documentation.\n');
      git('add', 'CHANGELOG.md');
      git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Improve launch documentation');
      for (const phase of phases.filter(p => p.phase <= through)) {
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
