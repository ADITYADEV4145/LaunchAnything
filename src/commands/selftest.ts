import type { Command } from 'commander';
import { selftest } from '../selftest/index.js';
import { commandOptions, output } from '../core/output.js';
export function register(program: Command) {
  program.command('selftest').description('Run phase checks against isolated fixture repositories')
    .option('--through <phase>', 'Last phase to run (1-6)', '1')
    .action(async (options: { through: string }) => {
      const report = await selftest(Number(options.through));
      const failed = report.results.some(r => !r.ok);
      const json = commandOptions(program).json;
      if (json) {
        // Failure reports remain structured data so every individual check is inspectable.
        console.log(JSON.stringify({ ok: !failed, command: 'selftest', data: report }));
      } else {
        output('selftest', report.results.map(r =>
          `Phase ${r.phase} / ${r.fixture} / ${r.check}: ${r.ok ? 'PASS' : 'FAIL: ' + r.error}`).join('\n'));
      }
      if (failed) process.exitCode = 1;
    });
}
