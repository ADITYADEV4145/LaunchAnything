export const criteria = ['hook', 'specificity', 'proof', 'native', 'clarity', 'voice'] as const;
export type Criterion = typeof criteria[number];
export type Scores = Record<Criterion, number>;

export const copyRubric = {
  rubricId: 'liftoff-copy-v1',
  weights: Object.fromEntries(criteria.map(key => [key, 1])) as Scores,
};

export function copyWeights(value: unknown): Scores | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const weights = value as Record<string, unknown>;
  if (Object.keys(weights).length === criteria.length && criteria.every(key => {
    const weight = weights[key];
    return typeof weight === 'number' && Number.isFinite(weight) && weight >= 0.001 && weight <= 100;
  })) return weights as Scores;
}

export function aggregateScore(scores: Scores, weights: Scores) {
  const total = criteria.reduce((sum, key) => sum + weights[key], 0);
  const score = criteria.reduce((sum, key) => sum + scores[key] * (weights[key] / total), 0);
  return Math.round(score * 100) / 10;
}
