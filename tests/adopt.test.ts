import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { setup } from '../src/adopt/setup.js';
import { importBrand, parseBrand } from '../src/adopt/brand.js';
import { estimate, printEstimate } from '../src/adopt/estimate.js';
import { demo } from '../src/adopt/demo.js';
import { telemetry, recordEvent, sanitizeEvent } from '../src/adopt/telemetry.js';
import { phases } from '../src/selftest/index.js';
import { connect, connections } from '../src/connect/registry.js';
import { MemoryKeychain } from '../src/connect/keychain.js';
import { checkPosts } from '../src/copy/check.js';
import { init } from '../src/product/init.js';

const dirs: string[] = [];
async function temp() { const dir = await mkdtemp(join(tmpdir(), 'liftoff-adopt-test-')); dirs.push(dir); return dir; }
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

describe('adoption', () => {
  it('setup JSON reports all five accounts without fetching or prompting', async () => {
    const cwd = await temp(); vi.stubEnv('LIFTOFF_HOME', cwd);
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network'));
    const result = await setup(cwd, { json: true });
    expect(result.checklist.map(c => c.name)).toEqual(['PH', 'X', 'Kit', 'Postiz', 'GitHub']);
    expect(result.checklist.every(c => !c.connected && c.supported && c.command.startsWith('liftoff connect '))).toBe(true);
    expect(result.tools.map(t => t.name)).toEqual(expect.arrayContaining(['git', 'ffmpeg', 'playwright', 'chrome']));
    expect(fetch).not.toHaveBeenCalled();
    const raw = execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--cwd', cwd, 'setup', '--json'], { encoding: 'utf8', env: { ...process.env, LIFTOFF_HOME: cwd } });
    expect(JSON.parse(raw)).toMatchObject({ ok: true, command: 'setup' });
  }, 30000);

  it('reuses registry and keychain for Kit and connected status', async () => {
    const cwd = await temp(); vi.stubEnv('LIFTOFF_HOME', cwd);
    await connect({ platform: 'kit', account: 'owner', route: 'api' }, 'test-token', new MemoryKeychain());
    expect((await connections())[0].platform).toBe('kit');
    expect((await setup(cwd, { yes: true })).checklist.find(c => c.name === 'Kit')?.connected).toBe(true);
  }, 30000);

  it('imports local HTML and handles empty/missing inputs', async () => {
    const cwd = await temp(), html = join(cwd, 'site.html');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network'));
    await writeFile(html, `<title>Widget &amp; Co</title><meta content="Useful" name="description"><meta property='og:image' content='/og.png'><link href='/icon.svg' rel='icon'><meta name="theme-color" content="#123456"><style>body {font-family: 'Inter', sans-serif}</style>`);
    expect(await importBrand(cwd, { siteFile: html, site: 'https://example.test' })).toMatchObject({ name: 'Widget & Co', description: 'Useful', iconUrl: 'https://example.test/icon.svg', ogImage: 'https://example.test/og.png', colors: ['#123456'], fonts: ['Inter', 'sans-serif'] });
    expect(JSON.parse(await readFile(join(cwd, '.launch/brand.json'), 'utf8')).name).toBe('Widget & Co');
    expect(parseBrand('')).toMatchObject({ name: '', colors: [], fonts: [] });
    await expect(importBrand(cwd, { siteFile: join(cwd, 'missing') })).rejects.toThrow();
    await expect(importBrand(cwd, { site: 'file:///etc/passwd' })).rejects.toThrow('HTTP(S)');
  });

  it('feeds the image/copy brand kit before or after init without losing config', async () => {
    const cwd = await temp(), html = join(cwd, 'site.html');
    await writeFile(html, '<title>Brand</title><meta name="theme-color" content="#123456"><style>body {font-family: Inter}</style>');
    await importBrand(cwd, { siteFile: html });
    const first = await init(cwd, { yes: true, timezone: 'UTC' });
    expect(first.config.brandKit).toBe('.launch/brand-kit.json');
    const kit = JSON.parse(await readFile(join(cwd, first.config.brandKit!), 'utf8'));
    expect(kit).toMatchObject({ name: 'Brand', colors: { accent: '#123456' }, fonts: { heading: 'Inter', body: 'Inter' } });
    await writeFile(html, '<title>Updated</title>');
    await importBrand(cwd, { siteFile: html });
    expect(JSON.parse(await readFile(join(cwd, '.launch/config.json'), 'utf8'))).toEqual(first.config);
    expect(JSON.parse(await readFile(join(cwd, first.config.brandKit!), 'utf8'))).toMatchObject({ name: 'Updated', colors: {}, fonts: {} });
  });

  it.each(['brand.json', 'brand-kit.json', 'config.json', 'directory'])('rejects a symlinked brand output %s without changing external files', async kind => {
    const cwd = await temp(), outside = await temp();
    const html = join(cwd, 'site.html'), external = join(outside, 'brand.json');
    await writeFile(html, '<title>Imported</title>');
    await writeFile(external, 'untouched');
    if (kind === 'directory') await symlink(outside, join(cwd, '.launch'));
    else {
      await mkdir(join(cwd, '.launch'));
      await symlink(external, join(cwd, '.launch', kind));
    }
    await expect(importBrand(cwd, { siteFile: html })).rejects.toThrow('Unsafe symlink');
    expect(await readFile(external, 'utf8')).toBe('untouched');
  });

  it('estimates deterministic tokens, channel costs and scene time', async () => {
    const cwd = await temp();
    expect(estimate(cwd)).toMatchObject({ inputTokens: 0, outputTokens: 0, xApiUsd: 0 });
    await mkdir(join(cwd, '.launch/video'), { recursive: true });
    await writeFile(join(cwd, 'README.md'), 'a'.repeat(400));
    await writeFile(join(cwd, '.launch/plan.md'), '| x | 2026-09-25 |\n| devto | 2026-09-25 |');
    await writeFile(join(cwd, '.launch/video/script.json'), JSON.stringify({ scenes: [{}, {}] }));
    expect(estimate(cwd, 'write')).toMatchObject({ inputTokens: 100, outputTokens: 1200, totalTokens: 1300, xPosts: 1, xApiUsd: 0.2, renderSeconds: 12 });
    expect(estimate(cwd)).toEqual(estimate(cwd));
    expect(() => estimate(cwd, 'unknown')).toThrow('Stage');
  });

  it('uses configured X prices and preserves explicitly unknown or invalid prices', async () => {
    const cwd = await temp();
    await mkdir(join(cwd, '.launch/posts'), { recursive: true });
    await writeFile(join(cwd, '.launch/plan.md'), '| x | 2026-09-25 |');
    await writeFile(join(cwd, '.launch/posts/x.md'), '---\ntitle: Draft\nclaims: []\nmedia: []\n---\nHello\n---\nSee https://example.test');
    const config = join(cwd, '.launch/config.json');
    await writeFile(config, JSON.stringify({ xApiCost: { create: 0.03, withUrl: 0.4 } }));
    expect(estimate(cwd)).toMatchObject({ xPosts: 2, xApiUsd: 0.43 });
    await writeFile(config, JSON.stringify({ xApiCost: { create: 0, withUrl: null } }));
    expect(estimate(cwd)).toMatchObject({ xPosts: 2, xApiUsd: null });
    expect(estimate(cwd).xPricing).toContain('cost unknown — set it in config');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    printEstimate(cwd, 'publish');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('cost unknown'));
    await writeFile(config, JSON.stringify({ xApiCost: { create: -1 } }));
    expect(estimate(cwd)).toMatchObject({ xApiUsd: null, warnings: ['Invalid X API cost configuration; cost unknown'] });
    await writeFile(config, '{broken');
    expect(estimate(cwd)).toMatchObject({ xApiUsd: null, warnings: ['Could not read X API pricing from .launch/config.json; cost unknown'] });
  });

  it('reports malformed optional inputs without blocking an unrelated command', async () => {
    const cwd = await temp();
    await mkdir(join(cwd, '.launch/video'), { recursive: true });
    await mkdir(join(cwd, '.launch/posts'));
    await writeFile(join(cwd, '.launch/video/script.json'), '{broken');
    await writeFile(join(cwd, '.launch/posts/x.md'), '---\ninvalid: [\n---\nDraft');
    const result = estimate(cwd, 'write');
    expect(result.warnings).toHaveLength(2);
    expect(result.scenes).toBe(6);
    expect(printEstimate(cwd, 'write', true)).toMatchObject({ estimated: true, warnings: result.warnings });
    const raw = execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--cwd', cwd, 'video', 'script', '--json'], { encoding: 'utf8' });
    expect(JSON.parse(raw)).toMatchObject({ ok: true });
  }, 30000);

  it('defaults telemetry off, strips untrusted keys and respects opt-outs', async () => {
    const cwd = await temp(); vi.stubEnv('LIFTOFF_HOME', cwd); vi.stubEnv('DO_NOT_TRACK', ''); vi.stubEnv('LIFTOFF_TELEMETRY', '');
    expect((await telemetry()).enabled).toBe(false);
    await recordEvent({});
    await expect(stat(join(cwd, 'telemetry-events.jsonl'))).rejects.toThrow();
    await telemetry('on');
    await recordEvent({ stage: 'scan', completed: true, durationMs: 1234, cliVersion: 'secret-name', path: '/private', content: 'secret', account: '@person' });
    const raw = await readFile(join(cwd, 'telemetry-events.jsonl'), 'utf8');
    expect(Object.keys(JSON.parse(raw))).toEqual(['stage', 'completed', 'durationMs', 'cliVersion']);
    expect(raw).not.toMatch(/secret|private|person/);
    expect(() => sanitizeEvent({ stage: '/private', completed: true, durationMs: 1 })).toThrow();
    expect(() => sanitizeEvent({})).toThrow();
    vi.stubEnv('DO_NOT_TRACK', '1'); expect((await telemetry()).enabled).toBe(false);
    vi.stubEnv('DO_NOT_TRACK', ''); vi.stubEnv('LIFTOFF_TELEMETRY', '0'); expect((await telemetry()).enabled).toBe(false);
    await telemetry('off'); expect((await telemetry()).enabled).toBe(false);
    await expect(telemetry('bad')).rejects.toThrow();
  });

  it('demo builds a real review page offline, preserving existing directories', async () => {
    const root = await temp(); vi.stubEnv('LIFTOFF_HOME', root);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network'));
    const dir = join(root, 'demo');
    const result = await demo({ dir });
    expect((await stat(result.reviewPath)).isFile()).toBe(true);
    expect(await readFile(result.reviewPath, 'utf8')).toContain('Tasklight');
    expect(result.stages.map(s => s.stage)).toEqual(['init', 'scan', 'product', 'validate', 'plan', 'brief', 'write', 'check', 'shots', 'images', 'video', 'review']);
    expect(result.stages.every(s => s.status === 'completed' || s.status.startsWith('skipped:'))).toBe(true);
    expect(result.estimate.formats).toBe(1);
    expect(checkPosts(dir)).toMatchObject({ passed: true, issues: [] });
    const product = JSON.parse(await readFile(join(dir, '.launch/product.json'), 'utf8'));
    expect(product.claims.some((claim: { id: string }) => claim.id === 'interface')).toBe(true);
    await expect(demo({ dir })).rejects.toThrow();
  }, 300000);

  it('appends phase I without changing through-6 ordering', () => {
    const order = phases.map(p => String(p.phase));
    expect(order.slice(order.indexOf('6'))).toEqual(['6', 'I']);
  });
});
