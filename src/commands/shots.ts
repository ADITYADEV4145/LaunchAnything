import type { Command } from 'commander';
import { takeShots } from '../visuals/shots.js';
import { output, commandOptions } from '../core/output.js';
import { maskSecrets } from '../visuals/privacy.js';
import { planShots } from '../media/director.js';
import { exportStore, checkStore, parseStoreTargets } from '../media/store.js';
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
  shots.command('export').option('--targets <targets>', 'Comma-separated store targets (default: all)').option('--style <id>', 'Video style tokens', 'midnight').action(async (_opts, command: Command) => {
    const opts = commandOptions(command);
    try { output('shots export', await exportStore(opts.cwd ?? process.cwd(), parseStoreTargets(command.opts().targets), command.opts().style), opts.json); }
    catch (e) { output('shots export', null, opts.json, maskSecrets((e as Error).message)); }
  });
  shots.command('check').action(async (_opts, command: Command) => {
    const opts = commandOptions(command);
    try { output('shots check', await checkStore(opts.cwd ?? process.cwd()), opts.json); }
    catch (e) { output('shots check', null, opts.json, maskSecrets((e as Error).message)); }
  });
}
