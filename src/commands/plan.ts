import type { Command } from 'commander';
import { resolve } from 'node:path';
import { plan } from '../planning/plan.js';
import { commandOptions, output } from '../core/output.js';

export function register(program: Command) {
  program.command('plan').description('Create a deterministic, profile-appropriate launch plan')
    .option('--date <date>', 'Override the launch date for this plan (YYYY-MM-DD)')
    .action(async (options: { date?: string }) => {
      const globals = commandOptions(program);
      const result = await plan(resolve(globals.cwd ?? process.cwd()), options);
      output('plan', globals.json ? result : `${result.path}\n${result.markdown}`, globals.json);
    });
}
