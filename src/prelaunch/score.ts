import { readInput, type Input } from './input.js';

export function scoreReadiness(input: Input) {
  const weights = { install: 30, demo: 30, mainPath: 40 } as const;
  const checks = (Object.keys(weights) as (keyof typeof weights)[]).map(id => ({
    id, ...input.checks[id], weight: weights[id],
  }));
  const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  const threshold = input.threshold ?? 80;
  return { score, threshold, ready: score >= threshold, checks };
}

export function requireLaunchReadiness(cwd = process.cwd()) {
  const input = readInput(cwd);
  if (!input) return;
  const { score, threshold, ready } = scoreReadiness(input);
  if (!ready) throw new Error(`Pre-launch readiness ${score}/100 is below ${threshold}; run liftoff prelaunch for details`);
}
