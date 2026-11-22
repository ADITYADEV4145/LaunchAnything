import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { pickVariant, stripClaims } from '../copy/edit.js';
import { prepareBlindTest, recordBlindTest, tallyBlindTest } from '../copy/blind-test.js';

const run = (name: string, command: Command, task: (cwd: string) => unknown, failed?: (data: unknown) => boolean) => {
  const options = commandOptions(command);
  try {
    const data = task(options.cwd ?? process.cwd());
    if (failed?.(data)) process.exitCode = 1;
    output(name, data, options.json);
  } catch (error) { output(name, undefined, options.json, String(error)); }
};

export function register(program: Command) {
  program.command('claims').description('Manage claim citations in drafts')
    .command('strip').description('Move inline [claim:id] tags into front-matter citations')
    .option('--channel <channel...>', 'Channels').option('--json', 'JSON output')
    .action((options, command: Command) => run('claims strip', command, cwd => stripClaims(cwd, options.channel)));
  program.command('pick').description('Choose variant 1 or 2 for the title or first post')
    .requiredOption('--channel <channel>', 'Channel').requiredOption('--variant <n>', 'Variant 1 or 2').option('--json', 'JSON output')
    .action((options, command: Command) => run('pick', command, cwd => pickVariant(cwd, options.channel, Number(options.variant))));
  const blind = program.command('blind-test').description('Blind test Liftoff posts against plain Claude with real developers');
  blind.command('prepare').option('--testers <n>', 'Number of testers (3-5)', '5').option('--force', 'Start over').option('--json', 'JSON output')
    .action((options, command: Command) => run('blind-test prepare', command, cwd => prepareBlindTest(cwd, Number(options.testers), !!options.force)));
  blind.command('record').requiredOption('--tester <id>', 'Tester id, e.g. tester-1').requiredOption('--channel <channel>', 'show-hn or x')
    .requiredOption('--click <side>', 'Which would you click? A or B').requiredOption('--trust <side>', 'Which do you trust more? A or B')
    .option('--missing-a <text>', "What's missing from A", '').option('--missing-b <text>', "What's missing from B", '').option('--json', 'JSON output')
    .action((options, command: Command) => run('blind-test record', command, cwd => recordBlindTest(cwd, { tester: options.tester, channel: options.channel,
      click: options.click, trust: options.trust, missingA: options.missingA, missingB: options.missingB })));
  blind.command('tally').option('--json', 'JSON output')
    .action((_options, command: Command) => run('blind-test tally', command, cwd => tallyBlindTest(cwd), data => !(data as { passed: boolean }).passed));
}
