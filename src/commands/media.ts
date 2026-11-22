import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { maskSecrets } from '../visuals/privacy.js';
import { polish } from '../media/polish.js';
export function register(program: Command) {
  const media = program.command('media').description('Polish and inspect captured product media');
  media.command('polish').action(async (_opts, command: Command) => {
    const opts = commandOptions(command);
    try { output('media polish', await polish(opts.cwd ?? process.cwd()), opts.json); }
    catch (error) { output('media polish', null, opts.json, maskSecrets((error as Error).message)); }
  });
}
