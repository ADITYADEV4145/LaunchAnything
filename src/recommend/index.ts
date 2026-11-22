import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { loadRule } from '../core/rules.js';
import { readJson } from '../product/files.js';
import { validateConfig, type Config } from '../product/init.js';
import { loadPlanLessons } from '../results/history.js';
import { type Pains } from '../research/index.js';
import type { Report } from '../communities/index.js';
import { nextDate, restrictions, postingWindow } from '../communities/schedule.js';
import { displayTime, parseSchedule } from '../go/schedule.js';
import { offlineProductHunt, type ProductHuntDates } from './adapters.js';
import { assertSafePath } from '../copy/safe-path.js';

interface Product {
  audience: { who: string; where?: string[] }; problem: { summary: string };
  proof?: { metric: string; source_file: string }[];
  money_moment?: { before: string; action: string; after: string };
  competitors?: { name: string; dislikes: string[] }[];
}
interface WindowRule { profiles: string[]; bestPostingDays: string[]; bestPostingTimes: string[]; sourceTimezone?: string; sourceTimes?: string[] }
export interface Scoring {
  tier: number; priority: number; profileFit: boolean; profileDefault: boolean; citedSources: number; painClusters: number;
  audienceMatches: string[]; effort: number; accountRisk: number; reachEvidence: number; potentialMembers: number | null; account: unknown;
}
const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const owned = new Set(['email', 'blog', 'github-release', 'x']);
const devtoolOrder = ['show-hn', 'devto', 'reddit', 'x', 'github-release'];
const clean = (s: string) => s.replace(/[|\r\n]/g, ' ');
async function optional<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
}
export function chooseAngle(id: string, product: Product) {
  if (id === 'reddit') return { angle: 'pain story', why: 'start a discussion of the recorded problem', asset: 'pain-story post with community disclosure' };
  if (id === 'devto' || id === 'blog') return { angle: 'technical deep dive', why: 'long-form source walkthrough', asset: 'technical article with source links' };
  const benchmark = product.proof?.find(p => /benchmark|latency|throughput|duration|elapsed|milliseconds|seconds/i.test(p.metric));
  if (id === 'show-hn' && benchmark) return { angle: 'benchmark result', why: 'technical audience can inspect the recorded metric', asset: 'benchmark chart from ' + benchmark.source_file };
  if (product.money_moment && id !== 'github-release') return { angle: 'before/after demo', why: 'demonstrate product.json money_moment', asset: id === 'email' ? 'email to waitlist with demo link' : 'before/after GIF of money moment (Part D media)' };
  if (product.competitors?.some(c => c.dislikes.length) && id === 'indie-hackers') return { angle: 'contrarian take', why: 'discuss a product.json competitor tradeoff', asset: 'source-backed tradeoff post' };
  return { angle: 'build story', why: 'explain the source-backed implementation', asset: id === 'github-release' ? 'release notes' : id === 'email' ? 'email to waitlist' : 'source-linked build notes' };
}
export async function recommend(cwd: string, options: { historyPath?: string; productHunt?: ProductHuntDates } = {}) {
  const paths = launchDir(cwd), config = await readJson<Config>(paths.config);
  assertSafePath(cwd, join(paths.root, 'recommendations.md'));
  validateConfig(config, cwd);
  const product = await readJson<Product>(paths.product);
  const pains = await optional<Pains>(join(paths.root, 'research/pains.json'), { idea: '', pains: [], competitors: [] });
  const report = await optional<Report>(join(paths.root, 'communities.json'), { subreddits: [], recommended: [], plan: [], threads: [], other: [] });
  const lessons = await loadPlanLessons(config.profile, options.historyPath);
  const defaults = loadRule('profiles', config.profile).defaultChannels as string[];
  const skip = [{ channel: 'press-release', reason: 'No press strategy or press evidence supplied by product.json; not a founder-first launch channel.' },
    { channel: 'directory-submission-services', reason: 'No audience evidence for bulk directory services; skip 500-directory packages rather than invent reach.' }];
  const candidates: { id: string; rule: WindowRule; sub: Report['subreddits'][number] | undefined; score: number; scoring: Scoring; why: string; angle: string; asset: string }[] = [];
  for (const id of [...new Set(config.channels)]) {
    if (id === 'press-release') continue;
    const rule = loadRule('channels', id, cwd) as unknown as WindowRule;
    const sub = id === 'reddit' ? report.subreddits.filter(s => report.recommended.includes(s.subreddit) && s.eligibility === 'meets' && ['allowed', 'restricted'].includes(s.selfPromotion) && s.bestHours.length && !restrictions(s.citedRules, config.timezone).manualReview).sort((a, b) => b.score - a.score || a.subreddit.localeCompare(b.subreddit))[0] : undefined;
    if (id === 'reddit' && !sub) { skip.push({ channel: id, reason: 'communities.json: no recommended subreddit with verified account eligibility, cited permission rules and observed bestHours.' }); continue; }
    const fit = rule.profiles.includes(config.profile);
    const urls = pains.pains.flatMap(p => p.quotes.map(q => q.url));
    const hosts: Record<string, string> = { 'show-hn': 'news.ycombinator.com', reddit: 'reddit.com', devto: 'dev.to', 'github-release': 'github.com', x: 'x.com', linkedin: 'linkedin.com' };
    const mentions = hosts[id] ? new Set(urls.filter(url => { try { return new URL(url).hostname.replace(/^www\.|^old\./, '') === hosts[id]; } catch { return false; } })).size : 0;
    const painClusters = hosts[id] ? pains.pains.filter(p => p.quotes.some(q => { try { return new URL(q.url).hostname.replace(/^www\.|^old\./, '') === hosts[id]; } catch { return false; } })).length : 0;
    const audience = (product.audience.where ?? []).filter(where => where.toLowerCase().includes(id) || Boolean(hosts[id] && where.includes(hosts[id])));
    const angle = chooseAngle(id, product);
    const effort = ['technical deep dive', 'benchmark result'].includes(angle.angle) ? 2 : 1;
    const risk = sub ? sub.selfPromotion === 'restricted' ? 1 : 0 : 1;
    const reach = sub && sub.activity.subscribers > 0 ? 1 : 0;
    const score = Number(fit) * 4 + Number(defaults.includes(id)) * 2 + Number(mentions > 0) * 3 + Number(audience.length > 0) * 3 + Number(Boolean(sub)) * 3 + reach - effort - risk;
    const tier = defaults.includes(id) ? 0 : fit ? 1 : 2;
    const preference = config.profile === 'devtool' ? devtoolOrder : defaults;
    const priority = preference.includes(id) ? preference.indexOf(id) : preference.length;
    const why = [sub ? `communities.json r/${sub.subreddit}: ${sub.painMentions} pain mentions; ${sub.citedRules[0]?.short_name ?? 'posting rules'} (${sub.rulesUrl})` :
      mentions ? `pains.json: ${painClusters} pain clusters with ${mentions} cited sources on ${hosts[id]}` : `rules/channels/${id}.yaml: ${defaults.includes(id) ? 'profile default for' : fit ? 'fits' : 'secondary to profile defaults for'} ${config.profile}`,
      angle.why].join('; ');
    const scoring = { tier, priority, profileFit: fit, profileDefault: defaults.includes(id), citedSources: mentions, painClusters, audienceMatches: audience,
      effort, accountRisk: risk, reachEvidence: reach, potentialMembers: sub?.activity.subscribers ?? null,
      account: sub ? { requirements: sub.requirements, eligibility: sub.eligibility, rules: sub.citedRules } : 'unverified; check account and self-promotion rules' };
    candidates.push({ id, rule, sub, score, scoring, why, angle: angle.angle, asset: angle.asset });
  }
  candidates.sort((a, b) => a.scoring.tier - b.scoring.tier || a.scoring.priority - b.scoring.priority || b.score - a.score || a.id.localeCompare(b.id));
  const scheduled: { channel: string; date: string; time: string; instant: string; why: string; angle: string; asset: string; score: number; scoring: Scoring }[] = [];
  const history: string[] = [], occupied = new Set<string>();
  let firstBig: string | undefined;
  for (const c of [...candidates.filter(c => !owned.has(c.id)), ...candidates.filter(c => owned.has(c.id))]) {
    const lesson = lessons.find(l => l.channel === c.id);
    const windows = c.sub ? c.sub.bestHours.map(hour => {
      const [time, zone] = hour.split(' ');
      return { time, zone: zone ?? config.timezone };
    }) : [{ time: c.rule.sourceTimes?.[0] ?? c.rule.bestPostingTimes[0], zone: c.rule.sourceTimezone ?? config.timezone }];
    const attempts = windows.flatMap(window => (lesson ? [true, false] : [false]).map(useLesson => ({ ...window, useLesson })));
    let ph = { dates: [] as string[], source: '' };
    if (c.id === 'product-hunt') { try { ph = await (options.productHunt ?? offlineProductHunt).openDates(config.launchDate); } catch { ph = await offlineProductHunt.openDates(config.launchDate); } }
    let found = false;
    for (let day = 0; day < 370 && !found; day++) {
      const date = nextDate(config.launchDate, day);
      if (!c.sub && !c.rule.bestPostingDays.includes(weekdays[new Date(date + 'T12:00:00Z').getUTCDay()])) continue;
      if (ph.dates.length && !ph.dates.includes(date)) continue;
      for (const { time, zone, useLesson } of attempts) {
        let instant: string;
        try { instant = parseSchedule(`| Channel | Local date | Local time |\n| --- | --- | --- |\n| ${c.id} | ${date} | ${useLesson ? lesson!.time : time} |`, useLesson ? config.timezone : zone)[0].scheduledAt; } catch { continue; }
        if (owned.has(c.id)) {
          if (!firstBig) continue;
          instant = new Date(Math.max(Date.parse(instant), Date.parse(firstBig) + 3600000)).toISOString();
          while (occupied.has(displayTime(instant, config.timezone).slice(0, 13))) instant = new Date(Date.parse(instant) + 3600000).toISOString();
        }
        const local = displayTime(instant, config.timezone), [localDate, localTime] = local.split(' ');
        if (localDate < config.launchDate || occupied.has(local.slice(0, 13))) continue;
        if (c.sub) { const allowed = postingWindow(localDate, localTime, config.timezone, restrictions(c.sub.citedRules, config.timezone), instant); if (!allowed.day || !allowed.time) continue; }
        if (c.id === 'product-hunt' && useLesson && displayTime(instant, zone).slice(11) !== time) continue;
        occupied.add(local.slice(0, 13));
        if (!owned.has(c.id) && (!firstBig || instant < firstBig)) firstBig = instant;
        if (useLesson && localTime !== displayTime(parseSchedule(`| Channel | Local date | Local time |\n| --- | --- | --- |\n| ${c.id} | ${date} | ${time} |`, zone)[0].scheduledAt, config.timezone).slice(11)) history.push(`${c.id}: time changed to ${localTime}; observation: ${lesson!.observation}`);
        scheduled.push({ channel: c.id, date: localDate, time: localTime, instant, angle: c.angle, asset: c.asset, score: c.score, scoring: c.scoring,
          why: c.why + (ph.source ? '; PH dates: ' + ph.source : '') + `; rules/channels/${c.id}.yaml: ${c.sub ? 'observed community hours' : c.rule.bestPostingDays.join('/')} ${time} ${zone}` + (owned.has(c.id) ? '; after first big post, next free response hour' : '') });
        found = true; break;
      }
    }
    if (!found) skip.push({ channel: c.id, reason: 'No compatible verified window or open date within the scheduling horizon.' });
  }
  scheduled.sort((a, b) => candidates.findIndex(c => c.id === a.channel) - candidates.findIndex(c => c.id === b.channel));
  const markdown = ['# Launch recommendations', '', `Timezone: ${config.timezone}. Every date and time below is in the founder’s timezone.`,
    'Rank by profile defaults and product-type priority first, then audience evidence, reach evidence, effort and account risk. Detailed heuristic scores are in --json; these are not predicted outcomes.',
    'No posts or messages sent. Verify non-Reddit account rules before posting. Owned/email slots are conditional on the first big post actually being live; delay them if it is not.',
    'Each channel has a separate local response hour. Owned/email slots are at least one hour after the first big post; source windows are preferences for these follow-ups. Reach is unmeasured unless community evidence is available.', '',
    '| Rank | Channel | Local date | Local time | Angle | Why | Asset needed |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...scheduled.map((s, i) => `| ${i + 1} | ${s.channel} | ${s.date} | ${s.time} | ${s.angle} | ${clean(s.why)} | ${clean(s.asset)} |`), '',
    '## History observations', ...(history.length ? history.map(h => '- ' + clean(h)) : ['- No observation changed a choice.']), '',
    '## Skip', ...skip.map(s => `- ${s.channel}: ${s.reason}`), '',
    ...report.subreddits.filter(s => s.eligibility !== 'meets' || !['allowed', 'restricted'].includes(s.selfPromotion)).map(s => `- reddit r/${s.subreddit}: account ${s.eligibility}; requirements ${s.requirements.karma} karma/${s.requirements.accountAgeDays} days; self-promotion ${s.selfPromotion}; ${s.rulesUrl}`), ''].join('\n');
  const path = join(paths.root, 'recommendations.md');
  await writeFile(path, markdown);
  return { path, timezone: config.timezone, channels: scheduled, skip, history, markdown };
}
