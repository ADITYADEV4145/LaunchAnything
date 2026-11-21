import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { packageRoot } from '../src/core/package-root.js';
import { launchDir, launchPaths } from '../src/core/launch-dir.js';
import { validateFile } from '../src/core/schema.js';
import { loadRule } from '../src/core/rules.js';
import { output } from '../src/core/output.js';
import { doctor } from '../src/core/doctor.js';
import { selftest } from '../src/selftest/index.js';

const root = packageRoot();
const cli = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', join(root, 'src/cli.ts'), ...args], { encoding: 'utf8' });

describe('core contracts', () => {
  it('resolves package root and every launch path', () => {
    expect(root).toBe(process.cwd());
    const paths = launchDir('/example');
    expect(paths.root).toBe('/example/.launch');
    for (const key of Object.keys(launchPaths) as (keyof typeof launchPaths)[])
      expect(paths[key]).toBe(join(paths.root, launchPaths[key]));
  });
  it('prints one success or failure object', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    output('test', {}, true);
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({ ok: true, command: 'test', data: {} });
    output('test', undefined, true, 'failure', 2);
    expect(JSON.parse(log.mock.calls[1][0])).toEqual({ ok: false, command: 'test', error: 'failure' });
    expect(process.exitCode).toBe(2);
    process.exitCode = 0;
    log.mockRestore();
  });
  it('rejects unknown schemas, empty products and missing sources', () => {
    expect(validateFile('unknown', {}).valid).toBe(false);
    expect(validateFile('product', {}).errors.length).toBeGreaterThan(0);
    const product = JSON.parse(readFileSync(join(root, 'fixtures/cli-tool/.liftoff-fixture/product.json'), 'utf8'));
    product.features[0].sources = [];
    expect(validateFile('product', product).valid).toBe(false);
    product.oneLiner = 'x'.repeat(81);
    expect(validateFile('product', product).valid).toBe(false);
  });
  it('loads rule YAML and rejects unsafe or absent IDs', () => {
    expect(loadRule('profiles', 'devtool').id).toBe('devtool');
    expect(() => loadRule('profiles', '../config')).toThrow('Invalid rule id');
    expect(() => loadRule('profiles', 'missing')).toThrow();
  });
});

for (const fixture of ['cli-tool', 'saas-next', 'mobile-expo']) {
  it(`validates ${fixture} and real feature sources`, () => {
    const dir = join(root, 'fixtures', fixture);
    const product = JSON.parse(readFileSync(join(dir, '.liftoff-fixture/product.json'), 'utf8'));
    expect(validateFile('product', product)).toEqual({ valid: true, errors: [] });
    for (const feature of product.features) for (const source of feature.sources)
      expect(existsSync(join(dir, source.ref))).toBe(true);
  });
}
it('validates every rules YAML', () => {
  for (const group of ['profiles', 'channels'] as const)
    for (const file of readdirSync(join(root, 'rules', group)).filter(f => f.endsWith('.yaml')))
      expect(loadRule(group, file.replace('.yaml', '')).id).toBe(file.replace('.yaml', ''));
});
it('all command stubs exit 2 with JSON', () => {
  const groups = [[], ['write','check'], [], ['video'], [], ['results','learn','receipt']];
  groups.forEach((names, i) => names.forEach(name => {
    const run = cli(name, '--json');
    expect(run.status, run.stderr).toBe(2);
    expect(JSON.parse(run.stdout)).toEqual({ ok: false, command: name, error: `not implemented yet (phase ${i + 1})` });
  }));
}, 30000);
it('doctor handles missing extras and malformed config without leaking values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'liftoff-doctor-'));
  try {
    expect((await doctor(dir, dir)).skills.every(s => s.names.length === 0)).toBe(true);
    await mkdir(join(dir, '.agents/skills/example'), { recursive: true });
    await writeFile(join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { example: { token: 'do-not-print' } } }));
    const report = await doctor(dir, dir);
    expect(report.skills.some(s => s.names.includes('example'))).toBe(true);
    expect(report.mcpServers[0].names).toEqual(['example']);
    expect(JSON.stringify(report)).not.toContain('do-not-print');
    await writeFile(join(dir, '.mcp.json'), '{');
    expect((await doctor(dir, dir)).warnings).toHaveLength(1);
  } finally { await rm(dir, { recursive: true, force: true }); }
  const run = cli('doctor', '--json');
  expect(run.status).toBe(0);
  expect(JSON.parse(run.stdout).ok).toBe(true);
});
it('selftest phase 1 passes and later phases fail explicitly', async () => {
  const report = await selftest(1);
  expect(report.results).toHaveLength(6);
  expect(report.results.every(r => r.ok)).toBe(true);
  expect((await selftest(2)).results.filter(r => !r.ok)).toHaveLength(3);
  await expect(selftest(0)).rejects.toThrow('--through');
  const run = cli('selftest', '--through', '1', '--json');
  expect(run.status, run.stderr).toBe(0);
  expect(JSON.parse(run.stdout).ok).toBe(true);
  expect(cli('selftest', '--through', 'oops', '--json').status).not.toBe(0);
});
