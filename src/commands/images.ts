import type { Command } from 'commander';
import { makeImages } from '../visuals/images.js';
import { output, commandOptions } from '../core/output.js';
import { maskSecrets } from '../visuals/privacy.js';
export function register(program: Command) {
  program.command('images').option('--template <name>').option('--size <id>').option('--headline <text>').action(async (_opts, command: Command) => {
    const opts = commandOptions(command);
    try { output('images', await makeImages(opts.cwd ?? process.cwd(), command.opts()), opts.json); }
    catch (e) { output('images', null, opts.json, maskSecrets((e as Error).message)); }
  });
}
