import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import { products, prepare, pair, record, score, run, wilson } from '../src/bench/index.js';
import { packageRoot } from '../src/core/package-root.js';

const dirs: string[] = [];
const fixtureVotes = join(packageRoot(), 'tests/fixtures/launchbench-votes.json');
async function temp() { const dir = await mkdtemp(join(tmpdir(), 'liftoff-bench-test-')); dirs.push(dir); return dir; }
async function drafts(cwd: string, run = 'fixture-run') {
  const prepared = await prepare(cwd, { run, product: 'vite' });
  const dir = join(prepared.path, 'vite');
  await writeFile(join(dir, 'plain.md'), '## show-hn\nSYNTHETIC FIXTURE plain HN\n## x\nSYNTHETIC FIXTURE plain X\n');
  await writeFile(join(dir, 'liftoff.md'), '## show-hn\nSYNTHETIC FIXTURE Liftoff HN\n## x\nSYNTHETIC FIXTURE Liftoff X\n');
  return prepared;
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const cli = (cwd: string, ...args: string[]) => JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', join(packageRoot(), 'src/cli.ts'), '--cwd', cwd, 'bench', ...args, '--json'], { encoding: 'utf8' }));

describe('LaunchBench (synthetic fixtures, never benchmark evidence)', () => {
  it('lists 20 real public subjects with no vote/result fields', async () => {
    const catalog = await products();
    expect(catalog).toHaveLength(20);
    expect(new Set(catalog.map(p => p.id)).size).toBe(20);
    for (const product of catalog) {
      expect(Object.keys(product).sort()).toEqual(['category', 'channels', 'id', 'name', 'repo']);
      expect(product.repo).toMatch(/^https:\/\/github.com\/[^/]+\/[^/]+$/);
      expect(product.channels).toEqual(['show-hn', 'x']);
    }
  });

  it('prepares exact plain prompt and agent-only instructions without fabricating posts', async () => {
    const cwd = await temp();
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network'));
    const prepared = await prepare(cwd, { run: 'fixture-run', product: 'vite' });
    const dir = join(prepared.path, 'vite');
    expect(await readFile(join(dir, 'plain-prompt.txt'), 'utf8')).toBe('Write a Show HN post and an X thread for this repo.');
    expect(await readFile(join(dir, 'instructions.md'), 'utf8')).toContain('given ONLY that README');
    expect(await readFile(join(dir, 'instructions.md'), 'utf8')).toContain('normal Liftoff pipeline');
    expect(await readdir(dir)).not.toContain('plain.md');
    const paired = await pair(cwd, { run: prepared.run, product: 'vite' });
    expect(paired.paired).toBe(0); expect(paired.pending).toEqual(['vite']);
    expect(await score(cwd)).toMatchObject({ measured: false, voteCount: 0, winRate: null, wilson95: null, productsCovered: 0 });
    expect(fetch).not.toHaveBeenCalled();
    await expect(prepare(cwd, { product: 'made-up' })).rejects.toThrow('Unknown benchmark product');
    await expect(prepare(cwd, { run: '../escape' })).rejects.toThrow('Invalid benchmark run ID');
    await expect(pair(await temp())).rejects.toThrow('No benchmark run');
  });

  it('scores zero votes successfully through CLI, not as a 0% win rate', async () => {
    expect(cli(await temp(), 'score')).toMatchObject({ ok: true, data: { measured: false, winRate: null, voteCount: 0 } });
  });

  it('pairs reproducibly, records fixture votes and prints a score end to end', async () => {
    const cwd = await temp(), prepared = await drafts(cwd);
    const first = await pair(cwd, { run: prepared.run, seed: 'fixture-seed', product: 'vite' });
    expect(first.paired).toBe(2);
    const keyPath = join(prepared.path, 'private-key.json');
    const key = JSON.parse(await readFile(keyPath, 'utf8'));
    expect(key.seed).toBe('fixture-seed'); expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
    expect(key.pairs.map((p: { a: string }) => p.a)).toEqual(['plain', 'plain']);
    expect(JSON.stringify(first)).not.toContain('fixture-seed');
    const blind = join(prepared.path, 'blind');
    const ballot = JSON.parse(await readFile(join(blind, 'ballot-template.json'), 'utf8'));
    expect(ballot.questions).toEqual(['Which would you click?', 'Which do you trust more?', "What's missing from each?"]);
    const original = await readFile(join(blind, 'vite/x/A.md'), 'utf8');
    expect(original).toContain('FIXTURE plain X');
    await pair(cwd, { run: prepared.run, seed: 'fixture-seed', product: 'vite' });
    expect(await readFile(join(blind, 'vite/x/A.md'), 'utf8')).toBe(original);
    expect(cli(cwd, 'record', '--votes', fixtureVotes, '--run', prepared.run)).toMatchObject({ ok: true, data: { recorded: 4 } });
    const actual = cli(cwd, 'score', '--run', prepared.run);
    expect(actual.ok).toBe(true);
    const votes = JSON.parse(await readFile(fixtureVotes, 'utf8')).votes;
    const expectedWins = votes.filter((v: { pair: string; click: string }) => v.click !== 'tie' && ((v.click === 'A') === (key.pairs.find((p: { id: string }) => p.id === v.pair).a === 'liftoff'))).length;
    expect(actual.data).toMatchObject({ measured: true, voteCount: 4, decisiveVotes: 3, ties: 1, liftoffWins: expectedWins, winRate: expectedWins / 3, productsCovered: 1 });
    expect(actual.data.perChannel['show-hn']).toMatchObject({ voteCount: 2, liftoffWins: 1, winRate: 0.5 });
    expect(actual.data.perChannel.x.voteCount).toBe(2);
    expect(actual.data.winRate).toBeCloseTo(1 / 3);
    expect(actual.data.perChannel.x.winRate).toBe(0);
    expect(actual.data.wilson95.low).toBeLessThan(actual.data.winRate);
    expect(actual.data.wilson95.high).toBeGreaterThan(actual.data.winRate);
    expect((await run(cwd, { run: prepared.run, product: 'vite' })).score.voteCount).toBe(4);
    await expect(record(cwd, fixtureVotes)).rejects.toThrow('Duplicate voter/pair');
    await expect(pair(cwd, { run: prepared.run, seed: 'different' })).rejects.toThrow('different pairing seed');
    await writeFile(join(prepared.path, 'vite/plain.md'), '## show-hn\nChanged fixture\n## x\nChanged fixture');
    await expect(pair(cwd)).rejects.toThrow('Paired drafts changed');
    await writeFile(join(blind, 'vite/x/A.md'), 'Altered fixture');
    await expect(score(cwd)).rejects.toThrow('Blind pair changed');
  });

  it('rejects unfinished, unknown and duplicate fixture ballots without recording any', async () => {
    const cwd = await temp(), prepared = await drafts(cwd); await pair(cwd, { product: 'vite' });
    const fixture = JSON.parse(await readFile(fixtureVotes, 'utf8'));
    const file = join(cwd, 'fixture-invalid.json');
    for (const votes of [[{ ...fixture.votes[0], click: null }], [{ ...fixture.votes[0], pair: 'unknown:x' }], [fixture.votes[0], fixture.votes[0]], [{ ...fixture.votes[0], voterId: '' }]]) {
      await writeFile(file, JSON.stringify({ votes }));
      await expect(record(cwd, file)).rejects.toThrow();
    }
    expect((await score(cwd)).voteCount).toBe(0);
    await writeFile(file, JSON.stringify({ votes: [] }));
    expect((await record(cwd, file)).recorded).toBe(0);
    await writeFile(join(prepared.path, 'vite/plain.md'), 'No channel headings');
    await expect(pair(cwd)).rejects.toThrow('exactly one');
  });

  it('reports tie-only results as not measured and uses the Wilson formula', async () => {
    expect(wilson(0, 0)).toBeNull();
    expect(wilson(5, 10)?.low).toBeCloseTo(0.236593, 5);
    expect(wilson(5, 10)?.high).toBeCloseTo(0.763407, 5);
    const cwd = await temp(); await drafts(cwd); await pair(cwd, { product: 'vite' });
    const file = join(cwd, 'tie-fixture.json');
    await writeFile(file, JSON.stringify({ votes: [{ voterId: 'fixture-tie', pair: 'vite:x', click: 'tie', trust: 'tie', missing: { A: '', B: '' } }] }));
    await record(cwd, file);
    expect(await score(cwd)).toMatchObject({ measured: false, voteCount: 1, winRate: null, wilson95: null });
  });

  it('runs prepare → pending pair → unmeasured score without agent drafts', async () => {
    const result = await run(await temp(), { product: 'vite' });
    expect(result.prepared.products).toEqual(['vite']); expect(result.paired.paired).toBe(0); expect(result.score.measured).toBe(false);
  });
});

it('documents every channel policy with source links, timing, formats and troubleshooting', async () => {
  const root = packageRoot(), files = (await readdir(join(root, 'rules/channels'))).filter(f => f.endsWith('.yaml'));
  const index = await readFile(join(root, 'docs/channels/README.md'), 'utf8');
  for (const file of files) {
    const policy = parse(await readFile(join(root, 'rules/channels', file), 'utf8'));
    const doc = await readFile(join(root, 'docs/channels', policy.id + '.md'), 'utf8');
    expect(index).toContain(`(${policy.id}.md)`);
    for (const text of ['## Troubleshooting', '## Automated vs manual', '## Rules, timing and format', `rules/channels/${file}`, `rules/platforms/${file}`]) expect(doc).toContain(text);
    const platform = parse(await readFile(join(root, 'rules/platforms', file), 'utf8'));
    expect(doc).toContain(String(platform.title.maxLength)); expect(doc).toContain(String(platform.body.maxLength));
    for (const time of policy.bestPostingTimes) expect(doc).toContain(time);
  }
});
