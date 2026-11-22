import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { writeBriefs } from '../copy/write.js';
import { printEstimate } from '../adopt/estimate.js';
export function register(program: Command) {
  program.command('write').option('--channel <channel...>', 'Channels to process')
    .option('--json', 'JSON output')
    .action((_options, command: Command) => {
      const options = commandOptions(command);
      try {
        const estimate = printEstimate(options.cwd ?? process.cwd(), 'write', options.json);
        const result = writeBriefs(options.cwd ?? process.cwd(), command.opts().channel);
        output('write', { ...result, estimate }, options.json);
      } catch (error) { output('write', undefined, options.json, String(error)); }
    });
}
