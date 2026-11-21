import type { Command } from 'commander';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { commandOptions, output } from '../core/output.js';
import { fetchResearch, checkResearch, renderReport } from '../research/index.js';
export function register(program: Command) {
  const research = program.command('research [idea]').description('Fetch pain evidence, then have the agent cluster pains.json')
    .action(async (idea?: string) => {
      const options = commandOptions(program);
      if (!idea) throw new Error('Supply an idea, or use research fetch/check/report');
      output('research', await fetchResearch(resolve(options.cwd ?? process.cwd()), [idea]), options.json);
    });
  research.command('fetch [queries...]').option('--file <path>', 'JSON array or newline-separated queries')
    .action(async (queries: string[], opts: { file?: string }) => {
      const options = commandOptions(program); const cwd = resolve(options.cwd ?? process.cwd());
      if (opts.file) { const text = await readFile(resolve(cwd, opts.file), 'utf8'); queries = [...queries, ...(text.trim().startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).filter(Boolean))]; }
      if (queries.some(q => typeof q !== 'string')) throw new Error('Queries must be strings');
      output('research fetch', await fetchResearch(cwd, queries), options.json);
    });
  research.command('check').action(async () => {
    const options = commandOptions(program); const result = await checkResearch(resolve(options.cwd ?? process.cwd()));
    output('research check', result, options.json, result.valid ? undefined : result.errors.join('; '));
  });
  research.command('report').action(async () => {
    const options = commandOptions(program);
    output('research report', await renderReport(resolve(options.cwd ?? process.cwd())), options.json);
  });
}
