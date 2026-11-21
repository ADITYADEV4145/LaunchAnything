import type { Command } from 'commander';
import { resolve } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { retro } from '../results/retro.js';

export function register(program: Command) {
  program.command('retro').option('--history <file>')
    .action(async (options) => {
      const globals = commandOptions(program);
      const cwd = resolve(globals.cwd ?? process.cwd());
      output('retro', await retro(cwd, options.history ? resolve(cwd, options.history) : undefined), globals.json);
    });
}
