import type { Command } from 'commander';
import { resolve } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { recommend } from '../recommend/index.js';
export function register(program: Command) {
  program.command('recommend').description('Rank grounded channels, angles and founder-local posting windows (offline, nothing sent)')
    .option('--history <path>', 'Override ~/.liftoff/history.json')
    .action(async (options: { history?: string }) => {
      const globals = commandOptions(program), cwd = resolve(globals.cwd ?? process.cwd());
      const result = await recommend(cwd, { historyPath: options.history === undefined ? undefined : resolve(cwd, options.history) });
      output('recommend', globals.json ? result : result.path + '\n' + result.markdown, globals.json);
    });
}
