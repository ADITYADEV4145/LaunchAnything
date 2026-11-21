import type { Command } from 'commander';
import { resolve } from 'node:path';
import { init, type InitOptions } from '../product/init.js';
import { commandOptions, output } from '../core/output.js';

export function register(program: Command) {
  program.command('init').description('Detect a launch profile and create configuration')
    .option('--profile <profile>', 'Explicit launch profile')
    .option('--type <type>', 'Launch type: new-product, feature, changelog, relaunch')
    .option('--yes', 'Confirm the selected or detected profile')
    .option('--timezone <timezone>', 'IANA timezone')
    .option('--date <date>', 'Launch date (YYYY-MM-DD)')
    .option('--force', 'Replace existing configuration')
    .action(async (options: InitOptions) => {
      const globals = commandOptions(program);
      const result = await init(resolve(globals.cwd ?? process.cwd()), options);
      output('init', globals.json ? result : `${result.path}\n${result.message}`, globals.json);
    });
}
