import type { Command } from 'commander';
import { resolve } from 'node:path';
import { getAdapter } from '../adapters/index.js';
import { commandOptions, output } from '../core/output.js';
import { collect } from '../results/collect.js';

export function register(program: Command) {
  program.command('results').description('Collect the current launch checkpoint and prepare a report')
    .option('--metrics <file>', 'Import local per-post metrics and comments (default: .launch/metrics.json)')
    .option('--github', 'Read a public GitHub repository star count to compare with the pre-launch scan')
    .option('--replies', 'Prepare local reply drafts for unanswered comments on owned posts')
    .action(async (options: { metrics?: string; github?: boolean; replies?: boolean }) => {
      const { cwd, json } = commandOptions(program);
      const root = resolve(cwd ?? process.cwd());
      const result = await collect(root, {
        metricsPath: options.metrics, github: options.github, replies: options.replies,
        readStatus: ({ channel, id }) => getAdapter(channel, id).status(channel, id, root),
      });
      output('results', result, json);
    });
}
