import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { takeShots } from '../src/visuals/shots.js';
import { polish } from '../src/media/polish.js';
import { homepageHost } from '../src/media/assets.js';
import { makeImages } from '../src/visuals/images.js';
import { platforms, pngSize } from '../src/visuals/check.js';
import { ocrWords } from '../src/media/banned.js';
import { exec } from '../src/visuals/runtime.js';

it('captures a real tiny CLI product, polishes it and automatically builds the branded storyboard image set', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'polish-'));
  const shots = [
    { id: 'hook', purpose: 'hook', card: true, caption: 'Unknown exports should never reach production' },
    { id: 'before', purpose: 'before', commands: ['node scope.cjs before'], caption: 'An import points to a missing export' },
    { id: 'action', purpose: 'action', commands: ['node scope.cjs action'], caption: 'Check imports against local source' },
    { id: 'after', purpose: 'after', commands: ['node scope.cjs'], caption: 'Catch unknown exports before they ship', moneyMoment: true, highlight: { text: 'BLOCK' } },
    { id: 'proof', purpose: 'proof', commands: ['node scope.cjs'], caption: 'Find the exact file and unresolved symbol' },
    { id: 'cta', purpose: 'cta', card: true, caption: 'Ground your next change with Scope' },
  ].map(shot => ({ ...shot, viewport: { width: 1600, height: 900 } }));
  const paths = join(cwd, '.launch/media');
  try {
    await mkdir(paths, { recursive: true });
    await writeFile(join(cwd, '.launch/product.json'), JSON.stringify({ name: 'Scope', oneLiner: 'Ground your next change', homepage: 'https://scope.example:8443/docs' }));
    await writeFile(join(cwd, '.launch/shots.yaml'), JSON.stringify({ shots }));
    await writeFile(join(cwd, 'label.ts'), 'export const label = "Ready";');
    await writeFile(join(cwd, 'scope.cjs'), `const fs = require('node:fs'); const names = [...fs.readFileSync('label.ts','utf8').matchAll(/export const (\\w+)/g)].map(match => match[1]); const mode=process.argv[2]; console.log(mode==='before' ? 'import { missingLabel } from "./label";' : mode==='action' ? 'Inspecting label.ts exports: '+names.join(', ') : names.includes('missingLabel') ? 'PASS grounding' : 'BLOCK grounding (unknown-export): label.ts:1\\nMissing export: missingLabel');`);
    await writeFile(join(paths, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="10" fill="#77e5b3"/><path d="M10 27V13h20v14H10zm6-5h8v-4h-8z" fill="#101827" fill-rule="evenodd"/></svg>');
    await takeShots(cwd);
    const { stdout } = await exec(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--cwd', cwd, '--json', 'media', 'polish'], { timeout: 120000 });
    const polished = JSON.parse(stdout).data;
    expect(polished).toHaveLength(6); expect(polished.every((item: { scale: number }) => item.scale === 2)).toBe(true);
    await rm(join(paths, 'polished'), { recursive: true });
    const report = await makeImages(cwd);
    expect(report.every(item => item.ok && item.contrastRatio >= 7)).toBe(true);
    const entries = JSON.parse(await readFile(join(paths, 'images/report.json'), 'utf8'));
    expect(entries.find((item: { file: string }) => item.file === 'x.png')).toMatchObject({ source: join(paths, 'polished/after.png'), shot: 'after', role: 'after', banned: [], ok: true });
    for (const size of Object.keys(platforms) as (keyof typeof platforms)[]) {
      expect(pngSize(await readFile(join(paths, 'images', `${size}.png`)))).toEqual({ width: platforms[size].width, height: platforms[size].height });
    }
    for (const [index, role] of ['hook', 'before', 'action', 'after', 'cta'].entries()) {
      const file = `instagram-${index + 1}.png`;
      expect(entries.find((item: { file: string }) => item.file === file)).toMatchObject({ role });
      expect(pngSize(await readFile(join(paths, 'images', file)))).toEqual({ width: 1080, height: 1350 });
    }
    expect(entries.find((item: { file: string }) => item.file === 'instagram-1.png').source).toBeNull();
    expect(await readFile(join(paths, 'images/instagram.png'))).toEqual(await readFile(join(paths, 'images/instagram-1.png')));
    expect(await readFile(join(paths, 'images/product-hunt.png'))).toEqual(await readFile(join(paths, 'images/product-hunt-1.png')));
    expect(entries.find((item: { file: string }) => item.file === 'product-hunt-2.png').shot).toBe('action');
    expect(entries.find((item: { file: string }) => item.file === 'product-hunt-3.png').shot).toBe('proof');
    expect((await ocrWords(await readFile(join(paths, 'images/x.png')))).text).toContain('Scope');
    shots[3].caption = 'foo'; await writeFile(join(cwd, '.launch/shots.yaml'), JSON.stringify({ shots }));
    await expect(polish(cwd)).rejects.toThrow('Banned content in polished after: foo');
    await expect(readFile(join(paths, 'polished/after.png'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(cwd, { recursive: true, force: true }); }
}, 300000);

it('rejects empty/missing storyboard input and strips local hosts and ports', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'polish-empty-'));
  try {
    await expect(polish(cwd)).rejects.toThrow('requires a storyboard');
    await mkdir(join(cwd, '.launch')); await writeFile(join(cwd, '.launch/shots.yaml'), 'shots: []');
    await expect(polish(cwd)).rejects.toThrow('requires a storyboard');
    for (const url of ['http://localhost:3000', 'http://127.0.0.1:8080', 'http://[::1]:3000', 'not a URL']) expect(homepageHost(url)).toBe('');
    expect(homepageHost('https://scope.example:8443/docs')).toBe('scope.example');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
