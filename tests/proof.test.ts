import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runProof } from '../src/proof/run.js';
import { jsonPointer } from '../src/proof/pointer.js';
import { validateProduct } from '../src/product/validate.js';
import { writeBriefs } from '../src/copy/write.js';
import { brief } from '../src/brief/index.js';
import { packageRoot } from '../src/core/package-root.js';

let cwd: string;
const metric = { metric: 'Checks', pointer: '/count', unit: 'checks', context: 'Fixture benchmark' };
const benchmark = { name: 'checks', command: 'node benchmark.cjs', results: 'results.json', metrics: [metric] };
function config(benchmarks: unknown[] = [benchmark]) {
  writeFileSync(join(cwd, '.launch/config.json'), JSON.stringify({
    profile: 'devtool', launchType: 'new-product', channels: ['x'], timezone: 'UTC',
    launchDate: '2026-02-10', profileConfirmed: true, proof: { benchmarks },
  }));
}
const product = () => JSON.parse(readFileSync(join(cwd, '.launch/product.json'), 'utf8'));
const cli = (...args: string[]) => spawnSync(process.execPath,
  ['--import', 'tsx', join(packageRoot(), 'src/cli.ts'), '--cwd', cwd, '--json', ...args], { encoding: 'utf8' });
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'liftoff-proof-'));
  cpSync(join(packageRoot(), 'fixtures/cli-tool'), cwd, { recursive: true });
  mkdirSync(join(cwd, '.launch'), { recursive: true });
  cpSync(join(cwd, '.liftoff-fixture/product.json'), join(cwd, '.launch/product.json'));
  writeFileSync(join(cwd, 'benchmark.cjs'), "require('node:fs').writeFileSync('results.json', JSON.stringify({count: 7}));");
  config();
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('proof run', () => {
  it('runs a benchmark, hashes raw results and emits usable product proof', async () => {
    const result = await runProof(cwd);
    expect(result.lines).toEqual(['Checks: 7 checks — Fixture benchmark']);
    const record = JSON.parse(readFileSync(join(cwd, '.launch/proof/checks.json'), 'utf8'));
    expect(record).toMatchObject({ benchmark: 'checks', mode: 'ran', exitCode: 0, results: { count: 7 } });
    expect(record.sha256).toBe(createHash('sha256').update(readFileSync(join(cwd, 'results.json'))).digest('hex'));
    const p = product();
    p.proof = record.metrics;
    expect(validateProduct(cwd, p).valid).toBe(true);
    const run = cli('proof', 'run');
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: true, data: { records: [{ mode: 'ran' }] } });
  });
  it('records existing results for --skip-run and commandless benchmarks', async () => {
    config([{ ...benchmark, command: 'exit 42' }]);
    writeFileSync(join(cwd, 'results.json'), '{"count":3}');
    expect((await runProof(cwd, { skipRun: true })).records[0].mode).toBe('recorded');
    const run = cli('proof', 'run', '--skip-run');
    expect(run.status).toBe(0);
    config([{ ...benchmark, command: undefined }]);
    expect((await runProof(cwd)).records[0].mode).toBe('recorded');
  });
  it('substitutes two repos in the command and result path with distinct provenance', async () => {
    writeFileSync(join(cwd, 'benchmark.cjs'), "require('node:fs').writeFileSync(process.argv[2]+'.json',JSON.stringify({count:process.argv[2]}));");
    config([{ ...benchmark, command: 'node benchmark.cjs {repo}', results: '{repo}.json', repos: ['one', 'two'] }]);
    const result = await runProof(cwd);
    expect(result.records.map(r => [r.repo, r.metrics[0].value, r.metrics[0].source_file])).toEqual([
      ['one', 'one', '.launch/proof/checks-1.json'], ['two', 'two', '.launch/proof/checks-2.json'],
    ]);
  });
  it('rejects command failure even when old results exist, and enforces timeout', async () => {
    writeFileSync(join(cwd, 'results.json'), '{"count":3}');
    config([{ ...benchmark, command: 'exit 23' }]);
    await expect(runProof(cwd)).rejects.toThrow('exit 23');
    expect(existsSync(join(cwd, '.launch/proof/checks.json'))).toBe(false);
    config([{ ...benchmark, command: 'node -e "setTimeout(()=>{},10000)"' }]);
    await expect(runProof(cwd, { timeout: 0.05 })).rejects.toThrow('timed out');
  });
  it('rejects absent/invalid results, unresolved pointers and non-scalar metrics', async () => {
    config([{ ...benchmark, command: undefined }]);
    await expect(runProof(cwd)).rejects.toThrow('missing or invalid JSON');
    for (const text of ['not JSON', '{}', '{"count":{}}']) {
      writeFileSync(join(cwd, 'results.json'), text);
      await expect(runProof(cwd)).rejects.toThrow();
    }
  });
  it('writes a founder plan derived from features and profile then exits non-zero', () => {
    config([]);
    const run = cli('proof', 'run');
    expect(run.status).not.toBe(0);
    expect(JSON.parse(run.stdout).error).toContain('No benchmark is configured');
    const plan = readFileSync(join(cwd, '.launch/proof/plan.md'), 'utf8');
    for (const text of ['devtool', product().features[0].name, 'baseline', 'with-product', '1–3', 'time_saved', 'benchmarks']) expect(plan).toContain(text);
  });
  it('rejects unsafe output names and result paths', async () => {
    config([{ ...benchmark, name: '../escape' }]);
    await expect(runProof(cwd)).rejects.toThrow();
    config([{ ...benchmark, results: '../escape.json', command: undefined }]);
    await expect(runProof(cwd)).rejects.toThrow('outside repository');
  });
});

