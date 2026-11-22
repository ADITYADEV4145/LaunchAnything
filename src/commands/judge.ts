import type { Command } from 'commander';
import { resolve } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { judgeWithHistory } from '../copy/judge.js';
export function register(program: Command) {
  program.command('judge').description('Score drafts on hook, specificity, proof, native style, clarity and voice; never calls an LLM')
    .option('--channel <channel...>', 'Channels to judge').option('--json', 'JSON output')
    .option('--history <file>', 'Override ~/.liftoff/history.json for the reported aggregate')
    .action(async ({ channel, history }: { channel?: string[]; history?: string }, command: Command) => {
      const options = commandOptions(command);
      const cwd = resolve(options.cwd ?? process.cwd());
      try {
        const result = await judgeWithHistory(cwd, channel, history === undefined ? undefined : resolve(cwd, history));
        if (!result.passed) process.exitCode = 1;
        if (options.json) console.log(JSON.stringify({ ok: result.passed, command: 'judge', data: result }));
        else output('judge', result);
      } catch (error) { output('judge', undefined, options.json, String(error)); }
    });
}
