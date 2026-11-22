import type { Command } from 'commander';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { commandOptions, output } from '../core/output.js';
import { demo } from '../adopt/demo.js';
import { printEstimate } from '../adopt/estimate.js';
export function register(program: Command) {
  program.command('demo').description('Build an offline sample kit in a fresh directory').option('--dir <path>', 'New directory').option('--open', 'Open review page')
    .action(async (options, command: Command) => {
      const globals = commandOptions(command);
      printEstimate(globals.cwd ?? process.cwd(), 'demo', globals.json);
      const result = await demo({ dir: options.dir, onStage: globals.json ? undefined : (stage, status) => console.log(`${stage}: ${status}`) });
      output('demo', result, globals.json);
      if (options.open) { const child = spawn(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open', [pathToFileURL(result.reviewPath).href], { stdio: 'ignore', detached: true }); child.on('error', () => {}); child.unref(); }
    });
}
