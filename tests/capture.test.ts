import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { PNG } from 'pngjs';
import { takeShots } from '../src/visuals/shots.js';
import { ocrWords } from '../src/media/banned.js';
import { exec } from '../src/visuals/runtime.js';

async function repo(spec: unknown) {
  const root = await mkdtemp(join(tmpdir(), 'capture-'));
  const cwd = join(root, `a space ' and "quotes"`); await mkdir(join(cwd, '.launch'), { recursive: true });
  await writeFile(join(cwd, '.launch/shots.yaml'), JSON.stringify(spec));
  return { cwd, root, dir: join(cwd, '.launch/media/shots') };
}
function storyboard(command: string) {
  return { shots: [
    { id: 'hook', purpose: 'hook', card: true, caption: 'Catch unresolved exports', viewport: { width: 800, height: 450 } },
    { id: 'before', purpose: 'before', card: true, caption: 'Review local changes', viewport: { width: 800, height: 450 } },
    { id: 'result', purpose: 'after', moneyMoment: true, commands: [command], setup: ['export MESSAGE=READY', 'echo SECRETSETUPMARKER'], highlight: { text: 'READY' }, viewport: { width: 1600, height: 900 } },
    { id: 'cta', purpose: 'cta', card: true, caption: 'Ground local changes', viewport: { width: 800, height: 450 } },
  ] };
}
for (const renderer of ['vhs', 'html']) it(`captures a CLI storyboard with ${renderer}, hidden persistent setup and safely quoted paths/commands`, async () => {
  const { root, cwd, dir } = await repo(storyboard('printf "%s\\n" "$MESSAGE"'));
  const path = process.env.PATH;
  try {
    if (renderer === 'html') {
      const bin = join(root, 'bin'); await mkdir(bin);
      for (const name of ['bash', 'ffmpeg', 'ffprobe', 'tesseract']) await symlink(`/usr/bin/${name}`, join(bin, name));
      process.env.PATH = bin;
    }
    const manifest = await takeShots(cwd);
    const shot = manifest.find(shot => shot.id === 'result')!;
    expect(shot).toMatchObject({ renderer, scale: renderer === 'html' ? 2 : 1, moneyMoment: true, banned: [], width: renderer === 'html' ? 3200 : 1600, height: renderer === 'html' ? 1800 : 900 });
    expect(shot).toHaveProperty('highlight.width', expect.any(Number));
    for (const ext of ['png', 'gif', 'mp4']) expect((await readFile(join(dir, `result.${ext}`))).length).toBeGreaterThan(100);
    const ocr = await ocrWords(await readFile(join(dir, 'result.png')));
    expect(ocr.text).toContain('READY'); expect(ocr.text).not.toContain('SECRETSETUPMARKER');
    const tape = await readFile(join(cwd, '.launch/media/tapes/result.tape'), 'utf8');
    expect(tape.indexOf('Hide')).toBeLessThan(tape.indexOf('SECRETSETUPMARKER'));
    expect(tape.indexOf('SECRETSETUPMARKER')).toBeLessThan(tape.indexOf('Show'));
    expect(tape).toContain('Set FontSize 32'); expect(tape).toContain('Set Padding 40');
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', join(dir, 'result.mp4')]);
    expect(stdout).toContain('h264');
  } finally { process.env.PATH = path; await rm(root, { recursive: true, force: true }); }
}, 240000);

for (const renderer of ['vhs','html']) it(`fits long money-moment output without hard wraps using ${renderer}, executing commands once`, async () => {
  const spec=storyboard('cat message.txt'); spec.shots[2].setup!.push('printf x >> executions');
  const {root,cwd,dir}=await repo(spec); const path=process.env.PATH;
  try {
    const message="READY\nWhy: 'formatCurrency' is not exported in money.ts. Did you mean formatPrice (money.ts:1, formatPrice(cents: number): string)?\n";
    await writeFile(join(cwd,'message.txt'),message);
    if(renderer==='html') {
      const bin=join(root,'bin'); await mkdir(bin);
      for(const name of ['bash','cat','ffmpeg','ffprobe','tesseract']) await symlink(`/usr/bin/${name}`,join(bin,name));
      process.env.PATH=bin;
    }
    const shot=(await takeShots(cwd)).find(shot=>shot.id==='result')!;
    expect(shot.columns).toBe(110); expect(shot.renderer).toBe(renderer);
    const transcript=await readFile(join(cwd,'.launch/media/tapes/result.txt'),'utf8');
    expect(transcript.trimEnd().split('\n').every(line=>line.length<=110)).toBe(true);
    expect(transcript).toContain('money.ts'); expect(transcript).toContain('formatPrice');
    expect(await readFile(join(cwd,'executions'),'utf8')).toBe('x');
    expect((await ocrWords(await readFile(join(dir,'result.png')))).text).not.toContain('SECRETSETUPMARKER');
  } finally {process.env.PATH=path;await rm(root,{recursive:true,force:true});}
},120000);

