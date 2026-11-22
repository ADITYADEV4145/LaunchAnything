import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approve, prepare, review } from '../src/audience/index.js';
import { importSignups } from '../src/audience/waitlist.js';
import { packageRoot } from '../src/core/package-root.js';
import { researchPaths } from '../src/research/index.js';
import { checks as phase0 } from '../src/selftest/phase0.js';

const root = packageRoot();
let cwd: string;
beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), 'liftoff-audience-'));
  await phase0[0]!.run({ cwd, fixture: 'cli-tool' });
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

const edit = (file: string, changes: object) => writeFileSync(file, JSON.stringify({
  ...JSON.parse(readFileSync(file, 'utf8')), ...changes,
}));

describe('phase 0b', () => {
  it('derives communities from the pain sources and never mistakes reviews for outreach targets', async () => {
    const paths = researchPaths(cwd);
    const pains = JSON.parse(readFileSync(paths.pains, 'utf8'));
    const urls = ['https://www.reddit.com/r/DevTools/comments/123/topic/',
      'https://github.com/org/project/discussions/1', 'https://apps.apple.com/us/app/example/id123'];
    const items = pains.pains[0].quotes.map((quote: { text: string; url: string }, i: number) => {
      quote.url = urls[i]!;
      return { url: quote.url, text: quote.text, source: 'fixture', author_handle: '' };
    });
    writeFileSync(paths.pains, JSON.stringify(pains));
    writeFileSync(join(paths.raw, 'extra.json'), JSON.stringify({ items }));
    const result = await prepare(cwd);
    const map = JSON.parse(readFileSync(result.map, 'utf8'));
    expect(map.communities).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://www.reddit.com/r/devtools/', evidence: [{ pain: pains.pains[0].name, url: urls[0] }] }),
      expect.objectContaining({ url: 'https://github.com/org/project' }),
      expect.objectContaining({ url: 'https://news.ycombinator.com/' }),
    ]));
    expect(map.researchOnly).toContainEqual({ pain: pains.pains[0].name, url: urls[2] });
    expect(map.communities).toHaveLength(3);
    expect((await review(cwd)).filter(draft => draft.kind === 'outreach').every(draft => draft.blocked)).toBe(true);
  });

  it('requires rules review and explicit approval of the exact draft', async () => {
    const prepared = await prepare(cwd);
    const outreach = (await review(cwd)).find(draft => draft.kind === 'outreach')!;
    await expect(approve(cwd, outreach.id, outreach.sha256, 'Reviewer')).rejects.toThrow('moderator permission');
    const path = prepared.drafts.find(draft => draft.id === outreach.id)!.path;
    edit(path, { permission: { rulesUrl: 'https://example.test/rules', note: 'Moderator allowed this discussion.' } });
    await expect(approve(cwd, outreach.id, outreach.sha256, 'Reviewer')).rejects.toThrow('no longer matches');
    const current = (await review(cwd)).find(draft => draft.id === outreach.id)!;
    expect(await approve(cwd, current.id, current.sha256, 'Reviewer')).toMatchObject({ sent: false });
    expect((await review(cwd)).find(draft => draft.id === outreach.id)?.approved).toBe(true);
    edit(path, { body: 'I changed the discussion question. What works for you today?' });
    expect((await review(cwd)).find(draft => draft.id === outreach.id)?.approved).toBe(false);
  });

  it.each(['Please up‑vote us', 'Let’s message all members', 'Please copy-paste this everywhere'])(
    'blocks unsafe draft text: %s', async body => {
      const prepared = await prepare(cwd);
      edit(prepared.drafts[0]!.path, { body });
      await expect(review(cwd)).rejects.toThrow(/not allowed/);
    },
  );

  it('scaffolds a non-submitting local Kit preview and rejects non-consented imports', async () => {
    const result = await prepare(cwd);
    edit(result.waitlist.setup, { headline: '<script>alert(1)</script>' });
    await prepare(cwd);
    const preview = readFileSync(result.waitlist.preview, 'utf8');
    expect(preview).toContain('&lt;script&gt;');
    expect(preview).not.toMatch(/<script|<form/);
    const input = join(cwd, '.launch', 'bad-signups.json');
    writeFileSync(input, JSON.stringify([{ email: 'reader@example.test', consent: false, consentedAt: '2026-01-01T00:00:00Z' }]));
    expect(() => importSignups(cwd, input)).toThrow('audience-signups');
  });

  it('exposes the workflow through the CLI using standard JSON and cwd flags', () => {
    const launch = join(cwd, '.launch');
    mkdirSync(launch, { recursive: true });
    const run = spawnSync(process.execPath, ['--import', 'tsx', join(root, 'src/cli.ts'),
      'audience', 'prepare', '--cwd', cwd, '--json'], { encoding: 'utf8' });
    expect(run.status, run.stderr + run.stdout).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: true, command: 'audience', data: { waitlist: { live: false } } });
  });
});
