import type { Command } from 'commander';
import { printEstimate } from '../adopt/estimate.js';
import { commandOptions, output } from '../core/output.js';
import { publish } from '../adapters/publish.js';
import { assistedPublish } from '../connect/publish.js';

export function register(program: Command) {
  program.command('publish').description('Preview or stage an approved launch locally; never posts externally')
    .option('--dry-run', 'Print the launch plan without writing files (default)')
    .option('--confirm', 'Write local paste files, reminders, and receipts')
    .option('--assist [channel]', 'Fill a connected browser form; you press Submit')
    .option('--account <handle>', 'Connected account to use')
    .action(async (options: { dryRun?: boolean; confirm?: boolean; assist?: string | boolean; account?: string }, command: Command) => {
      if (options.dryRun && options.confirm) throw new Error('Choose either --dry-run or --confirm');
      const { cwd, json } = commandOptions(command);
      if (options.assist && !options.confirm) throw new Error('--assist requires --confirm');
      printEstimate(cwd ?? process.cwd(), 'publish', json);
      output('publish', options.assist ? await assistedPublish(cwd, { channel: typeof options.assist === 'string' ? options.assist : undefined, account: options.account }) : await publish(cwd, options.confirm), json);
    });
}
