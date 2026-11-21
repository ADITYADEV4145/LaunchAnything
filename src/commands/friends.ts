import type { Command } from 'commander';
import { resolve } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { friends } from '../launch-ops/friends.js';

export function register(program: Command) {
  program.command('friends').option('--check', 'Check edited drafts for vote requests')
    .action(async (options) => {
      const globals = commandOptions(program);
      const cwd = resolve(globals.cwd ?? process.cwd());
      output('friends', await friends(cwd, options), globals.json);
    });
}
