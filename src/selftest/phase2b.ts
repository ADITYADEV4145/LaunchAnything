import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Check } from './types.js';
import { learnVoice } from '../voice/learn.js';
import { scoreVoice } from '../voice/score.js';
import { checkPosts, parsePost } from '../copy/check.js';

export const checks: Check[] = [{ name: 'phase 2b owned voice, AI tells and honest counts', run({ cwd }) {
  const base = join(cwd, '.liftoff-fixture/phase2b'), launch = join(cwd, '.launch');
  const config = join(launch, 'config.json'), product = join(launch, 'product.json');
  const voicePath = join(launch, 'voice.json'), draft = join(launch, 'posts/x.md');
  const paths = [config, product, voicePath, draft];
  const before = paths.map(path => existsSync(path) ? readFileSync(path) : undefined);
  mkdirSync(join(launch, 'posts'), { recursive: true });
  try {
    writeFileSync(config, JSON.stringify({ profile: 'devtool', launchType: 'new-product', channels: ['x'], timezone: 'UTC', launchDate: '2026-09-25', profileConfirmed: true }));
    cpSync(join(cwd, '.liftoff-fixture/phase2/product.json'), product);
    const voice = learnVoice(cwd, ['.liftoff-fixture/phase2b/samples.md']);
    if (voice.samples.length < 20) throw new Error('Missing samples');
    cpSync(join(base, 'ai.md'), draft);
    if (!checkPosts(cwd).issues.some(i => i.rule.startsWith('ai-tells.'))) throw new Error('AI draft accepted');
    const ai = parsePost(readFileSync(draft, 'utf8'));
    if (scoreVoice(ai.body, voice, 'x').passed) throw new Error('AI voice score accepted');
    cpSync(join(base, 'rewritten.md'), draft);
    const rewritten = parsePost(readFileSync(draft, 'utf8'));
    if (!scoreVoice(rewritten.body, voice, 'x').passed) throw new Error('Rewritten voice rejected');
    const result = checkPosts(cwd);
    if (!result.passed) throw new Error(JSON.stringify(result.issues));
    cpSync(join(base, 'invented.md'), draft);
    if (!checkPosts(cwd).issues.some(i => i.rule === 'honesty.unsupported-count')) throw new Error('Invented count accepted');
  } finally {
    paths.forEach((path, i) => { if (before[i]) writeFileSync(path, before[i]!); else rmSync(path, { force: true }); });
  }
} }];
