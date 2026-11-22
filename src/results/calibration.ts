import { nonempty, record, type Metrics, type PostObservation } from './metrics.js';
import { performanceSignals } from './repurpose.js';

interface ScoredPost extends PostObservation { channel: string; id?: string }
type Signal = typeof performanceSignals[number];

export function calibrationInput(raw: unknown) {
  if (raw === undefined) return undefined;
  const { rubricId, weights } = record(raw);
  if (!nonempty(rubricId) || !/^[\w.:-]{1,100}$/.test(rubricId)) throw new Error('Invalid rubricId');
  const entries: Array<[string, number]> = Object.entries(record(weights)).map(([key, value]) => {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key) || typeof value !== 'number' ||
      !Number.isFinite(value) || value < 0.001 || value > 100) throw new Error('Invalid rubric weight');
    return [key, value];
  });
  if (entries.length < 2) throw new Error('Calibration requires at least two rubric weights');
  return { rubricId, weights: Object.fromEntries(entries) };
}

function concordance(rows: Array<{ actual: number; judged: number }>) {
  let agree = 0, disagree = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const order = Math.sign(rows[i].actual - rows[j].actual) * Math.sign(rows[i].judged - rows[j].judged);
      if (order > 0) agree++;
      else if (order < 0) disagree++;
    }
  }
  return agree + disagree ? (agree - disagree) / (agree + disagree) : 0;
}

function compare(posts: ScoredPost[], signal: Signal) {
  return posts.flatMap(({ channel, id, judge, metrics }) => {
    const actual = metrics?.[signal];
    return judge && actual !== undefined ? [{ channel, id, score: judge.score, actual, dimensions: judge.dimensions }] : [];
  });
}

export function calibrate(posts: ScoredPost[], rubric?: ReturnType<typeof calibrationInput>) {
  const tracked = posts.filter(post => post.judge).map(({ channel, id, judge, metrics }) =>
    ({ channel, id, score: judge!.score, metrics: Object.fromEntries(performanceSignals.flatMap(metric => {
      const count = metrics?.[metric];
      return count === undefined ? [] : [[metric, count]];
    })) as Metrics }));
  if (!tracked.length) return undefined;
  const signal = performanceSignals.find(metric => {
    const rows = compare(posts, metric);
    return rows.length >= 3 && new Set(rows.map(r => r.actual)).size >= 2;
  });
  const rows = signal ? compare(posts, signal) : [];
  const leaders = [...rows].sort((a, b) => b.actual - a.actual);
  const low = rows.filter(row => row.score >= 75 && row.actual * 2 <= leaders[0].actual &&
    leaders.some(leader => leader.actual === leaders[0].actual && leader.score < row.score));
  const base = { signal, samples: tracked, comparablePosts: rows.length,
    scoreAgreement: rows.length ? concordance(rows.map(row => ({ actual: row.actual, judged: row.score }))) : undefined,
    highScoredLowPerformance: low.map(({ channel, id, score, actual }) => ({ channel, id, score, actual })),
    rubricId: rubric?.rubricId, originalWeights: rubric?.weights,
    suggestedWeights: undefined as Record<string, number> | undefined };
  if (!rows.length) return { ...base, reason: 'Need at least three scored posts with comparable measured results.' };
  if (!low.length) return { ...base, reason: 'No high-scoring post underperformed a lower-scoring leader by at least half.' };
  if (!rubric) return { ...base, reason: 'Supply versioned rubric weights and complete dimension scores to calibrate.' };
  const names = Object.keys(rubric.weights);
  if (rows.some(row => names.some(name => row.dimensions?.[name] === undefined)))
    return { ...base, reason: 'At least one comparable post is missing a rubric dimension score.' };
  const agreement = names.map(name =>
    concordance(rows.map(row => ({ actual: row.actual, judged: row.dimensions![name] }))));
  if (new Set(agreement).size < 2) return { ...base, reason: 'No measured dimension separated results better than the others.' };
  const sum = Object.values(rubric.weights).reduce((a, b) => a + b, 0);
  const adjusted = names.map((name, i) => rubric.weights[name] / sum * (1 + 0.1 * agreement[i]));
  const adjustedSum = adjusted.reduce((a, b) => a + b, 0);
  const suggestedWeights = Object.fromEntries(names.map((name, i) => [name, adjusted[i] * (sum / adjustedSum)]));
  return { ...base, suggestedWeights,
    reason: 'Weights adjusted conservatively according to rank agreement with measured outcomes. Review before applying.' };
}
