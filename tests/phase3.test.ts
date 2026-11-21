import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSecrets, maskSecrets, assertPrivate } from '../src/visuals/privacy.js';
import { contrast, pngSize, safeArea } from '../src/visuals/check.js';
import { validateFile } from '../src/core/schema.js';
import { checks } from '../src/selftest/phase3.js';
import { PNG } from 'pngjs';
import { browser, runTerminal, sanitizedEnv } from '../src/visuals/runtime.js';
import { guard } from '../src/visuals/capture.js';
import { takeShots } from '../src/visuals/shots.js';
import { makeImages } from '../src/visuals/images.js';
import { mkdir, writeFile } from 'node:fs/promises';
describe('privacy', () => {
  const examples = { email: 'person@example.com', aws: 'AKIA1234567890123456', github: 'ghp_abcdefghijklmnopqrstuvwxyz', slack: 'xoxb-123456789012345', stripe: 'sk_live_123456789012345678', ai: 'sk-ant-abcdefghijklmnopqrstuvwxyz', google: 'AIza123456789012345678901234', jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature', privateKey: '-----BEGIN RSA PRIVATE KEY-----', assignment: 'api_key=abcdefghijklmnopqrstuvwxyz' };
  for (const [name, value] of Object.entries(examples)) it(name, () => { expect(scanSecrets(value)).toContain(name); expect(maskSecrets(value)).not.toContain(value); expect(() => assertPrivate(value)).toThrow('[REDACTED]'); });
  it('accepts empty and normal text', () => { expect(scanSecrets('')).toEqual([]); expect(scanSecrets('Ship a calmer weekly plan. token: short')).toEqual([]); });
});
it('detects secrets split across inline text nodes without scanning redacted text', async () => {
  const app = await browser(); const page = await app.newPage();
  try {
    await page.setContent('<span>a</span><span>@b.com</span>');
    await expect(guard(page, [])).rejects.toThrow('Privacy guard: email');
    await page.setContent('<div class="private"><span>a</span><span>@b.com</span></div><p>Safe text</p>');
    expect(await guard(page, ['.private'])).toBe(1);
    await page.setContent('<span>ordinary</span><span> text</span>');
    expect(await guard(page, [])).toBe(0);
  } finally { await app.close(); }
});
it('scans and redacts open shadow roots and nested frames, failing closed on unreadable frames', async () => {
  const app = await browser(); const page = await app.newPage();
  const server = createServer((_req, res) => res.end('<p class="private">person@example.test</p>'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    await page.setContent('<div id="host"></div>');
    await page.locator('#host').evaluate(el => { el.attachShadow({ mode: 'open' }).innerHTML = '<p class="private">person@example.test</p>'; });
    await expect(guard(page, [])).rejects.toThrow('Privacy guard: email');
    expect(await guard(page, ['.private'])).toBe(1);
    expect(await page.locator('#host').locator('.private').evaluate(el => getComputedStyle(el).filter)).toBe('blur(18px)');
    await page.setContent('<iframe srcdoc="<iframe srcdoc=\'person@example.test\'></iframe>"></iframe>');
    await expect(guard(page, [])).rejects.toThrow('Privacy guard: email');
    expect(await guard(page, ['iframe'])).toBe(1);
    await page.setContent(`<iframe src="http://127.0.0.1:${(server.address() as { port: number }).port}"></iframe>`);
    await expect(guard(page, [])).rejects.toThrow('Privacy guard: email');
    expect(await guard(page, ['.private'])).toBe(1);
    const frame = page.frames().find(f => f !== page.mainFrame())!;
    const evaluation = vi.spyOn(frame, 'evaluate').mockRejectedValue(new Error('inaccessible'));
    await expect(guard(page, [])).rejects.toThrow('unable to inspect frame');
    expect(await guard(page, ['iframe'])).toBe(1);
    evaluation.mockRestore();
  } finally { await app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
it('contrast and safe areas', () => {
  expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21); expect(contrast([42, 42, 42], [42, 42, 42])).toBe(1);
  expect(safeArea({ x: 60, y: 40, width: 500, height: 50 }, 1200, 630)).toBe(true);
  expect(safeArea({ x: 0, y: 0, width: 50, height: 20 }, 1200, 630)).toBe(false);
  expect(safeArea({ x: 850, y: 550, width: 250, height: 40 }, 1200, 630, true)).toBe(false);
  expect(safeArea({ x: 60, y: 40, width: 0, height: 0 }, 1200, 630)).toBe(false);
});
it('reads PNG dimensions and rejects invalid data', () => { expect(pngSize(PNG.sync.write(new PNG({ width: 12, height: 34 })))).toEqual({ width: 12, height: 34 }); expect(() => pngSize(Buffer.alloc(0))).toThrow(); expect(() => pngSize(Buffer.alloc(24))).toThrow(); });
it('supports backwards compatible shots and terminal additions', () => {
  const viewport = { width: 800, height: 600 };
  expect(validateFile('shots', { shots: [{ id: 'home', route: '/', viewport }] }).valid).toBe(true);
  expect(validateFile('shots', { baseUrl: 'http://localhost:3000', startCommand: 'npm run dev', readyTimeoutMs: 1000, shots: [{ id: 'cli', commands: ['node --version'], fullPage: false, viewport }] }).valid).toBe(true);
  expect(validateFile('shots', { shots: [{ id: 'bad', viewport }] }).valid).toBe(false);
  expect(validateFile('shots', { shots: [{ id: 'bad', commands: [], viewport }] }).valid).toBe(false);
});
it('sanitizes terminal environments and handles empty, failed and timed-out commands', async () => {
  expect(Object.keys(sanitizedEnv()).every(key => ['PATH', 'HOME', 'LANG', 'TMPDIR', 'SystemRoot'].includes(key))).toBe(true);
  expect(await runTerminal('node -e "process.stdout.write(String(2 + 2))"', process.cwd())).toBe('4');
  expect(await runTerminal('node -e ""', process.cwd())).toBe('');
  await expect(runTerminal('node -e "process.exit(1)"', process.cwd())).rejects.toThrow('output withheld');
  await expect(runTerminal('node -e "setTimeout(() => {}, 10000)"', process.cwd(), 100)).rejects.toThrow('timed out');
});
it('accepts a non-2xx base response or the first working shot route for readiness', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'phase3-ready-')); let baseStatus = 404;
  const server = createServer((req, res) => { res.statusCode = req.url === '/home' ? 200 : baseStatus; res.end('<h1>Ready</h1>'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    await mkdir(join(cwd, '.launch'));
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const spec = { baseUrl, readyTimeoutMs: 1000, shots: [{ id: 'ready', route: '/home', viewport: { width: 400, height: 300 } }] };
    await writeFile(join(cwd, '.launch/shots.yaml'), JSON.stringify(spec));
    expect(await takeShots(cwd)).toHaveLength(1);
    baseStatus = 503;
    expect(await takeShots(cwd)).toHaveLength(1);
    spec.shots[0].route = '/unavailable'; spec.readyTimeoutMs = 50;
    await writeFile(join(cwd, '.launch/shots.yaml'), JSON.stringify(spec));
    await expect(takeShots(cwd)).rejects.toThrow('App readiness timeout');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(cwd, { recursive: true, force: true }); }
}, 30000);
it('rejects missing input, empty shot lists and invalid image options', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'phase3-errors-'));
  try {
    await expect(takeShots(cwd)).rejects.toThrow('ENOENT');
    await expect(makeImages(cwd)).rejects.toThrow('ENOENT');
    await mkdir(join(cwd, '.launch'));
    await writeFile(join(cwd, '.launch/shots.yaml'), 'shots: []');
    await expect(takeShots(cwd)).rejects.toThrow('fewer than 1 items');
    await writeFile(join(cwd, '.launch/product.json'), JSON.stringify({ name: 'Demo', oneLiner: 'Local demo' }));
    await expect(makeImages(cwd, { size: 'bad' })).rejects.toThrow('Unknown image size');
    await expect(makeImages(cwd, { template: '../bad' })).rejects.toThrow('Unknown template');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
for (const fixture of ['saas-next', 'cli-tool', 'mobile-expo']) it(`end to end ${fixture}`, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'phase3-test-'));
  try { await cp(join(process.cwd(), 'fixtures', fixture), cwd, { recursive: true }); for (const check of checks) await check.run({ cwd, fixture }); }
  finally { await rm(cwd, { recursive: true, force: true }); }
}, 180000);
