import type { Command } from 'commander';
import { resolve } from 'node:path';
import { scan } from '../product/scan.js';
import { commandOptions, output } from '../core/output.js';

export function register(program: Command) {
  program.command('scan').description('Collect local repository facts (offline by default)')
    .option('--github', 'Fetch public GitHub stars; network errors are nonfatal')
    .action(async (options: { github?: boolean }) => {
      const globals = commandOptions(program);
      output('scan', await scan(resolve(globals.cwd ?? process.cwd()), options), globals.json);
    });
}
