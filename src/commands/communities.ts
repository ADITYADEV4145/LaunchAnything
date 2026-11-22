import type { Command } from 'commander';
import { resolve } from 'node:path';
import { commandOptions, output } from '../core/output.js';
import { fetchCommunities, importEvidence, reportCommunities, checkCommunities } from '../communities/index.js';
export function register(program: Command) {
  const cwd = () => resolve(commandOptions(program).cwd ?? process.cwd());
  const emit = (name: string, value: unknown) => { output(name, value, commandOptions(program).json); };
  const report = async () => emit('communities report', await reportCommunities(cwd()));
  const command = program.command('communities').description('Find communities and prepare manual-only distribution drafts').action(report);
  command.command('report').action(report);
  command.command('fetch [queries...]').action(async (queries: string[]) => emit('communities fetch', await fetchCommunities(cwd(), queries)));
  command.command('import <file>').action(async (file: string) => emit('communities import', await importEvidence(cwd(), resolve(cwd(), file))));
  command.command('check').action(async () => { const result = await checkCommunities(cwd()); output('communities check', result, commandOptions(program).json, result.valid ? undefined : result.errors.join('; ')); });
}
