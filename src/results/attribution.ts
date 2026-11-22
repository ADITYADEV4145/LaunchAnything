import { addMetric, record, validUtmContent, type ObservedPost } from './metrics.js';

export const trackedMetrics = ['clicks', 'signups', 'waitlistConversions'] as const;
type TrackedMetric = typeof trackedMetrics[number];
type Counts = Partial<Record<TrackedMetric, number>>;

export function attribute(posts: ObservedPost[], raw?: unknown) {
  const byContent = new Map<string, ObservedPost>();
  for (const post of posts) {
    if (!post.utmContent) continue;
    if (byContent.has(post.utmContent)) throw new Error('Multiple posts share the same utmContent');
    byContent.set(post.utmContent, post);
  }
  const unmatched: Counts = {};
  const matched = new Map<ObservedPost, Counts>();
  if (raw !== undefined) {
    if (!Array.isArray(raw)) throw new Error('Metrics attribution must be an array of UTM counts');
    const seen = new Set<string | undefined>();
    for (const item of raw) {
      const entry = record(item);
      const { utmContent } = entry;
      if (utmContent !== undefined && !validUtmContent(utmContent)) throw new Error('Invalid attribution utmContent');
      if (seen.has(utmContent)) throw new Error('Duplicate UTM attribution row');
      seen.add(utmContent);
      const target = utmContent === undefined ? undefined : byContent.get(utmContent);
      const counts: Counts = {};
      for (const name of trackedMetrics) {
        const count = entry[name];
        if (count === undefined) continue;
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
          throw new Error(`Invalid UTM ${name} count`);
        counts[name] = count;
        if (!target) unmatched[name] = addMetric(unmatched[name], count);
      }
      if (!Object.keys(counts).length) throw new Error('UTM attribution row has no counts');
      if (target) matched.set(target, counts);
    }
  }
  return {
    posts: posts.map(post => {
      const attribution = matched.get(post);
      return { ...post, attribution, metrics: { ...post.metrics, ...attribution } };
    }),
    unmatched,
  };
}
export type AttributedPost = ReturnType<typeof attribute>['posts'][number];
