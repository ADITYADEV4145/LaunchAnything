import type { Command } from 'commander';
import { resolve } from 'node:path';
import { validate } from '../product/validate.js';
import { commandOptions, output } from '../core/output.js';

export function register(program: Command) {
  program.command('validate').description('Validate a launch artifact and product source references')
    .argument('<kind>', 'Schema name, e.g. product, config, scan or shots')
    .option('--file <path>', 'Explicit input file, relative to --cwd')
    .action(async (kind: string, options: { file?: string }) => {
      const globals = commandOptions(program);
      const result = await validate(resolve(globals.cwd ?? process.cwd()), kind, options.file);
      output('validate', result, globals.json, result.valid ? undefined : result.errors.join('\n'));
    });
}
