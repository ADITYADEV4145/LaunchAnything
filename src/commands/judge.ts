import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { judgePosts } from '../copy/judge.js';
export function register(program: Command) {
  program.command('judge').description('Score drafts on hook, specificity, proof, native style, clarity and voice; never calls an LLM')
    .option('--channel <channel...>', 'Channels to judge').option('--json', 'JSON output')
    .action((_options, command: Command) => {
      const options = commandOptions(command);
      try {
        const result = judgePosts(options.cwd ?? process.cwd(), command.opts().channel);
        if (!result.passed) process.exitCode = 1;
        if (options.json) console.log(JSON.stringify({ ok: result.passed, command: 'judge', data: result }));
        else output('judge', result);
      } catch (error) { output('judge', undefined, options.json, String(error)); }
    });
}
