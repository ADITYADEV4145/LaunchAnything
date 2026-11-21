import type { Command } from 'commander';
import { resolve } from 'node:path';
import { doctor } from '../core/doctor.js';
import { commandOptions, output } from '../core/output.js';
export function register(program: Command) {
  program.command('doctor').description('Discover optional skills, MCP servers and tools')
    .action(async () => {
      const options = commandOptions(program);
      output('doctor', await doctor(resolve(options.cwd ?? process.cwd())), options.json);
    });
}
