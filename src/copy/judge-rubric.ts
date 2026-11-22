export const criteria = ['hook', 'specificity', 'proof', 'native', 'clarity', 'voice'] as const;
export type Criterion = typeof criteria[number];
export type Scores = Record<Criterion, number>;

export const copyRubric = {
  rubricId: 'liftoff-copy-v1',
  weights: Object.fromEntries(criteria.map(key => [key, 1])) as Scores,
};

export function copyWeights(weights: Record<string, number> | undefined): Scores | undefined {
  if (weights && Object.keys(weights).length === criteria.length &&
    criteria.every(key => Number.isFinite(weights[key]) && weights[key] > 0 && weights[key] <= 100))
    return weights as Scores;
}

export function aggregateScore(scores: Scores, weights: Scores) {
  const total = criteria.reduce((sum, key) => sum + weights[key], 0);
  const score = criteria.reduce((sum, key) => sum + scores[key] * (weights[key] / total), 0);
  return Math.round(score * 100) / 10;
}
