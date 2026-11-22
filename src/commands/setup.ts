import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { setup } from '../adopt/setup.js';
export function register(program: Command) {
  program.command('setup').description('Check tools and accounts; optionally import your brand and voice')
    .option('--yes', 'Report without prompting').option('--site <url>', 'Import brand HTML from URL')
    .option('--site-file <html>', 'Import brand from local HTML').option('--voice <paths...>', 'Owned writing samples')
    .action(async (options, command: Command) => { const globals = commandOptions(command); output('setup', await setup(globals.cwd ?? process.cwd(), { ...options, json: globals.json }), globals.json); });
}
