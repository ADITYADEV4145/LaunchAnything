import { addMetric, metricNames, type Comment, type ObservedPost, type Results } from './metrics.js';
import { trackedMetrics, type AttributedPost } from './attribution.js';

export function plain(value: string, limit = 400) {
  return value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
export const markdown = (value: string, limit?: number) => plain(value, limit)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/[\\`*_~\[\]|]/g, '\\$&');

export function link(value?: string) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return ` ([open](<${url.href.replaceAll('>', '%3E').replaceAll('|', '%7C')}>))`;
  } catch { return ''; }
}

function quote(comment: Comment) {
  return `**${markdown(comment.author, 100)}:** ${markdown(comment.body)}${link(comment.url)}`;
}

export function renderReport(results: Results, posts: AttributedPost[], checkpoint: string,
  unmatched: NonNullable<AttributedPost['attribution']>) {
  const lines = ['# Launch results', '', `Checkpoint: ${checkpoint} · Observed: ${results.observedAt}`, '',
    'Metrics are reported counts, not deduplicated audience or evidence of causation. “—” means not reported.', ''];
  const labels = ['Views', 'Likes', 'Comments', 'Clicks', 'Stars Δ', 'Signups', 'Waitlist conversions'];
  lines.push('| Channel | ' + labels.join(' | ') + ' |', '| ' + ['---', ...labels.map(() => '---:')].join(' | ') + ' |');
  for (const row of results.channels)
    lines.push(`| ${row.channel} | ${metricNames.map(name => row[name] ?? '—').join(' | ')} |`);

  const postMetrics = ['views', 'comments', ...trackedMetrics] as const;
  lines.push('', '## Per-post counts and signup attribution', '',
    'UTM fields join on the exact utm_content supplied for a post. Other counts are reported per post but are not UTM-verified. GitHub star changes are repository-wide, not credited to individual posts.', '',
    '| Channel | Post | UTM content | Views | Comments | Clicks | Signups | Waitlist conversions | UTM-verified fields |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const post of posts) {
    const measured = postMetrics.map(name => post.metrics?.[name] ?? '—');
    const verified = trackedMetrics.filter(name => post.attribution?.[name] !== undefined).join(', ') || '—';
    lines.push(`| ${post.channel} | ${markdown(post.id, 200)}${link(post.url)} | ${post.utmContent ? markdown(post.utmContent, 200) : '—'} | ${measured.join(' | ')} | ${verified} |`);
  }
  if (Object.keys(unmatched).length)
    lines.push('', `Unattributed UTM counts (excluded from post and channel totals): ${trackedMetrics.flatMap(name =>
      unmatched[name] === undefined ? [] : [`${name}: ${unmatched[name]}`]).join(', ')}.`);

  for (const { channel } of results.channels) {
    lines.push('', `## ${channel}`, '');
    const published = posts.filter(post => post.channel === channel);
    if (!published.length) lines.push('Repository-wide metric; no published post recorded for this channel.');
    for (const post of published) {
      lines.push(`- Post ${markdown(post.id, 100)} (${post.status})${link(post.url)}${post.hook ? `: ${markdown(post.hook)}` : ''}`);
    }
    const top = published.flatMap(post => post.comments ?? [])
      .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, 3);
    lines.push('', '**Top recorded comments**', '', ...(top.length ? top.map(comment => `- ${quote(comment)}`) : ['None supplied.']));
  }

  const coverage = posts.filter(post => metricNames.some(name => post.metrics?.[name] !== undefined)).length;
  const views = results.channels.filter(row => row.views !== undefined).sort((a, b) => b.views! - a.views!);
  const clicks = results.channels.filter(row => row.clicks !== undefined);
  const clickTotal = clicks.reduce((total, row) => addMetric(total, row.clicks!), 0);
  const signups = posts.filter(post => post.attribution?.signups !== undefined)
    .sort((a, b) => b.attribution!.signups! - a.attribution!.signups!);
  const bestSignupCount = signups[0]?.attribution?.signups;
  lines.push('', '## Lessons (observations, not causal claims)', '',
    `1. **Coverage:** ${coverage} of ${posts.length} tracked posts reported at least one metric. Fill data gaps before comparing channels.`,
    views.length
      ? `2. **Reach:** The highest recorded view count was ${views[0].views} (${views.filter(row => row.views === views[0].views).map(row => row.channel).join(', ')}). Test a comparable posting slot again.`
      : '2. **Reach:** No view counts were supplied. Record them before using reach to compare posting slots.',
    clicks.length
      ? `3. **Clicks:** ${clickTotal} clicks were reported across ${clicks.length} channel(s)${clicks.some(row => row.clicks === 0) ? `; zero reported for ${clicks.filter(row => row.clicks === 0).map(row => row.channel).join(', ')}` : ''}. Clicks alone do not establish conversions.`
      : '3. **Clicks:** No click counts were supplied. Add link tracking for the next measurement.',
    bestSignupCount === undefined ? '4. **Signups:** No signups were matched to a post UTM.' :
      bestSignupCount === 0 ? '4. **Signups:** Zero signups were recorded for the measured post UTMs.' :
        `4. **Signups:** The highest recorded UTM-matched signup count was ${bestSignupCount} (${signups
          .filter(post => post.attribution?.signups === bestSignupCount).map(post => `${post.channel} / ${markdown(post.id, 100)}`).join(', ')}).`, '');
  return lines.join('\n');
}

export function renderReplies(posts: ObservedPost[], checkpoint: string) {
  const lines = ['# Reply drafts — human approval required', '',
    `Checkpoint: ${checkpoint}. Local drafts only; nothing has been sent.`, ''];
  let count = 0;
  for (const post of posts.filter(post => post.owned === true)) {
    for (const comment of post.comments?.filter(comment => comment.answered === false) ?? []) {
      count++;
      lines.push(`## ${post.channel} · post ${markdown(post.id, 100)} · comment ${markdown(comment.id, 100)}`, '',
        quote(comment), '', '**Draft (edit before approval):** Thanks for sharing this with us.', '');
    }
  }
  if (!count) lines.push('No unanswered comments were recorded on verified owned posts.', '');
  return { markdown: lines.join('\n'), count };
}
