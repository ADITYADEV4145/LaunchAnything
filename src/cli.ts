#!/usr/bin/env node
import { Command } from 'commander';
import { registerCommands } from './commands/index.js';
import { output } from './core/output.js';

const program = new Command();
program.name('liftoff').description('Grounded, human-approved launch kits')
  .version('0.1.0').option('--json', 'Print one JSON result')
  .option('--cwd <directory>', 'Repository working directory');
registerCommands(program);
function configureErrors(command: Command) {
  command.configureOutput({
    writeErr: text => { if (!process.argv.includes('--json')) process.stderr.write(text); },
    outputError: () => {},
  });
  command.exitOverride();
  for (const child of command.commands) configureErrors(child);
}
configureErrors(program);
try {
  await program.parseAsync();
} catch (error) {
  const failure = error as Error & { code?: string; exitCode?: number };
  const json = process.argv.includes('--json');
  if (failure.code === 'commander.help' && !json) process.exitCode = failure.exitCode ?? 1;
  else if (failure.exitCode !== 0) output(program.args[0] ?? 'liftoff', undefined,
    json, failure.code === 'commander.help' ? 'A command is required; run liftoff --help' : failure.message,
    failure.exitCode ?? 1);
}
