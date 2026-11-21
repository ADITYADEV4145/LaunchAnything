import type { Command } from 'commander';
import { commandOptions, output } from './output.js';

export function registerStub(program: Command, name: string, phase: number) {
  program.command(name).description(`Not implemented yet (phase ${phase})`)
    .argument('[args...]').allowUnknownOption()
    .action(() => { output(name, undefined, commandOptions(program).json,
      `not implemented yet (phase ${phase})`, 2); });
}
