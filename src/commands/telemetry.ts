import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { telemetry } from '../adopt/telemetry.js';
export function register(program: Command) {
  program.command('telemetry [action]').description('on, off or status; anonymous local counts only, never uploaded')
    .action(async (action: string | undefined, _options, command: Command) => { output('telemetry', await telemetry(action), commandOptions(command).json); });
}
