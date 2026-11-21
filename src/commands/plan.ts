import type { Command } from 'commander';
import { resolve } from 'node:path';
import { plan } from '../planning/plan.js';
import { commandOptions, output } from '../core/output.js';

export function register(program: Command) {
  program.command('plan').description('Create a deterministic, profile-appropriate launch plan')
    .option('--date <date>', 'Override the launch date for this plan (YYYY-MM-DD)')
    .option('--history <file>', 'Override ~/.liftoff/history.json')
    .action(async (options: { date?: string; history?: string }) => {
      const globals = commandOptions(program);
      const cwd = resolve(globals.cwd ?? process.cwd());
      const result = await plan(cwd, { date: options.date,
        historyPath: options.history === undefined ? undefined : resolve(cwd, options.history) });
      output('plan', globals.json ? result : `${result.path}\n${result.markdown}`, globals.json);
    });
}
