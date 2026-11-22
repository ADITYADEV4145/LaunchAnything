import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { checked, missing, readJson, withWriteLock, writeJson, writeLocal } from './files.js';
import { githubStarsDelta } from './github.js';
import { manualObservations, normalizeObservation, postKey, record, summarize, type ManualObservation, type ObservedPost,
  type PostObservation, type PublishedPost, type ResultConfig } from './metrics.js';
import { renderReplies, renderReport } from './report.js';
import { attribute } from './attribution.js';
import { calibrate, calibrationInput } from './calibration.js';
import { feedbackDrafts, mineFeedback } from './feedback.js';
import { followupDrafts, shippedFix } from './followup.js';
import { linkJudgeEvidence } from './judge-evidence.js';
import { repurpose, type RepurposeMedia } from './repurpose.js';
import { localDate } from './time.js';

export type ReadStatus = (post: PublishedPost) => Promise<unknown>;

export function checkpointAt(config: ResultConfig, now: Date) {
  const today = localDate(now, config.timezone);
  const day = (Date.parse(today) - Date.parse(config.launchDate)) / 86_400_000;
  if (day < 1) throw new Error('T+1 has not arrived in the configured launch timezone.');
  return day >= 30 ? 'T+30' : day >= 7 ? 'T+7' : day >= 3 ? 'T+3' : 'T+1';
}

export function checkpointPaths(cwd: string, launchDate: string, checkpoint: string) {
  const base = join(launchDir(cwd).root, 'results', launchDate, checkpoint);
  return { snapshot: `${base}.json`, details: `${base}-details.json`, drafts: base };
}

export async function collect(cwd: string, options: {
  now?: Date; metricsPath?: string; github?: boolean; readStatus?: ReadStatus; replies?: boolean;
  repurposeMedia?: RepurposeMedia;
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
  const input = imported === undefined ? {} : record(imported);
  const manual = imported === undefined ? new Map<string, ManualObservation>() : manualObservations(imported, published);
  const nativeJudgments = await linkJudgeEvidence(cwd, paths.posts, manual);
  if (nativeJudgments && input.calibration !== undefined) throw new Error('judgeSourceHash uses the built-in copy rubric; omit calibration.');
  const rubric = nativeJudgments ? nativeJudgments.rubric : calibrationInput(input.calibration);
  const warnings: string[] = [];
  if (nativeJudgments && !rubric) warnings.push('Linked judge verdicts use different weights. Recorded scores are preserved; no calibration weights will be suggested.');
  const posts: ObservedPost[] = [];
  for (const post of published) {
    let adapter: PostObservation = {};
    try {
      const response = await options.readStatus?.(post);
      if (response !== undefined) adapter = normalizeObservation(response, post.channel);
    } catch {
      warnings.push(`Status metrics unavailable for ${post.channel}; using any imported counts instead.`);
    }
    const key = postKey(post.channel, post.id);
    const { judgeSourceHash: _sourceHash, ...entered } = manual.get(key) ?? {};
    const fields = Object.fromEntries(Object.entries(entered).filter(([, value]) => value !== undefined));
    posts.push({ ...post, ...adapter, ...fields,
      metrics: { ...adapter.metrics, ...entered.metrics },
      judge: nativeJudgments ? nativeJudgments.evidence.get(key) : (entered.judge ?? adapter.judge),
    });
  }
  let starsDelta: number | undefined;
  if (options.github) {
    try { starsDelta = await githubStarsDelta(cwd); } catch { /* a missing baseline or remote is not fatal */ }
    if (starsDelta === undefined) warnings.push('GitHub star change unavailable; a pre-launch baseline and public GitHub origin are required.');
  }

  const attribution = attribute(posts, input.attribution);
  if (attribution.posts.some(post => Object.keys(post.metrics).length === 0))
    warnings.push(`Some posts have no recorded metrics. Add counts in ${importPath} or pass --metrics.`);
  const calibration = calibrate(attribution.posts, rubric);
  const results = summarize(attribution.posts, now, starsDelta);
  const { snapshot, details, drafts } = checkpointPaths(cwd, config.launchDate, checkpoint);
  const topics = mineFeedback(posts);
  const brief = await readFile(join(paths.root, 'brief.md'), 'utf8').catch(error => {
    if (!missing(error)) throw error;
    return undefined;
  });
  const feedback = feedbackDrafts(topics, brief);
  const followups = followupDrafts(results, Number(checkpoint.slice(2)), topics, shippedFix(input.shippedFix));
  const adaptation = await repurpose(attribution.posts, localDate(now, config.timezone), config.timezone, options.repurposeMedia);
  const report = renderReport(results, attribution.posts, checkpoint, attribution.unmatched);
  const replies = options.replies ? renderReplies(posts, checkpoint) : undefined;
  const repliesPath = replies && join(paths.root, 'replies.md');
  await withWriteLock(paths.results, async () => {
    await writeJson(details, { observedAt: results.observedAt, profile: config.profile, timezone: config.timezone,
      posts: attribution.posts.map(({ channel, id, hook, angle, judge, metrics, scheduledAt, utmContent, attribution }) =>
      ({ channel, id, hook, angle, judge, metrics, scheduledAt, utmContent, attribution })),
      unattributed: attribution.unmatched, rubric });
    await writeJson(snapshot, results);
    await writeLocal(paths.report, report);
    await writeLocal(join(drafts, 'faq.md'), feedback.faqMarkdown);
    await writeJson(join(drafts, 'issues.json'), feedback.issues);
    await writeLocal(join(drafts, 'exemplar-notes.md'), feedback.notes);
    for (const { filename, body } of followups) await writeLocal(join(drafts, filename), body);
    await writeLocal(join(drafts, 'repurpose.md'), adaptation.markdown);
    const mediaBrief = join(drafts, 'repurpose-media.json');
    if (adaptation.brief) await writeJson(mediaBrief, adaptation.brief);
    else await rm(mediaBrief, { force: true });
    const calibrationPath = join(drafts, 'judge-calibration.json');
    if (calibration) await writeJson(calibrationPath, calibration);
    else await rm(calibrationPath, { force: true });
    if (replies && repliesPath) await writeLocal(repliesPath, replies.markdown);
    await writeJson(paths.results, results);
  });
  return { path: paths.results, snapshot, checkpoint, results, report: paths.report, warnings,
    drafts, feedback: feedback.counts, media: adaptation.artifacts,
    ...(calibration && { calibration: join(drafts, 'judge-calibration.json') }),
    ...(replies && { replies: { path: repliesPath, count: replies.count } }),
  };
}
