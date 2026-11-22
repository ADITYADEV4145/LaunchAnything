import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { runProof } from '../proof/run.js';

export function register(program: Command) {
  program.command('proof').description('Run configured benchmarks and record source-backed metrics')
    .command('run').option('--skip-run', 'Read previously recorded results without running commands')
    .option('--timeout <s>', 'Benchmark timeout in seconds', '1800')
    .action(async (flags: { skipRun?: boolean; timeout: string }, command: Command) => {
      const options = commandOptions(command);
      try {
        const result = await runProof(options.cwd ?? process.cwd(), { skipRun: flags.skipRun, timeout: Number(flags.timeout) });
        output('proof', options.json ? result : result.lines.join('\n'), options.json);
      } catch (error) { output('proof', undefined, options.json, String(error)); }
    });
}
