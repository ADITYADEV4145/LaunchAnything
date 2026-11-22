import { addLocalDays } from './time.js';
import { loadRule } from '../core/rules.js';
import type { ObservedPost } from './metrics.js';
import { markdown, plain } from './report.js';

export const performanceSignals = ['signups', 'waitlistConversions', 'clicks', 'views'] as const;
const formats = [['LinkedIn post', 'linkedin', 1], ['Carousel', 'instagram', 5], ['9:16 clip', 'reels', 9]] as const;
const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function draftSchedule(date: string) {
  let previous = 0;
  return formats.flatMap(([format, channel, offset]) => {
    const rule = loadRule('channels', channel) as { bestPostingTimes: string[]; bestPostingDays: string[] };
    for (let day = Math.max(previous + 1, offset); day <= 14; day++) {
      const proposed = addLocalDays(date, day);
      if (!rule.bestPostingDays.includes(weekdays[new Date(proposed + 'T12:00:00Z').getUTCDay()])) continue;
      previous = day;
      return [{ date: proposed, time: rule.bestPostingTimes[0], channel, format }];
    }
    return [{ date: 'Unscheduled', time: '—', channel, format }];
  });
}

export function strongestPost(posts: ObservedPost[]) {
  let candidates = posts;
  for (const metric of performanceSignals) {
    const measured = candidates.filter(post => post.metrics?.[metric] !== undefined)
      .sort((a, b) => b.metrics![metric]! - a.metrics![metric]!);
    if (measured.length && measured[0].metrics![metric]! > 0) {
      const value = measured[0].metrics![metric]!;
      const leaders = measured.filter(post => post.metrics![metric] === value);
      if (leaders.length === 1) return { post: leaders[0], metric, value, measured: measured.length };
      candidates = leaders;
    }
  }
}

export interface RepurposeMedia {
  carousel?(input: { hook: string; frames: string[] }): unknown | Promise<unknown>;
  vertical?(input: { hook: string; frames: string[] }): unknown | Promise<unknown>;
}

export async function repurpose(posts: ObservedPost[], date: string, timezone: string, media: RepurposeMedia = {}) {
  const selected = strongestPost(posts);
  const initial = ['# Repurposing plan — draft for approval', '',
    'Proposed dates only; nothing has been posted or scheduled.', ''];
  if (!selected) return { markdown: [...initial, 'No unique post with positive measured performance was found.', ''].join('\n') };
  const { post, metric, value, measured } = selected;
  const schedule = draftSchedule(date);
  const lines = [...initial, `Source: ${post.channel} / ${markdown(post.id, 200)}; ${value} measured ${metric} (${measured} post(s) with that field).`,
    'This selection reflects the data recorded, not a causal effect or confirmed unique reach.', '',
    `| Proposed date (${timezone}) | Local time | Channel | Format |`, '| --- | --- | --- | --- |',
    ...schedule.map(slot => `| ${slot.date} | ${slot.time} | ${slot.channel} | ${slot.format} |`), ''];
  if (!post.copy) return { markdown: [...lines, 'Import the published copy for this post to draft adaptations.', ''].join('\n') };
  const paragraphs = post.copy.split(/\r?\n+|(?<=[.!?])\s+(?=[\p{Lu}\p{N}])/u).map(value => plain(value, 600)).filter(Boolean);
  const hook = plain(post.hook ?? paragraphs[0] ?? post.copy, 160);
  const frames = [...new Set([hook, ...paragraphs.map(value => plain(value, 160))])].filter(Boolean).slice(0, 6);
  const brief = { hook, frames };
  const carousel = await media.carousel?.(brief);
  const vertical = await media.vertical?.(brief);
  return {
    artifacts: { carousel, vertical },
    brief: { source: { channel: post.channel, id: post.id }, schedule, timezone, ...brief },
    markdown: [...lines, '## LinkedIn draft', '', markdown(hook, 160), '',
      ...paragraphs.filter(value => value !== hook).slice(0, 4).flatMap(value => [markdown(value, 600), '']),
      'What part of this workflow takes the most time for you?', '',
      '## Carousel copy', '', ...frames.map((value, index) => `${index + 1}. ${markdown(value, 160)}`), '',
      '## 9:16 clip storyboard', '', ...frames.map((value, index) =>
        `${index + 1}. ${markdown(value, 160)} — Match this line to real product footage before rendering.`), '',
      'Review the copy, select real media, and confirm local posting times before approval.', ''].join('\n'),
  };
}
