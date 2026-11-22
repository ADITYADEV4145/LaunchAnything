import { readFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { packageRoot } from '../core/package-root.js';
import { validateFile } from '../core/schema.js';
import { loadPains } from '../research/index.js';
import { adapter, type Evidence, type Post } from './adapters.js';
import type { Fetch } from '../research/adapters.js';
import { allowedDate, nextDate, restrictions, restrictionTime } from './schedule.js';
import { assertSafePath } from '../copy/safe-path.js';
import { readLocal, writeLocal } from '../audience/files.js';

const path = (cwd: string, file: string) => join(cwd, '.launch/communities', file);
async function read<T>(file: string, fallback: T): Promise<T> { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw e; } }
async function save(cwd: string, file: string, value: unknown) { writeLocal(cwd, path(cwd, file), JSON.stringify(value, null, 2)); }
const subFor = (url: string) => { const u = new URL(url); return /^(www\.|old\.|oauth\.)?reddit\.com$/.test(u.hostname) ? /^\/r\/(\w+)/i.exec(u.pathname)?.[1]?.toLowerCase() : undefined; };
const normalize = (s: string) => s.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/\p{Pd}/gu, '-').replace(/\s+/gu, ' ').trim().toLowerCase();
const asksForSolution = (p: Post) => !/^\s*(?:show|launch)\s+hn\b/i.test(p.title) && (/^\s*ask\s+hn\b/i.test(p.title) || /is there a (tool|way)|looking for|alternative to|how do (you|i)|recommend|\?/i.test(p.title + ' ' + (p.selftext ?? '')));
const rulebook = parse(readFileSync(join(packageRoot(), 'rules/communities.yaml'), 'utf8')) as Record<string, string[]>;
const prohibited = Object.values(parse(readFileSync(join(packageRoot(), 'rules/audience.yaml'), 'utf8')).prohibited as Record<string, string>).map(s => new RegExp(s, 'iu'));
export async function importEvidence(cwd: string, file: string) {
  const data = JSON.parse(await readFile(file, 'utf8')) as Evidence;
  const check = validateFile('community-evidence', data); if (!check.valid) throw new Error(check.errors.join('; '));
  await save(cwd, `raw/reddit/${data.subreddit.toLowerCase()}.json`, data); return { imported: data.subreddit };
}
export async function fetchCommunities(cwd: string, queries: string[] = [], options: { fetch?: Fetch; env?: NodeJS.ProcessEnv } = {}) {
  const pains = await loadPains(cwd); const api = adapter(cwd, options);
  const urls = pains.pains.flatMap(p => p.quotes.map(q => q.url));
  const subs = new Set(urls.map(subFor).filter((s): s is string => Boolean(s)));
  const hn: Post[] = []; const hits: Post[] = [];
  for (const query of [...new Set(queries.length ? queries : [...pains.pains.map(p => p.name), pains.idea])]) {
    if (!query.trim()) throw new Error('Queries must be nonempty');
    hn.push(...await api.hn(query));
    if (api.hasReddit) hits.push(...await api.search(query));
  }
  for (const hit of hits) { const sub = subFor(hit.url); if (sub) subs.add(sub); }
  if (api.hasReddit) {
    await save(cwd, 'founder-api.json', await api.founder());
    for (const sub of subs) { const file = path(cwd, `raw/reddit/${sub}.json`); if (!await read(file, null)) { const evidence = await api.subreddit(sub, hits.filter(p => subFor(p.url) === sub)); const check = validateFile('community-evidence', evidence); if (!check.valid) throw new Error(check.errors.join('; ')); await save(cwd, `raw/reddit/${sub}.json`, evidence); } }
  }
  await save(cwd, 'hn.json', hn);
  const other = [...new Set(urls.filter(u => !subFor(u)))].map(url => ({ url, host: new URL(url).hostname, kind: new URL(url).hostname === 'news.ycombinator.com' ? 'hn' : new URL(url).hostname === 'github.com' ? 'github' : 'other' }));
  await save(cwd, 'other.json', other);
  const needsBrowser = [];
  for (const sub of subs) if (!await read(path(cwd, `raw/reddit/${sub}.json`), null)) needsBrowser.push({ subreddit: sub, urls: [`https://old.reddit.com/r/${sub}/about/rules`, `https://old.reddit.com/r/${sub}/about`, `https://old.reddit.com/r/${sub}/top?t=month`], file: `.launch/communities/raw/reddit/${sub}.json` });
  return { needsBrowser, other, note: 'Nothing posted or sent. Use your agent browser to capture missing evidence and import it.' };
}
type Verdict = 'allowed' | 'restricted' | 'forbidden' | 'unknown';
export function scoreEvidence(e: Evidence, names: string[], quotes: string[], founder: { karma?: number; accountAgeDays?: number }, timezone: string) {
  const matches = (p: Post) => names.some(name => { const text = normalize(p.title + ' ' + (p.selftext ?? '')); const terms = normalize(name).match(/[\p{L}\p{N}]{4,}/gu) ?? []; return text.includes(normalize(name)) || terms.length > 0 && terms.every(t => text.includes(t)); });
  const quoteUrls = quotes.filter(u => subFor(u) === e.subreddit.toLowerCase());
  const fetchedUrls = [...new Set([...e.topPosts, ...(e.searchHits ?? [])].filter(matches).map(p => p.url))];
  const matchedUrls = [...new Set([...quoteUrls, ...fetchedUrls])];
  const painMentions = quoteUrls.length + fetchedUrls.length;
  let selfPromotion: Verdict = 'unknown'; let citedRules: Evidence['rules'] = [];
  for (const verdict of ['forbidden', 'restricted', 'allowed'] as const) { const found = e.rules.filter(r => rulebook[verdict]!.some(s => new RegExp(s, 'i').test(r.short_name + '\n' + r.description))); if (found.length) { selfPromotion = verdict; citedRules = found; break; } }
  const text = e.rules.map(r => r.short_name + ' ' + r.description).join('\n');
  const karma = Math.max(0, ...[...text.matchAll(/(\d+)\s+(?:comment\s+)?karma/gi)].map(m => Number(m[1])));
  const age = Math.max(0, ...[...text.matchAll(/account\s+(?:must be\s+)?(?:at least\s+)?(\d+)\s+(days|months)/gi)].map(m => Number(m[1]) * (m[2]!.toLowerCase() === 'months' ? 30 : 1)));
  const eligibility = (karma && founder.karma === undefined || age && founder.accountAgeDays === undefined) ? 'unknown' : (founder.karma ?? 0) < karma || (founder.accountAgeDays ?? 0) < age ? 'fails' : 'meets';
  const hours = new Map<string, number>();
  for (const p of e.topPosts) { const hour = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(p.created_utc * 1000)); hours.set(hour, (hours.get(hour) ?? 0) + Math.max(0, p.score)); }
  const comments = e.topPosts.map(p => p.num_comments).sort((a, b) => a - b); const mid = Math.floor(comments.length / 2);
  const medianComments = comments.length ? comments.length % 2 ? comments[mid]! : (comments[mid - 1]! + comments[mid]!) / 2 : null;
  // Pain evidence dominates (10/mention); observed discussion adds up to 20; permission adds 20/10; ineligibility subtracts 50.
  const score = painMentions * 10 + Math.min(20, medianComments ?? 0) + (selfPromotion === 'allowed' ? 20 : selfPromotion === 'restricted' ? 10 : 0) - (eligibility === 'fails' ? 50 : 0);
  return { subreddit: e.subreddit, score, painMentions, matchedUrls, activity: { subscribers: e.about.subscribers, activeUsers: e.about.active_user_count ?? null, topPostsMonth: e.topPosts.length, medianComments }, selfPromotion, citedRules, rulesUrl: e.rulesUrl, requirements: { karma, accountAgeDays: age, monthConvention: '30 days' }, eligibility, flairRequired: e.postRequirements?.is_flair_required ?? (/flair.*required|required.*flair/i.test(text) ? true : 'unknown'), bestHours: [...hours].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([h]) => `${h}:00 ${timezone}`), asking: (e.searchHits ?? []).filter(p => matches(p) && /is there a (tool|way)|looking for|alternative to|how do (you|i)|recommend|\?/i.test(p.title + ' ' + (p.selftext ?? ''))) };
}
type Scored = ReturnType<typeof scoreEvidence>;
interface OtherCommunity { url: string; host: string; kind: string }
export interface Report { subreddits: Scored[]; recommended: string[]; plan: { subreddit: string; date: string; time?: string; timezone?: string; destination?: string; angle: string; variant: string; file: string }[]; threads: (Post & { file: string })[]; other: OtherCommunity[] }
async function draft(cwd: string, file: string, body: string) { const target = path(cwd, file); const existing = readLocal(cwd, target); if (existing !== undefined) return existing; writeLocal(cwd, target, body); return body; }
export async function checkCommunities(cwd: string, supplied?: Report) {
  const data = supplied ?? await read<Report | null>(join(cwd, '.launch/communities.json'), null); const errors: string[] = [];
  if (!data) return { valid: false, errors: ['Missing communities.json'] };
  const schema = validateFile('communities', data); errors.push(...schema.errors); if (!schema.valid) return { valid: false, errors };
  for (const sub of data.recommended) { const s = data.subreddits.find(s => s.subreddit === sub); if (!s || !s.citedRules.length || !s.rulesUrl || !Number.isInteger(s.painMentions) || s.painMentions < 1) errors.push(`${sub}: missing cited rule or positive pain count`); }
  for (const p of data.plan) {
    const s = data.subreddits.find(s => s.subreddit === p.subreddit);
    if (!s || !['allowed', 'restricted'].includes(s.selfPromotion) || s.eligibility === 'fails' || s.painMentions < 1) { errors.push(`${p.subreddit}: not eligible for posting`); continue; }
    const limit = restrictions(s.citedRules, p.timezone ?? 'UTC');
    if (!allowedDate(p.date, limit.days)) errors.push(`${p.subreddit}: posting day violates cited rule`);
    if (limit.megathread && p.destination !== 'megathread') errors.push(`${p.subreddit}: must post in the megathread`);
    if (limit.start !== undefined) {
      const minute = p.time && /^\d{2}:\d{2}$/.test(p.time) ? Number(p.time.slice(0, 2)) * 60 + Number(p.time.slice(3)) : -1;
      const inWindow = limit.end! < limit.start ? minute >= limit.start || minute <= limit.end! : minute >= limit.start && minute <= limit.end!;
      if (minute < 0 || !inWindow) errors.push(`${p.subreddit}: posting time violates cited rule`);
    }
  }
  if (new Set(data.plan.map(p => p.date)).size !== data.plan.length) errors.push('More than one subreddit per day');
  if (data.threads.length > 10) errors.push('More than 10 replies');
  if (new Set(data.threads.map(t => t.url)).size !== data.threads.length) errors.push('Duplicate thread URL');
  const idea = (await loadPains(cwd)).idea;
  for (const thread of data.threads) {
    if (!/^replies\/[a-f0-9]+\.md$/.test(thread.file)) continue;
    if (data.subreddits.find(s => s.subreddit.toLowerCase() === subFor(thread.url))?.selfPromotion !== 'forbidden') continue;
    const body = await readFile(path(cwd, thread.file), 'utf8').catch(() => '');
    if (/https?:\/\/|www\.|\]\(/i.test(body) || normalize(body).includes(normalize(idea))) errors.push(`Forbidden community reply promotes: ${thread.file}`);
  }
  const seen = new Set<string>();
  for (const item of [...data.plan, ...data.threads]) { if (!/^(posts\/[\w]+|replies\/[a-f0-9]+)\.md$/.test(item.file)) { errors.push('Unsafe draft path'); continue; } let body: string; try { body = await readFile(path(cwd, item.file), 'utf8'); } catch { errors.push(`Missing draft ${item.file}`); continue; } const n = normalize(body); if (seen.has(n)) errors.push('Identical drafts'); seen.add(n); if (prohibited.some(p => p.test(body))) errors.push(`Prohibited pattern: ${item.file}`); }
  return { valid: !errors.length, errors };
}
export async function reportCommunities(cwd: string) {
  for (const file of ['.launch/communities.json', '.launch/communities.md', '.launch/communities/replies', '.launch/communities/posts']) assertSafePath(cwd, join(cwd, file));
  const pains = await loadPains(cwd); const config = await read<{ timezone?: string; launchDate?: string }>(join(cwd, '.launch/config.json'), {});
  const founder = await read(path(cwd, 'founder-api.json'), await read<{ reddit?: { karma?: number; accountAgeDays?: number } }>(path(cwd, 'founder.json'), {}));
  const timezone = config.timezone ?? 'UTC'; const evidence: Evidence[] = [];
  let files: string[] = []; try { files = await readdir(path(cwd, 'raw/reddit')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  for (const file of files.filter(f => f.endsWith('.json'))) { const value = await read<Evidence | null>(path(cwd, 'raw/reddit/' + file), null); const check = validateFile('community-evidence', value); if (!check.valid) throw new Error(check.errors.join('; ')); evidence.push(value!); }
  const names = pains.pains.map(p => p.name); const quotes = pains.pains.flatMap(p => p.quotes.map(q => q.url));
  const subreddits = evidence.map(e => scoreEvidence(e, names, quotes, founder.reddit ?? {}, timezone)).sort((a, b) => Number(a.selfPromotion === 'forbidden') - Number(b.selfPromotion === 'forbidden') || b.score - a.score || a.subreddit.localeCompare(b.subreddit));
  const eligible = subreddits.filter(s => ['allowed', 'restricted'].includes(s.selfPromotion) && s.eligibility !== 'fails' && s.painMentions > 0).slice(0, 5);
  const plan: Report['plan'] = [];
  let date = config.launchDate ?? new Date().toISOString().slice(0, 10);
  for (const [i, sub] of eligible.entries()) {
    const limit = restrictions(sub.citedRules, timezone);
    while (!allowedDate(date, limit.days)) date = nextDate(date);
    const file = `posts/${sub.subreddit}.md`;
    const variant = sub.selfPromotion === 'allowed' ? 'standard' : 'value-first';
    const destination = limit.megathread ? 'megathread' : 'standalone post';
    const angle = `${names[i % names.length] ?? pains.idea}: lesson for r/${sub.subreddit}`;
    await draft(cwd, file, `Not sent. Founder posts by hand. One subreddit per day.\n\n# ${angle}\n\nDestination: ${destination}. Follow the cited rule and verify the current thread before posting.\n\nI'm Aditya and I built ${pains.idea}.\n\n${variant === 'value-first' ? 'Lesson to share (edit before posting): describe the workaround, what failed, and a reproducible improvement. No product link; add one only after verifying the cited rule allows it.' : 'Share a concrete example and useful steps for this community before describing the project.'}\n\nCommunity context: r/${sub.subreddit}. Edit this draft to address the readers’ specific problem.\n`);
    plan.push({ subreddit: sub.subreddit, date, time: restrictionTime(limit.start), timezone: limit.timezone, destination, angle, variant, file });
    date = nextDate(date);
  }
  const hn = await read<Post[]>(path(cwd, 'hn.json'), []);
  const hnAsking = hn.filter(p => asksForSolution(p) && names.some(n => normalize(p.title + ' ' + (p.selftext ?? '')).includes(normalize(n))));
  const unique = [...new Map([...subreddits.filter(s => s.selfPromotion !== 'forbidden').flatMap(s => s.asking), ...hnAsking].map(p => [p.url, p])).values()].slice(0, 10);
  const threads: Report['threads'] = [];
  for (const p of unique) {
    const file = `replies/${createHash('sha256').update(p.url).digest('hex').slice(0, 12)}.md`;
    await draft(cwd, file, `Not sent. Send by hand, max 10/day\n\nSource: ${p.url}\n\nYou asked: ${p.title}\n\nI'm Aditya and I built ${pains.idea}, so I have a stake in this problem. Before choosing a tool, I'd pick one concrete task from your question and test it against your current workflow. Check whether the result is actually useful, what context it needed, and where it still needs manual correction. That should make the trade-offs easier to compare without relying on a demo.\n\nWhat have you tried so far, and where does it break down?\n\n[Edit before sending: add a specific, verified answer to the question above. Don't claim the project solves something you haven't tested. Link only if community rules permit.]\n`);
    threads.push({ ...p, file });
  }
  const data: Report = { subreddits, recommended: eligible.map(s => s.subreddit), plan, threads, other: await read(path(cwd, 'other.json'), []) };
  const check = await checkCommunities(cwd, data); if (!check.valid) throw new Error(check.errors.join('; '));
  const citation = (s: Scored) => s.citedRules.map(r => `> ${r.short_name}: ${r.description}\n> [Rules](${s.rulesUrl})`).join('\n') || 'No matching rule: manual review required.';
  const lines = ['# Communities', '', 'Nothing posted or sent. All drafts require founder editing and manual sending. Max 10 replies/day.', '', '## Top 5 subreddits'];
  if (!eligible.length) lines.push('No subreddit evidence yet: set REDDIT_ACCESS_TOKEN or capture rules in the agent browser, then `liftoff communities import`.');
  for (const s of eligible) {
    const hasRequirement = s.requirements.karma > 0 || s.requirements.accountAgeDays > 0;
    const requirement = hasRequirement ? `${s.eligibility} (requires ${s.requirements.karma} karma, ${s.requirements.accountAgeDays} days; months interpreted as 30 days)` : 'no stated karma/age requirement';
    const accountNote = hasRequirement && s.eligibility === 'unknown' ? ' Verify your account meets it before posting. Fill .launch/communities/founder.json with {"reddit":{"karma":YOUR_KARMA,"accountAgeDays":YOUR_ACCOUNT_AGE_DAYS}} or set REDDIT_ACCESS_TOKEN and fetch again.' : '';
    lines.push('', `### r/${s.subreddit}`, `Score: ${s.score}; pain count: ${s.painMentions}. Members: ${s.activity.subscribers}; active users: ${s.activity.activeUsers ?? 'unknown'}; top posts/month: ${s.activity.topPostsMonth}; median comments: ${s.activity.medianComments ?? 'unknown'}.`, `Self-promo: ${s.selfPromotion}`, citation(s), `Karma/age: ${requirement}.${accountNote} Flair: ${s.flairRequired === true ? 'required' : s.flairRequired === false ? 'not required' : 'unknown'}. Best observed hours: ${s.bestHours.join(', ') || 'unknown'}.`);
  }
  const section = (title: string, entries: string[]) => lines.push('', `## ${title}`, ...(entries.length ? entries : ['None.']));
  section('Low signal', subreddits.filter(s => s.painMentions < 1).map(s => `- r/${s.subreddit}: pain count 0; not recommended.`));
  section('Do not post', subreddits.filter(s => s.selfPromotion === 'forbidden').map(s => `### r/${s.subreddit}\n${citation(s)}`));
  section('Needs manual review', subreddits.filter(s => s.selfPromotion === 'unknown').map(s => `- r/${s.subreddit}: no matching promotion rule; pain count ${s.painMentions}. [Rules](${s.rulesUrl})`));
  const hnCount = new Set(data.other.filter(o => o.kind === 'hn').map(o => o.url)).size;
  section('Other communities', [
    ...(hnCount ? [`- [Hacker News](https://news.ycombinator.com/) — news.ycombinator.com (hn); ${hnCount} cited thread${hnCount === 1 ? '' : 's'}.`] : []),
    ...data.other.filter(o => o.kind !== 'hn').map(o => `- [${o.host}](${o.url}) — ${o.kind}`),
  ]);
  section('Threads asking for this', threads.map(p => `- [${p.title}](${p.url}) — [editable reply](communities/${p.file})`));
  section('Cross-post plan', plan.map(p => `- ${p.date}${p.time ? ` ${p.time} ${p.timezone}` : ''}: r/${p.subreddit} — ${p.angle}; ${p.variant}; ${p.destination}; [editable draft](communities/${p.file})`));
  const markdown = lines.join('\n') + '\n'; writeLocal(cwd, join(cwd, '.launch/communities.json'), JSON.stringify(data, null, 2)); writeLocal(cwd, join(cwd, '.launch/communities.md'), markdown); return { path: '.launch/communities.md', markdown, ...check };
}
