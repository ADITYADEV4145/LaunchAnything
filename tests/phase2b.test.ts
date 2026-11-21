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
import { inspectPost } from '../src/copy/check.js';

it('keeps title praise separate from body citations when checking a post', () => {
  const product = { name: 'Tool', features: [], claims: [
    { id: 'count', text: '100 users', sources: [{ type: 'file', ref: 'metrics.csv' }] },
    { id: 'praise', text: 'Users love Tool', sources: [{ type: 'file', ref: 'feedback.txt' }] }
  ] };
  const post = { channel: 'x', title: 'Users love Tool', body: '100 users [claim:count]', claims: ['count', 'praise'], media: [] };
  const issues = inspectPost(post, 'x', product);
  expect(issues.some(i => i.rule === 'honesty.testimonial')).toBe(true);
  expect(issues.some(i => i.rule === 'honesty.unsupported-count')).toBe(false);
  expect(inspectPost({ ...post, title: 'Users love Tool [claim:praise]' }, 'x', product).some(i => i.rule === 'honesty.testimonial')).toBe(false);
  expect(inspectPost({ ...post, title: '' }, 'x', product).some(i => i.rule.startsWith('honesty.'))).toBe(false);
});

it('associates soft-wrapped citations with their factual sentence, not other paragraphs', () => {
  const product = { name: 'Tool', features: [], claims: [
    { id: 'count', text: '100 users', sources: [{ type: 'file', ref: 'metrics.csv' }] }
  ] };
  for (const text of ['100 users\n[claim:count]', '100 users.\n[claim:count]', '100 users\r\n[claim:count]'])
    expect(honesty(text, product, false)).toEqual([]);
  expect(honesty('100 users\n\n[claim:count]', product, false)[0].rule).toBe('honesty.unsupported-count');
  expect(honesty('100 users. Unrelated sentence [claim:count].', product, false)[0].rule).toBe('honesty.unsupported-count');
});

it('learns bounded owned samples, validates stored profiles, rejects empty and missing inputs', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'voice-'));
  try {
    expect(() => learnVoice(cwd, [])).toThrow('20');
    expect(() => learnVoice(cwd, ['missing.md'])).toThrow('No samples');
    expect(splitSamples('[invalid')).toEqual([]);
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

it('learns Markdown beginning with links while preserving structured archive validation', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'voice-markdown-'));
  try {
    const samples = Array.from({ length: 20 }, (_, i) => `[My launch](https://example.test) I built this local tool for task ${i}.`);
    writeFileSync(join(cwd, 'samples.md'), samples.join('\n\n'));
    expect(splitSamples(samples[0])).toEqual([samples[0]]);
    expect(learnVoice(cwd, ['samples.md']).samples).toHaveLength(20);
    expect(splitSamples('')).toEqual([]);
    expect(splitSamples('[{"text":"My actual exported post"}]')).toEqual(['My actual exported post']);
    expect(() => splitSamples('{"tweets":false}')).toThrow('Expected an X archive');
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
  expect(honesty('As a happy customer of this tool I recommend it.', product, false).some(i => i.rule === 'honesty.posing-as-customer')).toBe(true);
  expect(honesty('Try this.', product, true)[0].rule).toBe('honesty.affiliation');
  expect(honesty('I built this.', product, true)).toEqual([]);
  expect(honesty('', product, false, 'other', 'mine')[0].rule).toBe('honesty.account');
});

it('limits customer impersonation to statements about the launch product', () => {
  const product = { name: 'Backup+', features: [], claims: [] };
  for (const text of ['As a user of SQLite, I needed better backups', 'As a paying customer of OtherApp, I built Backup+.', 'I purchased this laptop.', ''])
    expect(honesty(text, product, false)).toEqual([]);
  for (const text of ['As a user of Backup+, I recommend it.', 'As a happy customer of this app, I recommend it.', 'I purchased this product.', 'I bought Backup+.'])
    expect(honesty(text, product, false).some(i => i.rule === 'honesty.posing-as-customer')).toBe(true);
});

it('detects soft-wrapped customer statements without flagging other tools', () => {
  const product = { name: 'Tool', features: [], claims: [] };
  for (const text of ['As a customer of\nTool, I recommend it.', 'As\r\na\tpaying customer\nof this\napp, I recommend it.', 'I purchased\nthis tool.'])
    expect(honesty(text, product, false).some(i => i.rule === 'honesty.posing-as-customer')).toBe(true);
  for (const text of ['', 'As a user of\nSQLite, I needed better backups.', 'As a customer of\nToolbox, I needed better backups.'])
    expect(honesty(text, product, false).some(i => i.rule === 'honesty.posing-as-customer')).toBe(false);
});

it('requires full count tokens instead of matching numeric suffixes in cited claims', () => {
  const product = { name: 'Tool', features: [], claims: [
    { id: 'count', text: 'We have 15 users.', sources: [{ type: 'file', ref: 'metrics.csv' }] }
  ] };
  expect(honesty('15 users [claim:count]', product, false)).toEqual([]);
  expect(honesty('', product, false)).toEqual([]);
  expect(honesty('5 users [claim:count]', product, false)[0].rule).toBe('honesty.unsupported-count');
  for (const count of ['1,005 users', '1.5 users', '25 users']) {
    const other = { ...product, claims: [{ ...product.claims[0], text: count }] };
    expect(honesty('5 users [claim:count]', other, false)[0].rule).toBe('honesty.unsupported-count');
  }
  expect(honesty('15 users [claim:missing]', product, false)[0].rule).toBe('honesty.unsupported-count');
});

it.each(['cli-tool', 'mobile-expo', 'saas-next'])('phase 2b gate: %s', async fixture => {
  const cwd = mkdtempSync(join(tmpdir(), 'voice-gate-'));
  try {
    cpSync(join(packageRoot(), 'fixtures', fixture), cwd, { recursive: true });
    for (const check of checks) await check.run({ cwd, fixture });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
