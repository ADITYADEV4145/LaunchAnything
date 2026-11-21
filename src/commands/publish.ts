import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { publish } from '../adapters/publish.js';

export function register(program: Command) {
  program.command('publish').description('Preview or stage an approved launch locally; never posts externally')
    .option('--dry-run', 'Print the launch plan without writing files (default)')
    .option('--confirm', 'Write local paste files, reminders, and receipts')
    .action(async (options: { dryRun?: boolean; confirm?: boolean }, command: Command) => {
      if (options.dryRun && options.confirm) throw new Error('Choose either --dry-run or --confirm');
      const { cwd, json } = commandOptions(command);
      output('publish', await publish(cwd, options.confirm), json);
    });
}
