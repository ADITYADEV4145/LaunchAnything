import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { packageRoot } from '../src/core/package-root.js';

const cli = (...args: string[]) => spawnSync(process.execPath,
  ['--import', 'tsx', join(packageRoot(), 'src/cli.ts'), ...args], { encoding: 'utf8' });

it('doctor fails with one JSON error for a nonexistent working directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'liftoff-review-'));
  try {
    const run = cli('doctor', '--cwd', join(dir, 'absent'), '--json');
    expect(run.status).not.toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: false, command: 'doctor' });
    expect(JSON.parse(run.stdout).error).toContain('ENOENT');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
