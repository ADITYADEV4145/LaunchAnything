import type { Command } from 'commander';
import { resolve } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { release } from '../launch-ops/release.js';

export function register(program: Command) {
  program.command('release').option('--from <tag>').option('--to <ref>').option('--type <type>').option('--cadence <cadence>')
    .action(async (options) => {
      const globals = commandOptions(program);
      const cwd = resolve(globals.cwd ?? process.cwd());
      output('release', await release(cwd, options), globals.json);
    });
}
