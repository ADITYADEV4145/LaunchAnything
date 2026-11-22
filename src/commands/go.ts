import type { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { commandOptions, output } from '../core/output.js';
import { go } from '../go/run.js';

export function register(program: Command) {
  program.command('go').description('Run the launch schedule with revocable standing publishing consent')
    .option('--confirm', 'Publish using standing consent; default is a read-only dry run')
    .option('--dry-run', 'Show cost and the full timeline without writing')
    .option('--yes', 'Founder already consented in chat to the displayed channels/routes/accounts')
    .option('--by <name>', 'Founder granting consent', 'Founder')
    .option('--revoke', 'Revoke standing publishing consent')
    .option('--mock', 'Use mock publishers only (isolated fixture launches)')
    .option('--no-wait', 'Run all mock slots immediately')
    .option('--ph-submit', 'Founder explicitly confirmed PH final submission for this run')
    .option('--account <account>', 'Connected account (when ambiguous)')
    .action(async (options, command: Command) => {
      const { cwd, json } = commandOptions(command);
      if (options.confirm && options.dryRun) throw new Error('Choose --dry-run or --confirm');
      if (options.revoke && (options.confirm || options.dryRun)) throw new Error('--revoke must be used alone');
      const result = await go(cwd, { ...options, noWait: options.wait === false,
        log: message => { if (!json) console.log(message); },
        ask: async message => {
          if (!stdin.isTTY || !stdout.isTTY) return false;
          const reader = createInterface({ input: stdin, output: stdout });
          try { return /^y(es)?$/i.test((await reader.question(message + ' [y/N] ')).trim()); }
          finally { reader.close(); }
        } });
      if ('board' in result && result.board?.some(row => row.status === 'failed')) process.exitCode = 1;
      output('go', result, json);
    });
}
