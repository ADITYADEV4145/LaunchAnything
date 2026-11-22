import type { Command } from 'commander';
import { resolve } from 'node:path';
import { registry } from '../core/registry.js';
import { adapterSelection } from '../adapters/index.js';
import { commandOptions, output } from '../core/output.js';

export function register(program: Command) {
  program.command('adapters').description('List discovered sites and offline staging adapters')
    .action(async () => {
      const options = commandOptions(program);
      const cwd = resolve(options.cwd ?? process.cwd());
      const sites = await Promise.all([...registry(cwd).values()].map(async site => {
        const selected = await adapterSelection(site.id, cwd);
        return { id: site.id, name: site.name, source: site.source, path: site.path,
          route: site.route, submitUrl: site.submitUrl ?? null,
          adapter: selected.adapter.name, reason: selected.reason };
      }));
      output('adapters', sites, options.json);
    });
}
