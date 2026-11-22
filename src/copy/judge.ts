import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { assertSafePath, atomicWrite } from './safe-path.js';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { context, type Product } from './context.js';
import { inspectPost, parsePost, type Post } from './check.js';
import { annotate, grounded, splitSentences } from './citations.js';
import { guidelineIssues, loadExemplars, loadVoiceGuidelines } from './guides.js';
import { openingSentence } from './template.js';
import { blindFeedback } from './blind-test.js';
import { loadVoice } from '../voice/learn.js';
import { scoreVoice } from '../voice/score.js';
import { aiTells } from '../voice/ai-tells.js';

export const criteria = ['hook', 'specificity', 'proof', 'native', 'clarity', 'voice'] as const;
export type Criterion = typeof criteria[number];
export type Scores = Record<Criterion, number>;
export const threshold = 8, maxLoops = 3;
export const rubric: Record<Criterion, string> = {
  hook: 'The first line names a pain the reader has or the strongest proof number, and makes them want the next line.',
  specificity: 'Numbers, names, commands and before/after replace adjectives; nothing could be pasted onto another product.',
  proof: 'Every claim a skeptic would doubt is backed by a cited fact, metric or quote.',
  native: 'Reads like a top post on this channel: its format, length, sections and etiquette.',
  clarity: 'A stranger knows what it is, who it is for and how to try it after one read.',
  voice: 'Sounds like a founder talking to a peer: plain words, honest limits, no hype, no AI tells.',
};
export interface Verdict {
  channel: string; sourceHash: string; source: 'model' | 'local'; judge?: string; scores: Scores; local: Scores;
  reasons: string[]; attempts: number; status: 'pass' | 'rewrite' | 'flagged';
}
const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n)));

