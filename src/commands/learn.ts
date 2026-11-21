import type { Command } from 'commander';
import { resolve } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { learn } from '../results/history.js';

export function register(program: Command) {
  program.command('learn').description('Save observations from the current results by launch profile')
    .option('--history <file>', 'Override ~/.liftoff/history.json')
    .action(async (options: { history?: string }) => {
      const { cwd, json } = commandOptions(program);
      const root = resolve(cwd ?? process.cwd());
      output('learn', await learn(root, options.history === undefined ? undefined : resolve(root, options.history)), json);
    });
}
