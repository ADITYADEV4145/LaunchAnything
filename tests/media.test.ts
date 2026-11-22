import { it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { assertClean, scanBanned, ocrWords } from '../src/media/banned.js';
import { planShots } from '../src/media/director.js';
import { validateFile } from '../src/core/schema.js';
import * as runtime from '../src/visuals/runtime.js';

const exec = promisify(execFile);
const examples = {
  'fixture-path': ['fixtures/ts-app/src', '.liftoff-fixture', 'liftoff-fixtures/app'],
  'tmp-path': ['/tmp/liftoff-AbC123', '/var/folders/xx', 'AppData\\Local\\Temp'],
  'shell-pipe': ['cat out.txt | sed -n 1p', 'grep -n error log'],
  'stack-trace': ['    at run (/x/y.js:10:5)', 'Traceback (most recent call last)', 'node:internal/modules'],
  'api-key': ['ghp_abcdefghijklmnopqrstuvwxyz'], email: ['person@example.com'],
  'test-word': ['test', 'tests', 'testing'], foo: ['foo', 'foobar', 'bar baz'],
};
for (const [rule, values] of Object.entries(examples)) it(`detects ${rule} without leaking values`, () => {
  for (const value of values) {
    expect(scanBanned(value)).toContain(rule);
    expect(() => assertClean(value, 'frame')).toThrow(`Banned content in frame: ${rule}`);
  }
});
it('allows ordinary product output and empty text, repeatedly', () => {
  for (const text of ['', 'BLOCK grounding (unknown-export): label.ts:1', 'formatPrice(cents: number): string', 'latest', 'contest', 'food']) {
    expect(scanBanned(text)).toEqual([]); expect(() => assertClean(text, 'frame')).not.toThrow();
  }
  expect(scanBanned(examples['api-key'][0])).toEqual(['api-key']);
  expect(scanBanned(examples['api-key'][0])).toEqual(['api-key']);
});
it('reads required OCR word boxes and detects a shell pipe in a real PNG', async () => {
  const app = await runtime.browser();
  try {
    const page = await app.newPage({ viewport: { width: 1000, height: 250 } });
    await page.setContent('<body style="background:white;color:black;font:40px monospace;padding:40px">cat log | grep error</body>');
    const result = await ocrWords(await page.screenshot());
    expect(scanBanned(result.text)).toContain('shell-pipe');
    expect(result.words.length).toBeGreaterThan(3);
    expect(result.words.every(word => word.width > 0 && word.height > 0 && word.x >= 0 && word.y >= 0 && Number.isFinite(word.conf))).toBe(true);
    await page.setContent('<body style="background:white"></body>');
    expect(await ocrWords(await page.screenshot())).toEqual({ text: '', words: [] });
    await expect(ocrWords(Buffer.from('invalid PNG'))).rejects.toThrow();
  } finally { await app.close(); }
}, 30000);
it('explains how to install missing required OCR', async () => {
  const mock = vi.spyOn(runtime, 'exec').mockRejectedValueOnce(new Error('ENOENT'));
  try { await expect(ocrWords(Buffer.alloc(0))).rejects.toThrow('OCR unavailable: install tesseract (apt install tesseract-ocr / brew install tesseract)'); }
  finally { mock.mockRestore(); }
});

async function repo(product: unknown) {
  const cwd = await mkdtemp(join(tmpdir(), 'media-'));
  await mkdir(join(cwd, '.launch'));
  await writeFile(join(cwd, '.launch/product.json'), JSON.stringify(product));
  return cwd;
}
const product = { name: 'Label', oneLiner: 'Ground local changes', problem: 'Unknown exports escape review', proofPoints: ['Names the unresolved export'], features: [{ name: 'Grounding', description: 'Checks export names' }] };
it('directs six CLI shots in order with exactly one money moment and a JSON agent brief', async () => {
  const cwd = await repo({ ...product, money_moment: { summary: 'Catch unknown exports', before: 'Unknown exports escape review', after: 'BLOCK grounding unknown export', proof: 'Names the unresolved export', command: 'node app.js', setup: ['echo ready'], highlight: 'BLOCK' } });
  try {
    const { stdout } = await exec(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--cwd', cwd, '--json', 'shots', 'plan']);
    const result = JSON.parse(stdout).data;
    expect(result.kind).toBe('cli'); expect(result.brief.rules).toContain('Agent:');
    const spec = parse(await readFile(join(cwd, '.launch/shots.yaml'), 'utf8'));
    expect(spec.shots.map((shot: { purpose: string }) => shot.purpose)).toEqual(['hook', 'before', 'action', 'after', 'proof', 'cta']);
    expect(spec.shots.filter((shot: { moneyMoment?: boolean }) => shot.moneyMoment)).toHaveLength(1);
    expect(spec.shots[3]).toMatchObject({ moneyMoment: true, commands: ['node app.js'], setup: ['echo ready'], highlight: { text: 'BLOCK' } });
    expect(validateFile('shots', spec)).toEqual({ valid: true, errors: [] });
    await expect(planShots(cwd)).rejects.toThrow('use --force');
    expect((await planShots(cwd, { force: true })).storyboard.shots).toHaveLength(6);
    for (const invalid of [spec.shots.slice(0, 3), spec.shots.map((s: object) => ({ ...s, moneyMoment: false })), [...spec.shots].reverse()]) expect(validateFile('shots', { shots: invalid }).valid).toBe(false);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
it.each([['A clear money moment', 'A clear money moment'], [undefined, product.oneLiner]])('falls back leniently for money_moment %s and rejects TODO at the CLI', async (money_moment, caption) => {
  const cwd = await repo({ ...product, money_moment });
  try {
    const result = await planShots(cwd);
    expect(result.storyboard.shots[3].caption).toBe(caption);
    expect(result.storyboard.shots[0].caption).toBe(product.problem);
    expect(result.storyboard.shots[4].caption).toBe(product.proofPoints[0]);
    expect(result.storyboard.shots[3]).toMatchObject({ commands: ['TODO'] });
    await expect(exec(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--cwd', cwd, '--json', 'shots'])).rejects.toMatchObject({ stdout: expect.stringContaining('fill it from the repo') });
    await expect(exec(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--cwd', cwd, '--json', 'validate', 'shots'])).rejects.toMatchObject({ stdout: expect.stringContaining('TODO') });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
it('detects web frameworks or existing routes, preserves legacy validation and enforces new fields', async () => {
  const cwd = await repo({ ...product, money_moment: { route: '/editor', selector: '#result', after: 'Export resolved' } });
  const legacy = { shots: [{ id: 'home', route: '/', viewport: { width: 800, height: 600 } }] };
  try {
    expect(validateFile('shots', legacy).valid).toBe(true);
    expect(validateFile('shots', { shots: [{ id: 'terminal', commands: ['echo hi'], viewport: { width: 800, height: 600 } }] }).valid).toBe(true);
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '*' } }));
    const result = await planShots(cwd);
    expect(result.kind).toBe('web');
    expect(result.storyboard.shots[3]).toMatchObject({ route: '/editor', element: '#result', themes: ['light', 'dark'], highlight: { selector: '#result' } });
    expect(validateFile('shots', result.storyboard).valid).toBe(true);
    for (const fields of [{ deviceScale: 4 }, { highlight: { text: 'x', selector: 'body' } }, { caption: 'word '.repeat(13) }, { themes: ['unknown'] }]) expect(validateFile('shots', { shots: [{ ...legacy.shots[0], ...fields }] }).valid).toBe(false);
    await rm(join(cwd, 'package.json'));
    await writeFile(join(cwd, '.launch/shots.yaml'), JSON.stringify(legacy));
    expect((await planShots(cwd, { force: true })).kind).toBe('web');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
it('reports absent product input', async () => {
  const cwd = await repo(product);
  try { await rm(join(cwd, '.launch/product.json')); await expect(planShots(cwd)).rejects.toThrow('ENOENT'); }
  finally { await rm(cwd, { recursive: true, force: true }); }
});
