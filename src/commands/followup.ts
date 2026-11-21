import type { Command } from 'commander';
import { resolve } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { followup } from '../launch-ops/followup.js';

export function register(program: Command) {
  program.command('followup')
    .action(async (options) => {
      const globals = commandOptions(program);
      const cwd = resolve(globals.cwd ?? process.cwd());
      output('followup', await followup(cwd), globals.json);
    });
}
