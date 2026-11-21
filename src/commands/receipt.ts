import type { Command } from 'commander';
import { resolve } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { receipt } from '../results/receipt.js';

export function register(program: Command) {
  program.command('receipt').description('Generate a shareable SVG from recorded launch metrics')
    .option('--no-footer', 'Omit the launched with Liftoff footer')
    .action(async (options: { footer: boolean }) => {
      const { cwd, json } = commandOptions(program);
      output('receipt', await receipt(resolve(cwd ?? process.cwd()), options.footer), json);
    });
}
