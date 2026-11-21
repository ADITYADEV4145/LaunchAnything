import { expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { packageRoot } from '../src/core/package-root.js';
import { selftest } from '../src/selftest/index.js';

const cli = (...args: string[]) => spawnSync(process.execPath,
  ['--import', 'tsx', join(packageRoot(), 'src/cli.ts'), ...args], { encoding: 'utf8' });

it.each([
  ['selftest', '--through', '--json'],
  ['selftest', '--unknown', '--json'],
  ['--json', 'selftest', '--through'],
])('returns one JSON envelope for subcommand usage errors: %j', (...args) => {
  const run = cli(...args);
  expect(run.status).not.toBe(0);
  expect(JSON.parse(run.stdout)).toMatchObject({ ok: false, command: 'selftest' });
  expect(JSON.parse(run.stdout).error).toMatch(/argument missing|unknown option/);
  expect(run.stderr).toBe('');
});

it('doctor fails with one JSON error for a nonexistent working directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'liftoff-review-'));
  try {
    const run = cli('doctor', '--cwd', join(dir, 'absent'), '--json');
    expect(run.status).not.toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: false, command: 'doctor' });
    expect(JSON.parse(run.stdout).error).toContain('ENOENT');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('isolates fixture Git setup from caller Git environment, index, hooks and signing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'liftoff-caller-'));
  try {
    execFileSync('git', ['init', '--initial-branch=main', dir], { stdio: 'pipe' });
    await writeFile(join(dir, 'keep.txt'), 'caller content');
    execFileSync('git', ['-C', dir, 'add', 'keep.txt']);
    const index = await readFile(join(dir, '.git/index'));
    const head = await readFile(join(dir, '.git/HEAD'), 'utf8');
    const gitDirEntries = (await readdir(join(dir, '.git'))).sort();
    vi.stubEnv('GIT_DIR', join(dir, '.git'));
    vi.stubEnv('GIT_WORK_TREE', dir);
    vi.stubEnv('GIT_INDEX_FILE', join(dir, 'unexpected-index'));
    vi.stubEnv('GIT_CONFIG_COUNT', '1');
    vi.stubEnv('GIT_CONFIG_KEY_0', 'commit.gpgsign');
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'true');
    const result = await selftest(1);
    expect(result.results.every(check => check.ok), JSON.stringify(result)).toBe(true);
    expect(await readFile(join(dir, '.git/index'))).toEqual(index);
    expect(await readFile(join(dir, '.git/HEAD'), 'utf8')).toBe(head);
    expect((await readdir(join(dir, '.git'))).sort()).toEqual(gitDirEntries);
    expect((await readdir(dir)).sort()).toEqual(['.git', 'keep.txt']);
    expect(await readFile(join(dir, 'keep.txt'), 'utf8')).toBe('caller content');
  } finally {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  }
});
