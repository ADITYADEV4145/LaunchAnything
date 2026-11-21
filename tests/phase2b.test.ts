import { it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { learnVoice, loadVoice, splitSamples } from '../src/voice/learn.js';
import { scoreVoice } from '../src/voice/score.js';
import { aiTells } from '../src/voice/ai-tells.js';
import { honesty } from '../src/voice/honesty.js';
import { checks } from '../src/selftest/phase2b.js';
import { packageRoot } from '../src/core/package-root.js';

it('learns bounded owned samples, validates stored profiles, rejects empty and missing inputs', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'voice-'));
  try {
    expect(() => learnVoice(cwd, [])).toThrow('20');
    expect(() => learnVoice(cwd, ['missing.md'])).toThrow('No samples');
    expect(() => splitSamples('[invalid')).toThrow();
    const source = readFileSync(join(packageRoot(), 'fixtures/cli-tool/.liftoff-fixture/phase2b/samples.md'), 'utf8');
    writeFileSync(join(cwd, 'samples.md'), source);
    const voice = learnVoice(cwd, ['*.md']);
    expect(loadVoice(cwd)).toEqual(voice);
    expect(scoreVoice('', voice).passed).toBe(false);
    expect(scoreVoice('In today’s fast-paced world, revolutionary synergy enables unprecedented transformation.', voice).rewrite?.references).toHaveLength(3);
    expect(scoreVoice(voice.samples[0].text, voice).passed).toBe(true);
    writeFileSync(join(cwd, 'many.md'), Array.from({ length: 60 }, (_, i) => 'I built a local tool for task ' + i + '.').join('\n\n'));
    expect(learnVoice(cwd, ['many.md']).samples).toHaveLength(50);
    writeFileSync(join(cwd, '.launch/voice.json'), '{}');
    expect(() => loadVoice(cwd)).toThrow('voice:');
    expect(splitSamples('window.YTD.tweets.part0 = [{"tweet":{"full_text":"I made this local tool."}}];')).toEqual(['I made this local tool.']);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

it('flags stock patterns and padding but not empty or ordinary prose', () => {
  expect(aiTells('', 'x')).toEqual([]);
  expect(aiTells('I built a local tool.', 'x')).toEqual([]);
  expect(aiTells("In today's fast-paced world, delve into a game-changer. Not just X, but Y. Quickly, safely, and smoothly — a — b.", 'x').map(i => i.rule))
    .toEqual(expect.arrayContaining(['ai-tells.fast-paced', 'ai-tells.delve', 'ai-tells.game-changer', 'ai-tells.not-just', 'ai-tells.rule-of-three', 'ai-tells.em-dash']));
});

it('requires relevant sourced citations for counts and praise and honest identity', () => {
  const product = { name: 'tool', features: [], claims: [
    { id: 'count', text: '100 users', sources: [{ type: 'file', ref: 'metrics.csv' }] },
    { id: 'praise', text: 'I love this tool', sources: [{ type: 'file', ref: 'permission.txt' }] }
  ] };
  expect(honesty('', product, false)).toEqual([]);
  expect(honesty('We have 100 users [claim:count].', product, false)).toEqual([]);
  expect(honesty('We have 1000 users [claim:count].', product, false)[0].rule).toBe('honesty.unsupported-count');
  expect(honesty('"I love this tool" [claim:praise].', product, false)).toEqual([]);
  expect(honesty('"The best tool ever".', product, false)[0].rule).toBe('honesty.testimonial');
  expect(honesty('As a happy customer I recommend this.', product, false).some(i => i.rule === 'honesty.posing-as-customer')).toBe(true);
  expect(honesty('Try this.', product, true)[0].rule).toBe('honesty.affiliation');
  expect(honesty('I built this.', product, true)).toEqual([]);
  expect(honesty('', product, false, 'other', 'mine')[0].rule).toBe('honesty.account');
});

it.each(['cli-tool', 'mobile-expo', 'saas-next'])('phase 2b gate: %s', async fixture => {
  const cwd = mkdtempSync(join(tmpdir(), 'voice-gate-'));
  try {
    cpSync(join(packageRoot(), 'fixtures', fixture), cwd, { recursive: true });
    for (const check of checks) await check.run({ cwd, fixture });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
