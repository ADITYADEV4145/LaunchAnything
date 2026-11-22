import { homedir } from 'node:os';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { checkpointAt, checkpointPaths } from './collect.js';
import { calibrate, calibrationInput } from './calibration.js';
import { checked, readJson, withWriteLock, writeJson } from './files.js';
import { normalizeObservation, record, type PostObservation, type ResultConfig, type Results } from './metrics.js';
import { plain } from './report.js';

interface Lesson {
  time: string; channel: string; lesson: string; bestHour?: number;
  bestHook?: string; bestAngle?: string; zeroMeasuredClicks?: boolean;
}
type Calibration = NonNullable<ReturnType<typeof calibrate>> & { time: string };
interface History { profiles: Record<string, Lesson[]>; judgeCalibrations?: Record<string, Calibration[]> }
interface PlanLesson { channel: string; time: string; observation: string }
interface Evidence extends PostObservation { channel: string; id?: string; scheduledAt?: string }
const signals = ['signups', 'waitlistConversions', 'clicks', 'views', 'likes', 'comments'] as const;
export const defaultHistoryPath = () => join(homedir(), '.liftoff', 'history.json');

async function readHistory(path: string): Promise<History> {
  const data = await readJson(path, true);
  return data === undefined ? { profiles: {} } : checked<History>('history', data);
}

export async function loadPlanLessons(profile: string, historyPath = defaultHistoryPath()): Promise<PlanLesson[]> {
  const entries = (await readHistory(historyPath)).profiles[profile] ?? [];
  const recommendations = new Map<string, PlanLesson>();
  for (const entry of [...entries].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))) {
    if (entry.bestHour === undefined || recommendations.has(entry.channel)) continue;
    recommendations.set(entry.channel, { channel: entry.channel, time: `${String(entry.bestHour).padStart(2, '0')}:00`,
      observation: entry.lesson });
  }
  return [...recommendations.values()];
}

export async function loadJudgeWeights(profile: string, rubricId: string, historyPath = defaultHistoryPath()) {
  const entries = (await readHistory(historyPath)).judgeCalibrations?.[profile] ?? [];
  return [...entries].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
    .find(entry => entry.rubricId === rubricId && entry.suggestedWeights)?.suggestedWeights;
}

function observedEvidence(data: unknown, results: Results, config: ResultConfig): Evidence[] {
  if (!data || typeof data !== 'object' || !('posts' in data) || !Array.isArray(data.posts) ||
    !('observedAt' in data) || data.observedAt !== results.observedAt ||
    !('profile' in data) || data.profile !== config.profile || !('timezone' in data) || data.timezone !== config.timezone)
    throw new Error('Checkpoint details do not match results.json; run liftoff results again.');
  return data.posts.map((raw: Record<string, unknown>) => {
    if (typeof raw?.channel !== 'string' || !results.channels.some(row => row.channel === raw.channel) ||
      (raw.id !== undefined && typeof raw.id !== 'string') ||
      (raw.scheduledAt !== undefined && (typeof raw.scheduledAt !== 'string' || !Number.isFinite(Date.parse(raw.scheduledAt)))))
      throw new Error('Invalid checkpoint evidence; run liftoff results again.');
    return { ...normalizeObservation(raw, raw.channel), channel: raw.channel, id: raw.id, scheduledAt: raw.scheduledAt };
  });
}

function strongest(posts: Evidence[]) {
  for (const signal of signals) {
    const best = posts.filter(post => (post.metrics?.[signal] ?? 0) > 0)
      .sort((a, b) => b.metrics![signal]! - a.metrics![signal]!)[0];
    if (best) return { post: best, count: best.metrics![signal]!, signal };
  }
}

function learnObservations(results: Results, evidence: Evidence[], config: ResultConfig): Lesson[] {
  const hours = new Intl.DateTimeFormat('en', { timeZone: config.timezone, hour: '2-digit', hourCycle: 'h23' });
  const observations: Lesson[] = [];
  for (const row of results.channels) {
    const posts = evidence.filter(post => post.channel === row.channel);
    const best = strongest(posts.filter(post => post.scheduledAt &&
      Date.parse(post.scheduledAt) <= Date.parse(results.observedAt)));
    const bestHour = best ? Number(hours.format(new Date(best.post.scheduledAt!))) : undefined;
    const parts: string[] = [];
    if (best) {
      parts.push(`A post scheduled in the ${String(bestHour).padStart(2, '0')}:00 hour recorded ${best.count} ${best.signal}. Retest this hour; the observation does not establish an effect.`);
    } else if (row.views !== undefined) {
      parts.push(`${row.views} views recorded; no recommendation without a scheduled slot with positive counts.`);
    }
    const hook = best?.post.hook ? best : strongest(posts.filter(post => post.hook));
    const angle = best?.post.angle ? best : strongest(posts.filter(post => post.angle));
    const bestHook = hook?.post.hook ? plain(hook.post.hook, 100) : undefined;
    const bestAngle = angle?.post.angle ? plain(angle.post.angle, 100) : undefined;
    if (bestHook && hook) parts.push(`Recorded hook: “${bestHook}” (${hook.count} ${hook.signal}).`);
    if (bestAngle && angle) parts.push(`Recorded angle: “${bestAngle}” (${angle.count} ${angle.signal}).`);
    if (row.clicks === 0) parts.push('Zero clicks were measured where counts were available; revisit channel fit.');
    else if (row.clicks !== undefined) parts.push(`${row.clicks} clicks recorded.`);
    if (!parts.length) continue;
    observations.push({ time: results.observedAt, channel: row.channel, lesson: parts.join(' '), bestHour, bestHook,
      bestAngle, ...(row.clicks !== undefined && { zeroMeasuredClicks: row.clicks === 0 }) });
  }
  return observations;
}

export async function learn(cwd: string, historyPath = defaultHistoryPath()) {
  const paths = launchDir(cwd);
  const config = checked<ResultConfig>('config', await readJson(paths.config));
  const results = checked<Results>('results', await readJson(paths.results));
  const checkpoint = checkpointAt(config, new Date(results.observedAt));
  const { details } = checkpointPaths(cwd, config.launchDate, checkpoint);
  const detail = record(await readJson(details));
  const evidence = observedEvidence(detail, results, config);
  const observations = learnObservations(results, evidence, config);
  const calibration = calibrate(evidence, calibrationInput(detail.rubric));
  await withWriteLock(historyPath, async () => {
    const history = await readHistory(historyPath);
    const existing = history.profiles[config.profile] ?? [];
    const unchanged = existing.filter(item => !observations.some(next => item.channel === next.channel && item.time === next.time));
    history.profiles[config.profile] = [...unchanged, ...observations];
    if (calibration || history.judgeCalibrations?.[config.profile]?.length) {
      const grouped = history.judgeCalibrations ??= {};
      const prior = (grouped[config.profile] ?? []).filter(item => item.time !== results.observedAt);
      grouped[config.profile] = calibration ? [...prior, { ...calibration, time: results.observedAt }] : prior;
    }
    await writeJson(historyPath, checked<History>('history', history));
  });
  return { path: historyPath, profile: config.profile, observations, calibration };
}
