import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { prepare, pair, record, score, run } from '../bench/index.js';
export function register(program: Command) {
  const bench = program.command('bench').description('LaunchBench: prepare agent drafts and score imported human votes; no LLM calls');
  for (const [name, work] of Object.entries({ prepare, pair, score, run })) {
    bench.command(name).option('--run <id>', 'Run ID (latest for pair/score/run)').option('--product <id>', 'Product to prepare/pair').option('--seed <seed>', 'Private deterministic pairing seed')
      .action(async (options, command: Command) => { const globals = commandOptions(command); output(`bench ${name}`, await work(globals.cwd ?? process.cwd(), options), globals.json); });
  }
  bench.command('record').requiredOption('--votes <file>', 'Human ballot JSON file').option('--run <id>', 'Run ID (default latest)')
    .action(async (options, command: Command) => { const globals = commandOptions(command); output('bench record', await record(globals.cwd ?? process.cwd(), options.votes, options), globals.json); });
}
