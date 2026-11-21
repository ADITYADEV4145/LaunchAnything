import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { checkPosts } from '../copy/check.js';
export function register(program: Command) {
  program.command('check').option('--channel <channel...>', 'Channels to process')
    .option('--json', 'JSON output')
    .action((_options, command: Command) => {
      const options = commandOptions(command);
      try {
        const result = checkPosts(options.cwd ?? process.cwd(), command.opts().channel);
        if (!result.passed) process.exitCode = 1;
        if (options.json) console.log(JSON.stringify({ ok: result.passed, command: 'check', data: result }));
        else output('check', result);
      } catch (error) { output('check', undefined, options.json, String(error)); }
    });
}
