import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { buildReview } from '../review/page.js';

export function register(program: Command) {
  program.command('review').description('Build a local page for reviewing and approving launch posts')
    .action(async (_options, command: Command) => {
      const { cwd, json } = commandOptions(command);
      output('review', await buildReview(cwd), json);
    });
}
