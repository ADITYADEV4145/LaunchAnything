import { join, resolve } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { checked, readJson, withWriteLock, writeJson, writeLocal } from './files.js';
import { githubStarsDelta } from './github.js';
import { manualObservations, normalizeObservation, postKey, summarize, type ObservedPost,
  type PostObservation, type PublishedPost, type ResultConfig } from './metrics.js';
import { renderReplies, renderReport } from './report.js';

export type ReadStatus = (post: PublishedPost) => Promise<unknown>;

export function checkpointAt(config: ResultConfig, now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, calendar: 'iso8601',
    numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const day = (Date.parse(today) - Date.parse(config.launchDate)) / 86_400_000;
  if (day < 1) throw new Error('T+1 has not arrived in the configured launch timezone.');
  return day >= 7 ? 'T+7' : day >= 3 ? 'T+3' : 'T+1';
}

export function checkpointPaths(cwd: string, launchDate: string, checkpoint: string) {
  const base = join(launchDir(cwd).root, 'results', launchDate, checkpoint);
  return { snapshot: `${base}.json`, details: `${base}-details.json` };
}

export async function collect(cwd: string, options: {
  now?: Date; metricsPath?: string; github?: boolean; readStatus?: ReadStatus; replies?: boolean;
} = {}) {
  const paths = launchDir(cwd);
  const now = options.now ?? new Date();
  const config = checked<ResultConfig>('config', await readJson(paths.config));
  const checkpoint = checkpointAt(config, now);
  const published = checked<{ posts: PublishedPost[] }>('published', await readJson(paths.published)).posts
    .filter(post => post.status !== 'cancelled' && post.status !== 'failed');
  if (new Set(published.map(post => postKey(post.channel, post.id))).size !== published.length)
    throw new Error('Duplicate post channel/id in published.json');
  if (!published.length) throw new Error('No posts to track in published.json');
  const importPath = options.metricsPath === undefined ? join(paths.root, 'metrics.json') : resolve(cwd, options.metricsPath);
  const imported = await readJson(importPath, options.metricsPath === undefined);
  const manual = imported === undefined ? new Map<string, PostObservation>() : manualObservations(imported, published);
  const warnings: string[] = [];
  const posts: ObservedPost[] = [];
  for (const post of published) {
    let adapter: PostObservation = {};
    try {
      const response = await options.readStatus?.(post);
      if (response !== undefined) adapter = normalizeObservation(response, post.channel);
    } catch {
      warnings.push(`Status metrics unavailable for ${post.channel}; using any imported counts instead.`);
    }
    const entered = manual.get(postKey(post.channel, post.id));
    posts.push({ ...post, ...adapter, ...entered,
      metrics: { ...adapter.metrics, ...entered?.metrics },
      owned: entered?.owned ?? adapter.owned,
      comments: entered?.comments ?? adapter.comments,
      hook: entered?.hook ?? adapter.hook,
    });
  }
  if (posts.some(post => Object.keys(post.metrics ?? {}).length === 0))
    warnings.push(`Some posts have no recorded metrics. Add counts in ${importPath} or pass --metrics.`);
  let starsDelta: number | undefined;
  if (options.github) {
    try { starsDelta = await githubStarsDelta(cwd); } catch { /* a missing baseline or remote is not fatal */ }
    if (starsDelta === undefined) warnings.push('GitHub star change unavailable; a pre-launch baseline and public GitHub origin are required.');
  }

  const results = summarize(posts, now, starsDelta);
  const { snapshot, details } = checkpointPaths(cwd, config.launchDate, checkpoint);
  const report = renderReport(results, posts, checkpoint);
  const replies = options.replies ? renderReplies(posts, checkpoint) : undefined;
  const repliesPath = replies && join(paths.root, 'replies.md');
  await withWriteLock(paths.results, async () => {
    await writeJson(details, { observedAt: results.observedAt, profile: config.profile, timezone: config.timezone,
      posts: posts.map(({ channel, hook, metrics, scheduledAt }) =>
      ({ channel, hook, metrics, scheduledAt })) });
    await writeJson(snapshot, results);
    await writeLocal(paths.report, report);
    if (replies && repliesPath) await writeLocal(repliesPath, replies.markdown);
    await writeJson(paths.results, results);
  });
  return { path: paths.results, snapshot, checkpoint, results, report: paths.report, warnings,
    ...(replies && { replies: { path: repliesPath, count: replies.count } }),
  };
}
