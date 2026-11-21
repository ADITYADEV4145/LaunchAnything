import type { Command } from 'commander';
import { resolve } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { warroom } from '../launch-ops/warroom.js';

export function register(program: Command) {
  program.command('warroom').option('--metrics <file>').option('--approve <commentId>').option('--by <name>')
    .action(async (options) => {
      const globals = commandOptions(program);
      const cwd = resolve(globals.cwd ?? process.cwd());
      const result = await warroom(cwd, options);
      output('warroom', globals.json ? result : result.markdown, globals.json);
    });
}
