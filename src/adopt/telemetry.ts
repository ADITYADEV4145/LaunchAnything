import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { packageRoot } from '../core/package-root.js';

const home = () => process.env.LIFTOFF_HOME ?? join(homedir(), '.liftoff');
const disabled = () => process.env.DO_NOT_TRACK === '1' || process.env.LIFTOFF_TELEMETRY === '0';
const stages = ['init', 'scan', 'product', 'validate', 'plan', 'brief', 'write', 'check', 'shots', 'images', 'video', 'review'];
export function sanitizeEvent(input: Record<string, unknown>) {
  if (!stages.includes(String(input.stage)) || typeof input.completed !== 'boolean' || typeof input.durationMs !== 'number' || !Number.isFinite(input.durationMs) || input.durationMs < 0) throw new Error('Invalid telemetry event');
  return { stage: String(input.stage), completed: input.completed, durationMs: Math.round(input.durationMs / 1000) * 1000,
    cliVersion: String(JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8')).version) };
}
export async function telemetry(action = 'status') {
  if (!['on', 'off', 'status'].includes(action)) throw new Error('Choose on, off or status');
  const path = join(home(), 'telemetry.json');
  if (action !== 'status') {
    await mkdir(home(), { recursive: true, mode: 0o700 });
    await writeFile(path, JSON.stringify({ enabled: action === 'on' }) + '\n', { mode: 0o600 });
  }
  let enabled = false;
  try { enabled = JSON.parse(await readFile(path, 'utf8')).enabled === true; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  return { enabled: enabled && !disabled(), localOnly: true, uploaded: false };
}
export async function recordEvent(input: Record<string, unknown>) {
  if (!(await telemetry()).enabled) return;
  await appendFile(join(home(), 'telemetry-events.jsonl'), JSON.stringify(sanitizeEvent(input)) + '\n', { mode: 0o600 });
}
