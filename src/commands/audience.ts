import type { Command } from 'commander';
import { resolve } from 'node:path';
import { approve, prepare, review } from '../audience/index.js';
import { exportSignups, importSignups } from '../audience/waitlist.js';
import { commandOptions, output } from '../core/output.js';

export function register(program: Command) {
  const audience = program.command('audience').description('Prepare local, never-sent pre-launch audience drafts');
  const options = () => {
    const globals = commandOptions(program);
    return { cwd: resolve(globals.cwd ?? process.cwd()), json: globals.json };
  };
  audience.command('prepare').description('Derive community map and seed editable Kit and audience drafts')
    .action(async () => {
      const { cwd, json } = options();
      output('audience', await prepare(cwd), json);
    });
  audience.command('review').description('Check drafts and show exact hashes for human review')
    .action(async () => {
      const { cwd, json } = options();
      output('audience', { drafts: await review(cwd), sent: false }, json);
    });
  audience.command('approve').description('Record a human decision for one reviewed draft; never send')
    .argument('<id>', 'Draft ID shown in audience review')
    .requiredOption('--hash <sha256>', 'Exact reviewed hash')
    .requiredOption('--by <name>', 'Human approver')
    .action(async (id: string, flags: { hash: string; by: string }) => {
      const { cwd, json } = options();
      output('audience', await approve(cwd, id, flags.hash, flags.by), json);
    });
  audience.command('import-signups').description('Merge consented signups into a private local file')
    .argument('<file>', 'Opt-in JSON file inside the repository')
    .action((file: string) => {
      const { cwd, json } = options();
      output('audience', importSignups(cwd, file), json);
    });
  audience.command('export-signups').description('Write a local Kit CSV; never upload it')
    .action(() => {
      const { cwd, json } = options();
      output('audience', exportSignups(cwd), json);
    });
}
