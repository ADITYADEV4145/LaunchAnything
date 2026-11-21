import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { initializePrelaunch, prelaunch } from '../prelaunch/kit.js';

export function register(program: Command) {
  program.command('prelaunch').description('Score launch readiness and draft offline pre-launch fixes')
    .option('--init', 'Create the readiness evidence template and enable the publish gate')
    .action((options: { init?: boolean }, command: Command) => {
      const { cwd, json } = commandOptions(command);
      if (options.init) {
        output('prelaunch', initializePrelaunch(cwd), json);
        return;
      }
      const report = prelaunch(cwd);
      if (json) console.log(JSON.stringify({ ok: report.readiness.ready, command: 'prelaunch', data: report }));
      else output('prelaunch', report);
      if (!report.readiness.ready) process.exitCode = 1;
    });
}
