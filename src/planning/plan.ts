import { mkdir, writeFile } from 'node:fs/promises';
import { launchDir } from '../core/launch-dir.js';
import { loadRule } from '../core/rules.js';
import { readJson } from '../product/files.js';
import { validateConfig, type Config } from '../product/init.js';
import { loadPlanLessons } from '../results/history.js';

export interface PlanLesson { channel: string; time: string; observation: string }
export interface PlanOptions { date?: string; lessons?: PlanLesson[]; historyPath?: string }
export interface PlannedChannel { id: string; date: string; time: string; reason: string; leadTimeDays: number }
interface ChannelRule {
  name: string; profiles: string[]; bestPostingTimes: string[];
  bestPostingDays: string[]; leadTimeDays: number;
}
const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const channelCounts: Record<string, number> = { 'new-product': 4, feature: 3, changelog: 2, relaunch: 3 };
const reasons: Record<string, string> = {
  'show-hn': 'Invite hands-on feedback from technical peers with a tryable demo',
  'product-hunt': 'Present the product demo and maker story to product discovery readers',
  x: 'Share a concise update and invite direct conversation',
  linkedin: 'Explain the customer problem in a professional context',
  reddit: 'Invite relevant community feedback with a manual, subreddit-appropriate submission',
  devto: 'Explain the implementation with a technical walkthrough',
  'indie-hackers': 'Share the founder story and lessons with fellow builders',
  'github-release': 'Give repository users a durable release note tied to the code',
  tiktok: 'Demonstrate the core mobile workflow with a short vertical clip',
  reels: 'Show the product in use with a visual, vertical demonstration',
  shorts: 'Make the central workflow understandable in a short video',
  instagram: 'Show real product screens with a focused visual story',
  email: 'Explain the release directly to the opted-in audience',
  blog: 'Provide a durable explanation of the problem, solution and evidence',
  'press-release': 'Prepare a brand-reviewed announcement for press distribution',
};
const line = (value: string) => value.replace(/[\r\n|]/g, ' ').trim();

export function createPlan(config: Config, options: PlanOptions = {}) {
  const launchDate = options.date ?? config.launchDate;
  validateConfig({ ...config, launchDate });
  if (!config.profileConfirmed) throw new Error('Confirm the profile first: liftoff init --profile ' + config.profile + ' --yes');
  const profileRule = loadRule('profiles', config.profile);
  const defaults = profileRule.defaultChannels as string[];
  const candidates = [...new Set(config.channels)].filter(id => defaults.includes(id));
  const selected: PlannedChannel[] = [];
  const usedLessons: PlanLesson[] = [];
  for (const id of candidates) {
    const rule = loadRule('channels', id) as unknown as ChannelRule;
    if (!rule.profiles.includes(config.profile)) continue;
    const date = new Date(launchDate + 'T12:00:00Z');
    while (!rule.bestPostingDays.includes(weekdays[date.getUTCDay()])) date.setUTCDate(date.getUTCDate() + 1);
    const lesson = options.lessons?.find(l => l.channel === id);
    if (lesson && !/^([01]\d|2[0-3]):[0-5]\d$/.test(lesson.time)) throw new Error('Invalid history lesson time for ' + id);
    const time = lesson?.time ?? rule.bestPostingTimes[0];
    if (lesson && time !== rule.bestPostingTimes[0]) usedLessons.push(lesson);
    selected.push({ id, date: date.toISOString().slice(0, 10), time,
      reason: `${reasons[id] ?? rule.name}; ${config.launchType === 'changelog' ? 'keep the version update concise' : config.launchType === 'feature' ? 'focus on the specific improvement' : config.launchType === 'relaunch' ? 'explain what changed since the previous launch' : 'introduce the product with grounded proof'}`,
      leadTimeDays: rule.leadTimeDays });
    if (selected.length === channelCounts[config.launchType]) break;
  }
  if (selected.length < 2) throw new Error('Plan needs at least two channels allowed for the profile; update config.channels.');
  const lines = [
    '# Launch plan', '',
    `Profile: ${config.profile} | Launch type: ${config.launchType}`,
    `Launch date: ${launchDate} | Timezone: ${line(config.timezone)}`,
    'All scheduled dates and times below are local wall-clock times in this timezone.',
    'Posting windows are starting heuristics, not performance promises.', '',
    '## Channels', '',
    '| Channel | Local date | Local time | Why | Preparation lead time |',
    '| --- | --- | --- | --- | --- |',
    ...selected.map(c => `| ${c.id} | ${c.date} | ${c.time} | ${line(c.reason)} | ${c.leadTimeDays} day(s) |`),
    '', 'Use the next allowed posting day on or after launch day; prepare assets at least the listed lead time ahead.',
    'Every post requires human approval. Show HN and Reddit are paste-ready manual submissions only.',
    '', '## T-7 to T+3 checklist', '',
    '- [ ] T-7: Confirm audience, profile, source-backed claims and channel selection.',
    '- [ ] T-6: Check channel rules and start any longer-lead launch preparation.',
    '- [ ] T-5: Verify product access, landing page and pricing.',
    '- [ ] T-4: Draft channel-native posts with claim citations.',
    '- [ ] T-3: Capture real screenshots and redact private information.',
    '- [ ] T-2: Prepare demo assets and verify links and media dimensions.',
    '- [ ] T-1: Collect human approvals for exact posts and media hashes.',
    '- [ ] T+0: Submit approved posts at the listed local times; never auto-post to HN or Reddit.',
    '- [ ] T+1: Record initial observations and draft replies for human review.',
    '- [ ] T+2: Check unanswered questions; do not auto-reply.',
    '- [ ] T+3: Record metrics and lessons without claiming causation.',
    '', '## History observations',
    ...(usedLessons.length ? usedLessons.map(l => `- ${l.channel}: time changed to ${l.time} based on observation: ${line(l.observation).slice(0, 240)}`) :
      ['- No history observation changed a time slot; using bundled channel scheduling defaults.']), '',
  ];
  if (lines.length >= 120) throw new Error('Plan exceeds line limit');
  return { markdown: lines.join('\n'), channels: selected, launchDate, timezone: config.timezone };
}

export async function plan(cwd: string, options: PlanOptions = {}) {
  const paths = launchDir(cwd);
  const config = await readJson<Config>(paths.config);
  validateConfig({ ...config, launchDate: options.date ?? config.launchDate });
  const lessons = options.lessons ?? await loadPlanLessons(config.profile, options.historyPath);
  const result = createPlan(config, { ...options, lessons });
  await mkdir(paths.root, { recursive: true });
  await writeFile(paths.plan, result.markdown);
  return { path: paths.plan, ...result };
}
