import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomInt } from 'node:crypto';
import { join } from 'node:path';
import { parsePost } from './check.js';

export const blindChannels = ['show-hn', 'x'] as const;
type Channel = typeof blindChannels[number];
type Side = 'A' | 'B';
export const plainPrompt = 'Write a Show HN post and an X thread for this repo.';
interface Answer { click: 'liftoff' | 'plain'; trust: 'liftoff' | 'plain'; missingLiftoff: string; missingPlain: string; recordedAt: string }
export interface BlindTest {
  version: 1; createdAt: string; prompt: string;
  versions: Record<Channel, { liftoffHash: string; plainHash: string }>;
  testers: { id: string; liftoffIs: Record<Channel, Side>; answers: Partial<Record<Channel, Answer>> }[];
}

const paths = (cwd: string) => {
  const root = join(cwd, '.launch', 'blind-test');
  return { root, json: join(cwd, '.launch', 'blind-test.json'), prompt: join(root, 'plain-claude-prompt.md'),
    plain: (c: Channel) => join(root, 'plain', c + '.md'), sheet: (id: string) => join(root, 'sheets', id + '.md') };
};
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const read = (cwd: string): BlindTest | undefined => {
  const path = paths(cwd).json;
  if (!existsSync(path)) return;
  const data = JSON.parse(readFileSync(path, 'utf8')) as BlindTest;
  if (data.version !== 1 || !Array.isArray(data.testers)) throw new Error('Invalid .launch/blind-test.json');
  return data;
};
const save = (cwd: string, data: BlindTest) => writeFileSync(paths(cwd).json, JSON.stringify(data, null, 2) + '\n');

