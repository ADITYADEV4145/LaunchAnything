import { cp, mkdir, mkdtemp, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { packageRoot } from '../core/package-root.js';
import { init } from '../product/init.js';
import { scan } from '../product/scan.js';
import { validate } from '../product/validate.js';
import { plan } from '../planning/plan.js';
import { brief } from '../brief/index.js';
import { writeBriefs } from '../copy/write.js';
import { checkPosts } from '../copy/check.js';
import { takeShots } from '../visuals/shots.js';
import { makeImages } from '../visuals/images.js';
import { prepareFixtureVideo } from '../selftest/phase4.js';
import { render } from '../video/render.js';
import { buildReview } from '../review/page.js';
import { chromeAvailable } from './setup.js';
import { recordEvent } from './telemetry.js';
import { estimate } from './estimate.js';

export async function demo(options: { dir?: string; onStage?: (stage: string, status: string) => void } = {}) {
  const started = Date.now();
  const cwd = options.dir ? resolve(options.dir) : await mkdtemp(join(tmpdir(), 'liftoff-demo-'));
  if (options.dir) await mkdir(cwd, { recursive: false });
  await cp(join(packageRoot(), 'fixtures/cli-tool'), cwd, { recursive: true });
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Liftoff Demo', GIT_AUTHOR_EMAIL: 'demo@example.test', GIT_COMMITTER_NAME: 'Liftoff Demo', GIT_COMMITTER_EMAIL: 'demo@example.test', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], { cwd, env, stdio: 'pipe' });
  git('init'); git('add', '--all'); git('commit', '-m', 'Demo fixture');
  const stages: { stage: string; status: string; durationMs: number }[] = [];
  const run = async (stage: string, work: () => unknown | Promise<unknown>, skip?: string) => {
    const start = Date.now(); let completed = false;
    try {
      if (!skip) await work();
      completed = !skip;
      const status = skip ? `skipped: ${skip}` : 'completed';
      stages.push({ stage, status, durationMs: Date.now() - start }); options.onStage?.(stage, status);
    } finally { try { await recordEvent({ stage, completed, durationMs: Date.now() - start }); } catch { /* Telemetry must not interrupt a demo. */ } }
  };
  await run('init', () => init(cwd, { yes: true, date: '2026-09-25', timezone: 'UTC' }));
  await run('scan', () => scan(cwd, { github: false }));
  await run('product', () => copyFile(join(cwd, '.liftoff-fixture/phase2/product.json'), join(cwd, '.launch/product.json')));
  await run('validate', async () => { const result = await validate(cwd, 'product'); if (!result.valid) throw new Error(result.errors.join('; ')); });
  await run('plan', () => plan(cwd, { lessons: [] }));
  await run('brief', () => brief(cwd));
  await run('write', async () => {
    writeBriefs(cwd);
    for (const channel of estimate(cwd).channels) await copyFile(join(cwd, '.liftoff-fixture/phase2/good', channel + '.md'), join(cwd, '.launch/posts', channel + '.md'));
  });
  await run('check', () => { const result = checkPosts(cwd); if (!result.passed) throw new Error(JSON.stringify(result.issues)); });
  const chrome = await chromeAvailable();
  await run('shots', async () => {
    await writeFile(join(cwd, '.launch/shots.yaml'), 'shots:\n  - id: demo-terminal\n    commands: ["node bin/tasklight.js add Prepare launch", "node bin/tasklight.js list"]\n    viewport: {width: 1000, height: 650}\n');
    await takeShots(cwd);
  }, chrome ? undefined : 'Chrome missing; npx playwright install chromium');
  await run('images', () => makeImages(cwd), chrome ? undefined : 'Chrome missing');
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  await run('video', async () => { await prepareFixtureVideo(cwd, 'cli-tool'); await render(cwd, 'ffmpeg', ['1x1']); }, ffmpeg ? undefined : 'ffmpeg missing; install FFmpeg');
  let reviewPath = '';
  await run('review', async () => { reviewPath = (await buildReview(cwd)).path; });
  return { dir: cwd, reviewPath, stages, durationMs: Date.now() - started, estimate: estimate(cwd, 'demo'), note: 'Offline prepared fixture copy; no accounts, LLM calls, posts or publishing.' };
}
