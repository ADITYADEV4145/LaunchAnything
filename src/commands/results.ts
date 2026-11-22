import type { Command } from 'commander';
import { resolve } from 'node:path';
import { getAdapter } from '../adapters/index.js';
import { commandOptions, output } from '../core/output.js';
import { collect } from '../results/collect.js';

export function register(program: Command) {
  program.command('results').description('Collect T+1, T+3, T+7 or T+30 observations and prepare local drafts')
    .option('--metrics <file>', 'Import per-post metrics, UTM counts and comments (default: .launch/metrics.json)')
    .option('--github', 'Read a public GitHub repository star count to compare with the pre-launch scan')
    .option('--replies', 'Prepare local reply drafts for unanswered comments on owned posts')
    .option('--repurpose-media <file>', 'Render local carousel and 9:16 drafts using an explicit media sources JSON file')
    .action(async (options: { metrics?: string; github?: boolean; replies?: boolean; repurposeMedia?: string }) => {
      const { cwd, json } = commandOptions(program);
      const root = resolve(cwd ?? process.cwd());
      const result = await collect(root, {
        metricsPath: options.metrics, github: options.github, replies: options.replies, repurposeMediaPath: options.repurposeMedia,
        readStatus: ({ channel, id }) => getAdapter(channel, id, root).status(channel, id, root),
      });
      output('results', result, json);
    });
}
