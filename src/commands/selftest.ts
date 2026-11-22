import type { Command } from 'commander';
import { selftest } from '../selftest/index.js';
import { commandOptions, output } from '../core/output.js';
export function register(program: Command) {
  program.command('selftest').description('Run phase checks against isolated fixture repositories')
    .option('--through <phase>', 'Last phase to run (0, 0b, 1, 1b, 2, 2b, 3, 4, 5, 5b, 6, 7, I, F; phase 7 adds Part D media)', '1')
    .action(async (options: { through: string }) => {
      const report = await selftest(options.through);
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
