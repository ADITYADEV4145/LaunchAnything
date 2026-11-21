import type { Command } from 'commander';
import { resolve } from 'node:path';
import { validate } from '../product/validate.js';
import { validateBrief } from '../brief/index.js';
import { commandOptions, output } from '../core/output.js';

export function register(program: Command) {
  program.command('validate').description('Validate a launch artifact and product source references')
    .argument('<kind>', 'Schema name, e.g. product, config, scan or shots')
    .option('--file <path>', 'Explicit input file, relative to --cwd')
    .action(async (kind: string, options: { file?: string }) => {
      const globals = commandOptions(program);
      const cwd = resolve(globals.cwd ?? process.cwd());
      const result = kind === 'brief' ? validateBrief(cwd, options.file) : await validate(cwd, kind, options.file);
      output('validate', result, globals.json, result.valid ? undefined : result.errors.join('\n'));
    });
}
