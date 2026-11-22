import { checked } from './files.js';

export const metricNames = ['views', 'likes', 'comments', 'clicks', 'starsDelta', 'signups', 'waitlistConversions'] as const;
type Metric = typeof metricNames[number];
export type Metrics = Partial<Record<Metric, number>>;
export interface ResultChannel extends Metrics { channel: string }
export interface Results { observedAt: string; channels: ResultChannel[] }
export interface PublishedPost {
  channel: string; id: string; status: 'manual' | 'scheduled' | 'published' | 'failed' | 'cancelled';
  url?: string; scheduledAt?: string;
}
export interface Comment {
  id: string; author: string; body: string; answered: boolean; url?: string; likes?: number;
}
export interface PostObservation {
  metrics?: Metrics; owned?: boolean; comments?: Comment[]; hook?: string; angle?: string;
  utmContent?: string; copy?: string; judge?: Judgement;
}
export interface ObservedPost extends PublishedPost, PostObservation {}
export interface ResultConfig { profile: string; launchDate: string; timezone: string }
export interface Judgement { score: number; dimensions?: Record<string, number> }

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
export const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
export const validUtmContent = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w.~:-]{1,200}$/.test(value);
export const postKey = (channel: string, id: string) => JSON.stringify([channel, id]);

function textField(data: Record<string, unknown>, key: string, channel: string) {
  const value = data[key];
  if (value !== undefined && !nonempty(value)) throw new Error(`Invalid ${channel} ${key}`);
  return value;
}

function normalizeJudge(value: unknown, channel: string): Judgement | undefined {
  if (value === undefined) return;
  const { score, dimensions } = record(value);
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
  if (!valid(score)) throw new Error(`Invalid ${channel} judge score; expected 0–100`);
  if (dimensions === undefined) return { score };
  const values = Object.entries(record(dimensions)).map(([key, n]) => {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key) || !valid(n)) throw new Error(`Invalid ${channel} judge dimension`);
    return [key, n] as const;
  });
  return { score, dimensions: Object.fromEntries(values) };
}

export function normalizeObservation(raw: unknown, channel: string): PostObservation {
  const data = record(raw);
  let metrics: Metrics | undefined;
  if (data.metrics !== undefined) {
    const values = record(data.metrics);
    metrics = {};
    for (const name of metricNames) {
      if (values[name] === undefined) continue;
      const value = values[name];
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || (name !== 'starsDelta' && value < 0))
        throw new Error(`Invalid ${channel} ${name} count`);
      metrics[name] = value;
    }
  }
  const owned = data.owned;
  if (owned !== undefined && typeof owned !== 'boolean') throw new Error(`Invalid ${channel} ownership flag`);
  const { utmContent } = data;
  if (utmContent !== undefined && !validUtmContent(utmContent)) throw new Error(`Invalid ${channel} utmContent`);
  let comments: Comment[] | undefined;
  if (data.comments !== undefined) {
    if (!Array.isArray(data.comments)) throw new Error(`Invalid ${channel} comments`);
    const ids = new Set<string>();
    comments = data.comments.map(raw => {
      const { id, author, body, answered, url, likes } = record(raw);
      if (!nonempty(id) || ids.has(id) || !nonempty(author) || !nonempty(body) || typeof answered !== 'boolean' ||
        (url !== undefined && !nonempty(url)) ||
        (likes !== undefined && (typeof likes !== 'number' || !Number.isSafeInteger(likes) || likes < 0)))
        throw new Error(`Invalid or duplicate ${channel} comment`);
      ids.add(id);
      return { id, author, body, answered, url, likes };
    });
  }
  return { metrics, owned, comments, utmContent, hook: textField(data, 'hook', channel),
    angle: textField(data, 'angle', channel), copy: textField(data, 'copy', channel),
    judge: normalizeJudge(data.judge, channel) };
}

export function manualObservations(raw: unknown, published: PublishedPost[]) {
  const observations = new Map<string, PostObservation>();
  const data = record(raw);
  if (!Array.isArray(data.posts)) throw new Error('Metrics input requires a posts array');
  const eligible = new Set(published.map(post => postKey(post.channel, post.id)));
  for (const item of data.posts) {
    const entry = record(item);
    if (!nonempty(entry.channel) || !nonempty(entry.id)) throw new Error('Metrics input requires each post channel and id');
    const key = postKey(entry.channel, entry.id);
    if (!eligible.has(key)) throw new Error(`No eligible published.json entry for ${entry.channel} post ${entry.id}`);
    if (observations.has(key)) throw new Error(`Duplicate metrics for ${entry.channel} post ${entry.id}`);
    observations.set(key, normalizeObservation(entry, entry.channel));
  }
  return observations;
}

export function addMetric(left: number | undefined, right: number) {
  const total = (left ?? 0) + right;
  if (!Number.isSafeInteger(total)) throw new Error('Metric total exceeds the safe integer range');
  return total;
}

export function summarize(posts: ObservedPost[], now: Date, starsDelta?: number) {
  const channels = new Map<string, ResultChannel>();
  const reportedStars = new Set<number>();
  for (const post of posts) {
    const channel = channels.get(post.channel) ?? { channel: post.channel };
    for (const name of metricNames) {
      const value = post.metrics?.[name];
      if (value === undefined) continue;
      if (name === 'starsDelta') reportedStars.add(value);
      else channel[name] = addMetric(channel[name], value);
    }
    channels.set(post.channel, channel);
  }
  if (starsDelta === undefined && reportedStars.size > 1)
    throw new Error('Conflicting GitHub star changes; use one repository-wide delta.');
  const repositoryStars = starsDelta ?? reportedStars.values().next().value;
  if (repositoryStars !== undefined) {
    const github = channels.get('github-release') ?? { channel: 'github-release' };
    channels.set(github.channel, { ...github, starsDelta: repositoryStars });
  }
  return checked<Results>('results', { observedAt: now.toISOString(), channels: [...channels.values()] });
}
