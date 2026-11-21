import type { Command } from 'commander';

export type Result = { ok: true; command: string; data: unknown } |
  { ok: false; command: string; error: string };

export function output(command: string, data: unknown, json = false, error?: string, code = 1): Result {
  const result: Result = error ? { ok: false, command, error } : { ok: true, command, data };
  if (json) console.log(JSON.stringify(result));
  else if (error) console.error(`${command}: ${error}`);
  else console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  if (error) process.exitCode = code;
  return result;
}

export function commandOptions(command: Command): { json?: boolean; cwd?: string } {
  return command.optsWithGlobals();
}
