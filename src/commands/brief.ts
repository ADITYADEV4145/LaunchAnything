import type { Command } from 'commander';
import { brief } from '../brief/index.js';
import { commandOptions, output } from '../core/output.js';
export function register(program: Command) {
  program.command('brief').description('Scaffold or render the offline Launch Brief')
    .option('--force', 'Regenerate scaffold, replacing agent edits after input review')
    .action((options: { force?: boolean }) => {
      const globals = commandOptions(program);
      output('brief', brief(globals.cwd ?? process.cwd(), options.force), globals.json);
    });
}
