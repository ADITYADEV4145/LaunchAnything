import type { Check } from './types.js';
import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { stringify } from 'yaml';
import { takeShots } from '../visuals/shots.js';
import { makeImages } from '../visuals/images.js';
import { scanSecrets } from '../visuals/privacy.js';

export const checks: Check[] = [{ name: 'phase3 visuals and privacy', async run({ cwd, fixture }) {
  const launch = join(cwd, '.launch'); await mkdir(launch, { recursive: true });
  try { await access(join(launch, 'product.json')); } catch { await copyFile(join(cwd, '.liftoff-fixture/product.json'), join(launch, 'product.json')); }
  const configPath = join(launch, 'config.json'); let config = {};
  try { config = JSON.parse(await readFile(configPath, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const viewport = { width: 1000, height: 650 };
  if (fixture === 'saas-next') {
    const home = await readFile(join(cwd, 'app/page.tsx'), 'utf8');
    const pricing = await readFile(join(cwd, 'app/pricing/page.tsx'), 'utf8');
    const markup = (source: string) => source.slice(source.indexOf('<main>'), source.indexOf('</main>') + 7);
    let negative = false;
    const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(`<html><body style="background:#edf4f1;color:#112d28;font:24px Arial;padding:50px"><nav>TEAMNEST / WORKSPACE</nav>${markup(req.url === '/pricing' ? pricing : home)}<div class="redact-me">person@example.test</div>${negative ? '<p>ghp_abcdefghijklmnopqrstuvwxyz123456</p>' : ''}</body></html>`); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      await writeFile(configPath, JSON.stringify({ ...config, redact: ['.redact-me'] }));
      await writeFile(join(launch, 'shots.yaml'), stringify({ shots: [{ id: 'phase3-home', route: '/', viewport }, { id: 'phase3-pricing', route: '/pricing', viewport }] }));
      const shots = await takeShots(cwd, { url });
      if (shots.length !== 2 || shots.some(s => s.redactedCount !== 1 || s.secretsFound !== 0)) throw new Error('Redaction or shots missing');
      negative = true;
      await writeFile(join(launch, 'shots.yaml'), stringify({ shots: [{ id: 'phase3-negative', route: '/', viewport }] }));
      let rejected = false; try { await takeShots(cwd, { url }); } catch (e) { rejected = /Privacy guard: github/.test((e as Error).message); }
      if (!rejected) throw new Error('Unredacted token was accepted');
      try { await access(join(launch, 'media/shots/phase3-negative.png')); throw new Error('Unsafe image saved'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      negative = false;
      await writeFile(join(launch, 'shots.yaml'), stringify({ shots: [{ id: 'phase3-home', route: '/', viewport }, { id: 'phase3-pricing', route: '/pricing', viewport }] }));
      await takeShots(cwd, { url });
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  } else if (fixture === 'cli-tool') {
    const commands = ['node bin/tasklight.js add Prepare launch', 'node bin/tasklight.js list'];
    if (scanSecrets(commands.join('\n')).length) throw new Error('Unsafe fixture commands');
    await writeFile(join(launch, 'shots.yaml'), stringify({ shots: [{ id: 'phase3-terminal', commands, viewport }] }));
    const shots = await takeShots(cwd); if (shots.length !== 1 || shots[0].files.length !== 2) throw new Error('Terminal PNG/GIF missing');
  }
  const report = await makeImages(cwd);
  if (report.length !== 6 || report.some(r => !r.ok)) throw new Error('Six valid sizes required');
} }];