describe('product proof and research validation', () => {
  it('accepts fixture proof and warns for empty pain research', () => {
    expect(validateProduct(cwd, product())).toEqual({ valid: true, errors: [], warnings: ['/problem/pains is empty; run liftoff research'] });
  });
  it.each(['empty', 'money', 'source', 'missing', 'mismatch', 'pointer', 'not-json', 'invalid-json', 'escape', 'symlink'])('rejects %s proof/input', kind => {
    const p = product();
    if (kind === 'empty') p.proof = [];
    if (kind === 'money') delete p.money_moment;
    if (kind === 'source') delete p.proof[0].source_file;
    if (kind === 'missing') p.proof[0].source_file = 'missing.json';
    if (kind === 'mismatch') p.proof[0].value = '1';
    if (kind === 'pointer') p.proof[0].source_pointer = '/missing';
    if (kind === 'not-json') p.proof[0].source_file = 'README.md';
    if (kind === 'invalid-json') { writeFileSync(join(cwd, 'invalid.json'), 'not JSON'); p.proof[0].source_file = 'invalid.json'; }
    if (kind === 'escape') p.proof[0].source_file = '../outside.json';
    if (kind === 'symlink') { symlinkSync('/etc/hosts', join(cwd, 'escape.json')); p.proof[0].source_file = 'escape.json'; }
    expect(validateProduct(cwd, p).valid).toBe(false);
  });
  it('rejects hand-written JSON even with a matching value', () => {
    const p = product();
    writeFileSync(join(cwd, 'hand-written.json'), '{"checks":1}');
    p.proof[0].source_file = 'hand-written.json';
    p.proof[0].source_pointer = '/checks';
    expect(validateProduct(cwd, p).errors.join('; ')).toContain('proof must come from liftoff proof run output');
    writeFileSync(join(cwd, '.launch/proof/hand-written.json'), '{"results":{"checks":1}}');
    p.proof[0].source_file = '.launch/proof/hand-written.json';
    p.proof[0].source_pointer = '/results/checks';
    expect(validateProduct(cwd, p).errors.join('; ')).toContain('proof must come from liftoff proof run output');
  });
  it('detects results changed since proof run and accepts a fresh recording', async () => {
    const p = product();
    p.proof = (await runProof(cwd)).records[0].metrics;
    expect(validateProduct(cwd, p).valid).toBe(true);
    writeFileSync(join(cwd, 'results.json'), '{"count":99}');
    expect(validateProduct(cwd, p).errors.join('; ')).toContain('benchmark results changed since proof run; rerun liftoff proof run');
    p.proof = (await runProof(cwd, { skipRun: true })).records[0].metrics;
    expect(validateProduct(cwd, p).valid).toBe(true);
    unlinkSync(join(cwd, 'results.json'));
    expect(validateProduct(cwd, p).valid).toBe(true);
  });
  it('rejects pointers outside the results subtree and escaped proof records', () => {
    const p = product();
    p.proof[0].source_pointer = '/exitCode';
    p.proof[0].value = 0;
    expect(validateProduct(cwd, p).errors.join('; ')).toContain('source_pointer must resolve inside proof run results');
    symlinkSync(join(cwd, '.liftoff-fixture/benchmark.json'), join(cwd, '.launch/proof/alias.json'));
    p.proof[0].source_file = '.launch/proof/alias.json';
    p.proof[0].source_pointer = '/results/checks';
    expect(validateProduct(cwd, p).errors.join('; ')).toContain('proof must come from liftoff proof run output');
  });
  it('checks pain indices, names, quote pairs, competitors and communities', () => {
    mkdirSync(join(cwd, '.launch/research'));
    const research = JSON.parse(readFileSync(join(cwd, '.liftoff-fixture/phase1b-pains.json'), 'utf8'));
    writeFileSync(join(cwd, '.launch/research/pains.json'), JSON.stringify(research));
    const p = product(), pain = research.pains[0];
    p.problem.pains = [{ name: pain.name, pain_index: 0, quotes: pain.quotes.slice(0, 2) }];
    p.audience.where = ['r/SideProject'];
    p.competitors = [{ name: research.competitors[0].name, url: 'https://example.test', dislikes: ['unrecorded'] }];
    expect(validateProduct(cwd, p)).toMatchObject({ valid: true, warnings: expect.arrayContaining([expect.stringContaining('communities.md is missing'), expect.stringContaining('not a recorded complaint')]) });
    writeFileSync(join(cwd, '.launch/communities.md'), '# Communities\nr/SideProject');
    p.competitors[0].dislikes = research.competitors[0].complaints;
    expect(validateProduct(cwd, p)).toEqual({ valid: true, errors: [], warnings: [] });
    for (const mutate of [
      (v: typeof p) => { v.problem.pains[0].pain_index = 999; },
      (v: typeof p) => { v.problem.pains[0].name = 'wrong'; },
      (v: typeof p) => { v.problem.pains[0].quotes[0] = { text: 'invented', url: pain.quotes[0].url }; },
      (v: typeof p) => { v.competitors[0].name = 'unknown'; },
      (v: typeof p) => { v.audience.where = ['unknown']; },
    ]) {
      const bad = structuredClone(p); mutate(bad);
      expect(validateProduct(cwd, bad).valid).toBe(false);
    }
  });
  it('write and brief refuse before generating files on invalid product', () => {
    const p = product(); p.proof[0].value = 42;
    writeFileSync(join(cwd, '.launch/product.json'), JSON.stringify(p));
    expect(() => writeBriefs(cwd)).toThrow('does not match');
    expect(() => brief(cwd)).toThrow('does not match');
    expect(cli('write').status).not.toBe(0);
    expect(cli('brief').status).not.toBe(0);
    expect(existsSync(join(cwd, '.launch/posts'))).toBe(false);
    expect(existsSync(join(cwd, '.launch/brief.md'))).toBe(false);
  });
  it('resolves escaped RFC 6901 tokens, arrays, root and rejects malformed pointers', () => {
    const data = { 'a/b': { '~': [9] } };
    expect(jsonPointer(data, '/a~1b/~0/0')).toBe(9);
    expect(jsonPointer(7, '')).toBe(7);
    for (const pointer of ['bad', '/~2', '/a~1b/~0/01', '/a~1b/~0/-', '/__proto__']) expect(() => jsonPointer(data, pointer)).toThrow();
  });
});
