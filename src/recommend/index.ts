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
const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const owned = new Set(['email', 'blog', 'github-release', 'x']);
const clean = (s: string) => s.replace(/[|\r\n]/g, ' ');
async function optional<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
}
export function chooseAngle(id: string, product: Product) {
  if (id === 'reddit') return { angle: 'pain story', why: 'community discussion starts with product.json problem.summary', asset: product.problem.summary };
  if (id === 'devto' || id === 'blog') return { angle: 'technical deep dive', why: 'long-form channel; explain product.json proof sources', asset: product.proof?.[0]?.source_file ?? 'source-linked walkthrough' };
  const benchmark = product.proof?.find(p => /benchmark|latency|throughput|duration|elapsed|milliseconds|seconds/i.test(p.metric));
  if (id === 'show-hn' && benchmark) return { angle: 'benchmark result', why: 'technical audience; use only the metric recorded in product.json proof', asset: benchmark.metric + ' (' + benchmark.source_file + ')' };
  if (product.money_moment && id !== 'github-release') return { angle: 'before/after demo', why: 'product.json money_moment provides a demonstrable transition', asset: `${product.money_moment.before} → ${product.money_moment.action} → ${product.money_moment.after}` };
  if (product.competitors?.some(c => c.dislikes.length) && id === 'indie-hackers') return { angle: 'contrarian take', why: 'product.json competitors records a concrete tradeoff, not a fabricated controversy', asset: product.competitors.find(c => c.dislikes.length)!.dislikes.join('; ') };
  return { angle: 'build story', why: 'explain the product.json problem and source-backed implementation', asset: 'source-linked build notes' };
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
  const candidates = [];
  for (const id of [...new Set(config.channels)]) {
    if (id === 'press-release') continue;
    const rule = loadRule('channels', id, cwd) as unknown as WindowRule;
    const sub = id === 'reddit' ? report.subreddits.filter(s => report.recommended.includes(s.subreddit) && s.eligibility === 'meets' && ['allowed', 'restricted'].includes(s.selfPromotion) && s.bestHours.length && !restrictions(s.citedRules, config.timezone).manualReview).sort((a, b) => b.score - a.score || a.subreddit.localeCompare(b.subreddit))[0] : undefined;
    if (id === 'reddit' && !sub) { skip.push({ channel: id, reason: 'communities.json: no recommended subreddit with verified account eligibility, cited permission rules and observed bestHours.' }); continue; }
    const fit = rule.profiles.includes(config.profile);
    const urls = pains.pains.flatMap(p => p.quotes.map(q => q.url));
    const hosts: Record<string, string> = { 'show-hn': 'news.ycombinator.com', devto: 'dev.to', 'github-release': 'github.com', x: 'x.com', linkedin: 'linkedin.com' };
    const mentions = hosts[id] ? urls.filter(url => { try { return new URL(url).hostname === hosts[id]; } catch { return false; } }).length : 0;
    const audience = (product.audience.where ?? []).filter(where => where.toLowerCase().includes(id) || Boolean(hosts[id] && where.includes(hosts[id])));
    const angle = chooseAngle(id, product);
    const effort = ['technical deep dive', 'benchmark result'].includes(angle.angle) ? 2 : 1;
    const risk = sub ? sub.selfPromotion === 'restricted' ? 1 : 0 : 1;
    const reach = sub && sub.activity.subscribers > 0 ? 1 : 0;
    const score = Number(fit) * 4 + Number(defaults.includes(id)) * 2 + Number(mentions > 0) * 3 + Number(audience.length > 0) * 3 + Number(Boolean(sub)) * 3 + reach - effort - risk;
    const why = [`rules/channels/${id}.yaml: ${fit ? 'fits' : 'not a default fit for'} ${config.profile}`, `product.json audience.who: ${product.audience.who}`,
      ...(mentions ? [`pains.json: ${mentions} cited quotes on ${hosts[id]}`] : []), ...audience.map(a => `product.json audience.where: ${a}`),
      ...(sub ? [`communities.json r/${sub.subreddit}: ${sub.painMentions} pain mentions; ${sub.activity.subscribers} members (potential audience, not promised reach); ${sub.rulesUrl}; ${sub.citedRules.map(r => r.short_name + ': ' + r.description).join('; ')}; requirements ${sub.requirements.karma} karma/${sub.requirements.accountAgeDays} days: ${sub.eligibility}`] : ['Reach unmeasured; account eligibility and self-promotion rules require manual review'])].join('; ');
    candidates.push({ id, rule, sub, score, why: why + `; heuristic effort ${effort} (${angle.angle}); account-risk penalty ${risk}; observed-reach evidence bonus ${reach}`, angle: angle.angle, asset: angle.asset, angleWhy: angle.why });
  }
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const scheduled: { channel: string; date: string; time: string; instant: string; why: string; angle: string; asset: string; score: number }[] = [];
  const history: string[] = [], occupied = new Set<string>();
  let firstBig: string | undefined;
  for (const c of [...candidates.filter(c => !owned.has(c.id)), ...candidates.filter(c => owned.has(c.id))]) {
    const lesson = lessons.find(l => l.channel === c.id);
    const observed = c.sub?.bestHours[0]?.split(' ');
    const zone = observed?.[1] ?? c.rule.sourceTimezone ?? config.timezone;
    const time = observed?.[0] ?? c.rule.sourceTimes?.[0] ?? c.rule.bestPostingTimes[0];
    let ph = { dates: [] as string[], source: '' };
    if (c.id === 'product-hunt') { try { ph = await (options.productHunt ?? offlineProductHunt).openDates(config.launchDate); } catch { ph = await offlineProductHunt.openDates(config.launchDate); } }
    let found = false;
    for (let day = 0; day < 370 && !found; day++) {
      const date = nextDate(config.launchDate, day);
      if (!c.sub && !c.rule.bestPostingDays.includes(weekdays[new Date(date + 'T12:00:00Z').getUTCDay()])) continue;
      if (ph.dates.length && !ph.dates.includes(date)) continue;
      for (const useLesson of lesson ? [true, false] : [false]) {
        let instant: string;
        try { instant = parseSchedule(`| Channel | Local date | Local time |\n| --- | --- | --- |\n| ${c.id} | ${date} | ${useLesson ? lesson!.time : time} |`, useLesson ? config.timezone : zone)[0].scheduledAt; } catch { continue; }
        const local = displayTime(instant, config.timezone), [localDate, localTime] = local.split(' ');
        if (localDate < config.launchDate || !owned.has(c.id) && occupied.has(local.slice(0, 13)) || owned.has(c.id) && firstBig && instant <= firstBig) continue;
        if (c.sub) { const allowed = postingWindow(localDate, localTime, config.timezone, restrictions(c.sub.citedRules, config.timezone), instant); if (!allowed.day || !allowed.time) continue; }
        if (c.id === 'product-hunt' && useLesson && displayTime(instant, zone).slice(11) !== time) continue;
        if (!owned.has(c.id)) { occupied.add(local.slice(0, 13)); if (!firstBig || instant < firstBig) firstBig = instant; }
        if (useLesson && localTime !== displayTime(parseSchedule(`| Channel | Local date | Local time |\n| --- | --- | --- |\n| ${c.id} | ${date} | ${time} |`, zone)[0].scheduledAt, config.timezone).slice(11)) history.push(`${c.id}: time changed to ${localTime}; observation: ${lesson!.observation}`);
        scheduled.push({ channel: c.id, date: localDate, time: localTime, instant, angle: c.angle, asset: c.asset, score: c.score, why: c.why + '; Angle: ' + c.angleWhy + (ph.source ? '; PH dates: ' + ph.source : '') + `; window ${time} ${zone}` });
        found = true; break;
      }
    }
    if (!found) skip.push({ channel: c.id, reason: 'No compatible verified window or open date within the scheduling horizon.' });
  }
  scheduled.sort((a, b) => b.score - a.score || a.channel.localeCompare(b.channel));
  const markdown = ['# Launch recommendations', '', `Timezone: ${config.timezone}. Every date and time below is in the founder’s timezone.`,
    'Deterministic heuristic score: profile fit +4, profile default +2, cited pain audience +3, product audience +3, eligible community +3, observed community reach +1; subtract effort (2 for deep dive/benchmark, otherwise 1) and account risk (1 for restricted/unverified, otherwise 0). These are priority weights, not measured outcomes or predicted reach.',
    'No posts or messages sent. Verify non-Reddit account rules before posting. Owned/email slots are conditional on the first big post actually being live; delay them if it is not.',
    'Effort: prepare the listed asset and reserve comment-response time; reach is unmeasured unless a community count is cited.', '',
    '| Rank | Channel | Local date | Local time | Angle | Why | Asset needed |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...scheduled.map((s, i) => `| ${i + 1} | ${s.channel} | ${s.date} | ${s.time} | ${s.angle} | ${clean(s.why)} | ${clean(s.asset)} |`), '',
    '## History observations', ...(history.length ? history.map(h => '- ' + clean(h)) : ['- No observation changed a choice.']), '',
    '## Skip', ...skip.map(s => `- ${s.channel}: ${s.reason}`), '',
    ...report.subreddits.filter(s => s.eligibility !== 'meets' || !['allowed', 'restricted'].includes(s.selfPromotion)).map(s => `- reddit r/${s.subreddit}: account ${s.eligibility}; requirements ${s.requirements.karma} karma/${s.requirements.accountAgeDays} days; self-promotion ${s.selfPromotion}; ${s.rulesUrl}`), ''].join('\n');
  const path = join(paths.root, 'recommendations.md');
  await writeFile(path, markdown);
  return { path, timezone: config.timezone, channels: scheduled, skip, history, markdown };
}
