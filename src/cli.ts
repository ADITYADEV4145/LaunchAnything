#!/usr/bin/env node
import { Command } from 'commander';
import { registerCommands } from './commands/index.js';
import { output } from './core/output.js';

const program = new Command();
program.name('liftoff').description('Grounded, human-approved launch kits')
  .version('0.1.0').option('--json', 'Print one JSON result')
  .option('--cwd <directory>', 'Repository working directory');
registerCommands(program);
program.configureOutput({
  writeErr: text => { if (!process.argv.includes('--json')) process.stderr.write(text); },
});
program.exitOverride();
try {
  await program.parseAsync();
} catch (error) {
  const failure = error as Error & { code?: string; exitCode?: number };
  if (failure.exitCode !== 0) output(program.args[0] ?? 'liftoff', undefined,
    process.argv.includes('--json'), failure.message, failure.exitCode ?? 1);
}
