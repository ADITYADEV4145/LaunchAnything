import { resolve, join } from 'node:path';

export const launchPaths = {
  config: 'config.json', scan: 'scan.json', product: 'product.json', plan: 'plan.md',
  posts: 'posts', shots: 'shots.yaml', media: 'media', video: 'video', review: 'review',
  approvals: 'approvals.json', published: 'published.json', results: 'results.json', report: 'report.md',
} as const;

export function launchDir(cwd = process.cwd()) {
  const root = resolve(cwd, '.launch');
  return { root, ...Object.fromEntries(Object.entries(launchPaths).map(([key, path]) =>
    [key, join(root, path)])) } as { root: string } & Record<keyof typeof launchPaths, string>;
}