export function localScores(post: Post, channel: string, product: Product, cwd: string) {
  const issues = inspectPost(post, channel, product, cwd), reasons: string[] = [];
  const has = (prefix: string) => issues.filter(i => i.rule.startsWith(prefix));
  const g = grounded(product);
  const body = annotate(post.body.replace(/```[\s\S]*?```/g, ''), post.citations, g);
  const sentences = splitSentences(body).filter(s => !/^#/.test(s));
  const visible = (s: string) => s.replace(/\s*\[claim:[^\]]+\]/g, '');
  const opener = visible(openingSentence(body, channel));
  let hook = 10 - 4 * has('opener.banned').length - 3 * has('opener.grounded').length;
  if (opener.split(/\s+/).length > 25) { hook -= 2; reasons.push('hook: the first sentence runs over 25 words'); }
  if (!/\d/.test(opener) && !/\[claim:pain:/.test(openingSentence(body, channel))) hook -= 1;
  const concrete = sentences.filter(s => /\[claim:/.test(s) || /\d|`|\b[A-Z]{2,}\b|\b[A-Z][a-z]{2,}/.test(visible(s).replace(/^\S+\s*/, ''))).length;
  const share = concrete / Math.max(1, sentences.length);
  const hype = guidelineIssues(post.body, splitSentences(post.body)).filter(i => i.rule === 'voice.hype').length;
  const target = /^(devto|blog|press-release|github-release)$/.test(channel) ? 0.25 : 0.5;
  const specificity = 4 + 6 * Math.min(1, share / target) - 2 * hype;
  if (share < target) reasons.push('specificity: only ' + Math.round(share * 100) + '% of sentences carry a number, name or citation');
  const cited = new Set([...body.matchAll(/\[claim:([^\]]+)\]/g)].map(m => m[1]));
  const proof = [2, 6, 8, 10][Math.min(3, cited.size)] - ([...cited].some(id => id.startsWith('proof:')) ? 0 : 2);
  if (![...cited].some(id => id.startsWith('proof:'))) reasons.push('proof: no proof metric is cited');
  const formatIssues = issues.filter(i => /^(template|variants|title|tagline|body|thread|hook|links|maker-comment|gallery|reddit)\./.test(i.rule));
  const native = 10 - 2 * formatIssues.length;
  for (const issue of formatIssues.slice(0, 3)) reasons.push('native: ' + issue.message);
  const words = sentences.map(s => visible(s).split(/\s+/).length);
  const average = words.reduce((a, b) => a + b, 0) / Math.max(1, words.length);
  const clarity = (average <= 15 ? 10 : average <= 20 ? 9 : average <= 25 ? 7 : 5) - (post.link || /https?:\/\//.test(post.body) ? 0 : 2);
  if (average > 20) reasons.push('clarity: average sentence is ' + Math.round(average) + ' words');
  const learned = loadVoice(cwd);
  const tells = aiTells(post.title + '\n' + post.body, channel).length;
  const guide = guidelineIssues(post.body, splitSentences(post.body)).length;
  const voice = learned ? scoreVoice(post.body, learned, channel).score / 10 - tells : 10 - 2 * guide - 2 * tells;
  if (tells) reasons.push('voice: ' + tells + ' AI-style phrase(s)');
  if (!learned && guide) reasons.push('voice: ' + guide + ' founder-voice guideline issue(s)');
  for (const issue of has('opener.')) reasons.push('hook: ' + issue.message);
  return { scores: { hook: clamp(hook), specificity: clamp(specificity), proof: clamp(proof), native: clamp(native), clarity: clamp(clarity), voice: clamp(voice) }, reasons };
}

const judgeDir = (posts: string) => join(posts, 'judge');
function brief(cwd: string, channel: string, post: Post, sourceHash: string) {
  const exemplars = loadExemplars(channel, cwd), feedback = blindFeedback(cwd, channel), guide = loadVoiceGuidelines();
  return ['# Judge brief: ' + channel,
    'You are the judge, not the writer. Score this draft against the rubric below, 0-10 each. Be strict: 8 means you would post it unchanged on ' + channel + '.',
    '## Rubric', criteria.map(c => '- ' + c + ': ' + rubric[c]).join('\n'),
    '## What good looks like on this channel', exemplars.patterns.map(p => '- ' + p).join('\n'),
    exemplars.examples.slice(0, 3).map(e => '- ' + e.title + ' — ' + e.url).join('\n'),
    ...(feedback.length ? ['## Blind testers said these were missing from earlier drafts', feedback.map(f => '- ' + f).join('\n')] : []),
    '## Voice rules', guide.rules.map(r => '- ' + r.rule).join('\n'),
    '## Draft', '```markdown\n---\n' + 'title: ' + post.title + '\n---\n' + post.body + '\n```',
    '## Your answer',
    'Write .launch/posts/judge/' + channel + '.scores.json as JSON: {"sourceHash": "' + sourceHash + '", "judge": "<model or person>", "scores": {' + criteria.map(c => '"' + c + '": 0').join(', ') + '}, "reasons": ["<one line per score under 8: what to change>"]}',
    'Then run liftoff judge again.'].join('\n\n') + '\n';
}

function modelScores(path: string, sourceHash: string): { scores: Scores; reasons: string[]; judge?: string } | undefined {
  if (!existsSync(path)) return;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (data.sourceHash !== sourceHash) return;
    if (!criteria.every(c => Number.isFinite(data.scores?.[c]) && data.scores[c] >= 0 && data.scores[c] <= 10)) return;
    return { scores: Object.fromEntries(criteria.map(c => [c, Number(data.scores[c])])) as Scores,
      reasons: Array.isArray(data.reasons) ? data.reasons.map(String) : [], judge: typeof data.judge === 'string' ? data.judge : undefined };
  } catch { return; }
}

export function readJudgments(postsDir: string): Verdict[] {
  const path = join(postsDir, 'judge.json');
  if (!existsSync(path)) return [];
  try { const data = JSON.parse(readFileSync(path, 'utf8')); return Array.isArray(data.posts) ? data.posts : []; } catch { return []; }
}

export function judgePosts(cwd: string, selected?: string[]) {
  const ctx = context(cwd, selected), dir = judgeDir(ctx.paths.posts);
  for (const path of [dir, join(dir, 'fixes.md'), join(ctx.paths.posts, 'judge.json')]) assertSafePath(cwd, path);
  mkdirSync(dir, { recursive: true });
  const previous = new Map(readJudgments(ctx.paths.posts).map(v => [v.channel, v]));
  const verdicts: Verdict[] = [], skipped: string[] = [];
  for (const channel of ctx.channels) {
    const path = join(ctx.paths.posts, channel + '.md');
    if (!existsSync(path)) { skipped.push(channel); continue; }
    const source = readFileSync(path);
    const sourceHash = createHash('sha256').update(source).digest('hex');
    const post = parsePost(source.toString('utf8'));
    atomicWrite(cwd, join(dir, channel + '.md'), brief(cwd, channel, post, sourceHash));
    const local = localScores(post, channel, ctx.product, cwd);
    const model = modelScores(join(dir, channel + '.scores.json'), sourceHash);
    const scores = model?.scores ?? local.scores;
    const reasons = [...(model?.reasons ?? []), ...criteria.filter(c => scores[c] < threshold && !model)
      .map(c => c + ' ' + scores[c] + '/10'), ...(model ? [] : local.reasons)];
    const passed = criteria.every(c => scores[c] >= threshold);
    const last = previous.get(channel);
    const attempts = passed ? 0 : last && last.sourceHash === sourceHash ? Math.max(1, last.attempts) : (last?.attempts ?? 0) + 1;
    verdicts.push({ channel, sourceHash, source: model ? 'model' : 'local', judge: model?.judge, scores, local: local.scores,
      reasons: passed ? [] : [...new Set(reasons)], attempts, status: passed ? 'pass' : attempts >= maxLoops ? 'flagged' : 'rewrite' });
  }
  for (const verdict of verdicts) previous.set(verdict.channel, verdict);
  atomicWrite(cwd, join(ctx.paths.posts, 'judge.json'), JSON.stringify({ threshold, maxLoops,
    posts: [...previous.values()].sort((a, b) => a.channel.localeCompare(b.channel)) }, null, 2) + '\n');
  const rewrite = verdicts.filter(v => v.status === 'rewrite');
  const fixes = join(dir, 'fixes.md');
  atomicWrite(cwd, fixes, rewrite.length ? '# Judge rewrite list\n\n' + rewrite.map(v => '## ' + v.channel + ' (loop ' + v.attempts + ' of ' + maxLoops + ')\n'
    + v.reasons.map(r => '- ' + r).join('\n')).join('\n\n') + '\n' : '# Judge rewrite list\n\nNothing to rewrite.\n');
  return { passed: !skipped.length && verdicts.every(v => v.status === 'pass'), verdicts, skipped, rewrite: rewrite.map(v => v.channel),
    flagged: verdicts.filter(v => v.status === 'flagged').map(v => v.channel), fixes };
}