/** The post as a reader sees it: no front matter, no metadata. */
function liftoffText(cwd: string, channel: Channel) {
  const path = join(cwd, '.launch', 'posts', channel + '.md');
  if (!existsSync(path)) throw new Error('Write and check .launch/posts/' + channel + '.md first');
  const post = parsePost(readFileSync(path, 'utf8'));
  return channel === 'x' ? post.body.split(/\r?\n---\r?\n/).map((p, i) => (i + 1) + '/ ' + p.trim()).join('\n\n')
    : post.title + '\n\n' + post.body.split(/^## First comment outline/m)[0].trim();
}

export function prepareBlindTest(cwd: string, testers = 5, force = false) {
  if (!Number.isInteger(testers) || testers < 3 || testers > 5) throw new Error('Use 3 to 5 testers');
  const p = paths(cwd), existing = read(cwd);
  if (existing?.testers.some(t => Object.keys(t.answers).length) && !force)
    throw new Error('Answers are already recorded; pass --force to start a new test');
  mkdirSync(join(p.root, 'plain'), { recursive: true });
  mkdirSync(join(p.root, 'sheets'), { recursive: true });
  const readme = existsSync(join(cwd, 'README.md')) ? readFileSync(join(cwd, 'README.md'), 'utf8') : '';
  if (!readme.trim()) throw new Error('README.md is required: plain Claude sees only the README');
  writeFileSync(p.prompt, '# Paste this into a fresh plain Claude chat (no tools, no project, no memory)\n\n' + plainPrompt + '\n\n' + readme.trim() + '\n');
  const missing = blindChannels.filter(c => !existsSync(p.plain(c)) || !readFileSync(p.plain(c), 'utf8').trim());
  if (missing.length) return { ready: false, prompt: p.prompt,
    next: missing.map(c => 'Save plain Claude\'s ' + (c === 'x' ? 'X thread' : 'Show HN post') + ' to ' + p.plain(c)) };
  const versions = Object.fromEntries(blindChannels.map(c => [c, {
    liftoff: liftoffText(cwd, c), plain: readFileSync(p.plain(c), 'utf8').trim() }])) as Record<Channel, { liftoff: string; plain: string }>;
  const data: BlindTest = { version: 1, createdAt: new Date().toISOString(), prompt: plainPrompt,
    versions: Object.fromEntries(blindChannels.map(c => [c, { liftoffHash: hash(versions[c].liftoff), plainHash: hash(versions[c].plain) }])) as BlindTest['versions'],
    testers: Array.from({ length: testers }, (_, i) => ({ id: 'tester-' + (i + 1),
      liftoffIs: Object.fromEntries(blindChannels.map(c => [c, randomInt(2) ? 'A' : 'B'])) as Record<Channel, Side>, answers: {} })) };
  const sheets = data.testers.map(tester => {
    const sections = blindChannels.map(c => {
      const [a, b] = tester.liftoffIs[c] === 'A' ? [versions[c].liftoff, versions[c].plain] : [versions[c].plain, versions[c].liftoff];
      return '## ' + (c === 'x' ? 'X thread' : 'Show HN post') + '\n\n### Version A\n\n' + a + '\n\n### Version B\n\n' + b
        + '\n\n1. Which would you click? (A or B)\n2. Which do you trust more? (A or B)\n3. What\'s missing from A?\n4. What\'s missing from B?\n';
    });
    writeFileSync(p.sheet(tester.id), '# Blind test for ' + tester.id + '\n\nTwo versions of each post, in random order. Answer from your gut; there is no right answer.\n\n' + sections.join('\n') );
    return p.sheet(tester.id);
  });
  save(cwd, data);
  return { ready: true, prompt: p.prompt, sheets, next: ['Send one sheet to each developer, then record answers with liftoff blind-test record'] };
}

export function recordBlindTest(cwd: string, input: { tester: string; channel: string; click: string; trust: string; missingA: string; missingB: string }) {
  const data = read(cwd);
  if (!data) throw new Error('Run liftoff blind-test prepare first');
  const tester = data.testers.find(t => t.id === input.tester);
  if (!tester) throw new Error('Unknown tester; use one of ' + data.testers.map(t => t.id).join(', '));
  if (!blindChannels.includes(input.channel as Channel)) throw new Error('Channel must be show-hn or x');
  const channel = input.channel as Channel;
  const side = (value: string) => { const v = value.toUpperCase(); if (v !== 'A' && v !== 'B') throw new Error('Answer A or B'); return v as Side; };
  const who = (s: Side) => s === tester.liftoffIs[channel] ? 'liftoff' as const : 'plain' as const;
  const liftoffIsA = tester.liftoffIs[channel] === 'A';
  tester.answers[channel] = { click: who(side(input.click)), trust: who(side(input.trust)),
    missingLiftoff: (liftoffIsA ? input.missingA : input.missingB).trim(), missingPlain: (liftoffIsA ? input.missingB : input.missingA).trim(),
    recordedAt: new Date().toISOString() };
  save(cwd, data);
  return { tester: tester.id, channel, recorded: true };
}

export function tallyBlindTest(cwd: string) {
  const data = read(cwd);
  if (!data) throw new Error('Run liftoff blind-test prepare first');
  const channels = blindChannels.map(channel => {
    const answers = data.testers.map(t => t.answers[channel]).filter((a): a is Answer => !!a);
    const votes = answers.length, click = answers.filter(a => a.click === 'liftoff').length, trust = answers.filter(a => a.trust === 'liftoff').length;
    const needed = Math.ceil(votes * 0.8);
    return { channel, votes, liftoffClick: click, liftoffTrust: trust, needed,
      passed: votes >= 3 && click >= needed, missingFromLiftoff: answers.map(a => a.missingLiftoff).filter(Boolean) };
  });
  return { passed: channels.every(c => c.passed), channels,
    note: channels.some(c => c.votes < 3) ? 'Needs answers from at least 3 real developers per post.' : undefined };
}

/** What testers said was missing from Liftoff's version, fed into the next writing brief and judge rubric. */
export function blindFeedback(cwd: string, channel: string) {
  try {
    return (read(cwd)?.testers ?? []).map(t => t.answers[channel as Channel]?.missingLiftoff).filter((m): m is string => !!m);
  } catch { return []; }
}