it('highlights code identifiers adjacent to punctuation without matching identifier prefixes', async () => {
  const shot = { id: 'signature', commands: ['cat money.ts'], fontSize: 40, highlight: { text: 'formatPrice' }, viewport: { width: 1600, height: 900 } };
  const { root, cwd, dir } = await repo({ shots: [shot] });
  const path = process.env.PATH;
  try {
    await writeFile(join(cwd, 'money.ts'), 'export function formatPrice(cents: number): string {}\n');
    const bin = join(root, 'bin'); await mkdir(bin);
    for (const name of ['bash', 'cat', 'ffmpeg', 'ffprobe', 'tesseract']) await symlink(`/usr/bin/${name}`, join(bin, name));
    process.env.PATH = bin;
    expect((await takeShots(cwd))[0]).toHaveProperty('highlight.width', expect.any(Number));
    await writeFile(join(cwd, '.launch/shots.yaml'), JSON.stringify({ shots: [{ ...shot, highlight: { text: 'format' } }] }));
    await expect(takeShots(cwd)).rejects.toThrow('highlight text not found by OCR');
    expect(await readdir(dir)).toEqual([]);
  } finally { process.env.PATH = path; await rm(root, { recursive: true, force: true }); }
}, 60000);

it('rejects visible shell pipes before execution, removes stale shot files and its tape', async () => {
  const { cwd, root, dir } = await repo({ shots: [{ id: 'unsafe', commands: ['cat notes.txt | sed -n 1p'], fontSize: 32, viewport: { width: 800, height: 450 } }] });
  try {
    await mkdir(dir, { recursive: true });
    for (const ext of ['png', 'gif', 'mp4']) await writeFile(join(dir, `unsafe.${ext}`), 'stale');
    await expect(takeShots(cwd)).rejects.toThrow('Shot unsafe frame 0: banned shell-pipe. Fix the shot (hide setup, change commands/route) and re-run liftoff shots.');
    expect(await readdir(dir)).toEqual([]);
    expect(await readdir(join(cwd, '.launch/media/tapes'))).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('rejects banned content visible only in sampled terminal animation frames, re-shoots once, and cleans up', async () => {
  const { cwd, root, dir } = await repo({ shots: [{ id: 'transient', commands: ["printf 'fix%s/app\\n' tures; sleep 2; clear; echo READY"], setup: ['printf x >> attempts'], fontSize: 32, viewport: { width: 1600, height: 900 } }] });
  try {
    await expect(takeShots(cwd)).rejects.toThrow(/Shot transient frame \d+: banned fixture-path/);
    expect(await readFile(join(cwd, 'attempts'), 'utf8')).toBe('xx');
    expect(await readdir(dir)).toEqual([]);
    expect(await readdir(join(cwd, '.launch/media/tapes'))).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 240000);

async function web(html: string, work: (url: string, requests: () => number) => Promise<void>) {
  let count = 0;
  const server = createServer((_, response) => { count++; response.setHeader('Content-Type', 'text/html'); response.end(html); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await work(`http://127.0.0.1:${(server.address() as { port: number }).port}`, () => count); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
it('captures light/dark at scale two with image-pixel highlight boxes and element crops', async () => {
  const { cwd, root, dir } = await repo({ shots: [
    { id: 'page', route: '/', themes: ['light', 'dark'], highlight: { selector: '#focus' }, viewport: { width: 600, height: 400 } },
    { id: 'crop', route: '/', element: '#panel', highlight: { selector: '#focus' }, viewport: { width: 600, height: 400 } },
  ] });
  try {
    await web('<style>body{margin:0;background:white;color:black}@media(prefers-color-scheme:dark){body{background:#101827;color:white}}#panel{position:absolute;left:40px;top:60px;width:400px;height:200px}#focus{position:absolute;left:20px;top:30px;width:180px;height:50px;font:32px sans-serif}</style><div id="panel"><div id="focus">READY</div></div>', async url => {
      const manifest = await takeShots(cwd, { url });
      expect(manifest[0]).toMatchObject({ scale: 2, variants: { light: 'page.png', dark: 'page-dark.png' }, highlight: { x: 120, y: 180, width: 360, height: 100 } });
      for (const file of ['page.png', 'page-dark.png']) expect(PNG.sync.read(await readFile(join(dir, file)))).toMatchObject({ width: 1200, height: 800 });
      expect(manifest[1]).toMatchObject({ highlight: { x: 40, y: 60, width: 360, height: 100 }, width: 800, height: 400 });
      expect(await readFile(join(dir, 'page.png'))).not.toEqual(await readFile(join(dir, 'page-dark.png')));
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60000);
it('rejects fixture text drawn into a canvas via OCR, retries once and deletes all shot artifacts', async () => {
  const { cwd, root, dir } = await repo({ shots: [{ id: 'unsafe', route: '/', themes: ['light', 'dark'], viewport: { width: 800, height: 400 } }] });
  try {
    await web('<canvas width="800" height="300"></canvas><script>const c=document.querySelector("canvas").getContext("2d");c.fillStyle="white";c.fillRect(0,0,800,300);c.fillStyle="black";c.font="48px monospace";c.fillText("fixtures/app",40,100);</script>', async (url, requests) => {
      await expect(takeShots(cwd, { url })).rejects.toThrow(/Shot unsafe frame \d+: banned fixture-path/);
      expect(requests()).toBeGreaterThanOrEqual(3);
      expect(await readdir(dir)).toEqual([]);
    });
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60000);
