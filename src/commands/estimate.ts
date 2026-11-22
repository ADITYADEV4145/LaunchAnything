import type { Command } from 'commander';
import { commandOptions, output } from '../core/output.js';
import { estimate } from '../adopt/estimate.js';
export function register(program: Command) {
  program.command('estimate').description('Estimate agent tokens, X API costs and render time; no calls').option('--stage <stage>', 'all, write, video, publish or demo', 'all')
    .action((options, command: Command) => { const globals = commandOptions(command); output('estimate', estimate(globals.cwd ?? process.cwd(), options.stage), globals.json); });
}
