import type { Command } from 'commander';
import { takeShots } from '../visuals/shots.js';
import { output, commandOptions } from '../core/output.js';
import { maskSecrets } from '../visuals/privacy.js';
import { planShots } from '../media/director.js';
export function register(program: Command) {
  const shots = program.command('shots').option('--url <url>').option('--command <command>').option('--only <id>').action(async (_opts, command: Command) => {
    const opts = commandOptions(command);
    try { output('shots', await takeShots(opts.cwd ?? process.cwd(), command.opts()), opts.json); }
    catch (e) { output('shots', null, opts.json, maskSecrets((e as Error).message)); }
  });
  shots.command('plan').option('--force', 'Overwrite shots.yaml').action(async (_opts, command: Command) => {
    const opts = commandOptions(command);
    try { output('shots plan', await planShots(opts.cwd ?? process.cwd(), command.opts()), opts.json); }
    catch (e) { output('shots plan', null, opts.json, maskSecrets((e as Error).message)); }
  });
}
