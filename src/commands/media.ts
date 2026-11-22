import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { maskSecrets } from '../visuals/privacy.js';
import { polish } from '../media/polish.js';
import { judge } from '../media/judge.js';
export function register(program: Command) {
  const media = program.command('media').description('Polish and inspect captured product media');
  media.command('judge').option('--heuristic-only', 'Use heuristics without vision overrides').option('--write-vision-template', 'Write a per-asset hash-bound scoring template').action(async (options, command: Command) => {
    const opts = commandOptions(command);
    try { output('media judge', await judge(opts.cwd ?? process.cwd(), options), opts.json); }
    catch (error) { output('media judge', null, opts.json, maskSecrets((error as Error).message)); }
  });
  media.command('polish').action(async (_opts, command: Command) => {
    const opts = commandOptions(command);
    try { output('media polish', await polish(opts.cwd ?? process.cwd()), opts.json); }
    catch (error) { output('media polish', null, opts.json, maskSecrets((error as Error).message)); }
  });
}
