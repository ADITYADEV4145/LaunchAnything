import type { Command } from 'commander';
import { resolve } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { release } from '../launch-ops/release.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageRoot } from '../core/package-root.js';
import { writeLocal } from '../results/files.js';
import { progress } from '../launch-ops/progress.js';

export function register(program: Command) {
  program.command('progress').option('--since <date>').option('--now <date>').action(async options => {
    const globals = commandOptions(program);
    output('progress', await progress(resolve(globals.cwd ?? process.cwd()), options), globals.json);
  });
  program.command('release').option('--from <tag>').option('--to <ref>').option('--type <type>').option('--cadence <cadence>')
    .option('--draft').option('--open-pr').option('--no-shots').option('--issues <file>').option('--install-action')
    .action(async (options) => {
      const globals = commandOptions(program);
      const cwd = resolve(globals.cwd ?? process.cwd());
      if (options.installAction) {
        const path = join(cwd, '.github/workflows/liftoff-release.yml');
        await writeLocal(path, await readFile(join(packageRoot(), 'templates/github/liftoff-release.yml'), 'utf8'));
        output('release', { path }, globals.json); return;
      }
      if (options.issues) options.issues = resolve(cwd, options.issues);
      output('release', await release(cwd, options), globals.json);
    });
}
