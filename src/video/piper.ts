import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export async function piperConfig(cwd: string) {
  const model = process.env.LIFTOFF_PIPER_MODEL;
  if (!model) return;
  const path = resolve(cwd, model);
  if (!path.endsWith('.onnx') || !(await stat(path)).isFile()) throw new Error('LIFTOFF_PIPER_MODEL must point to an existing .onnx model');
  await access(`${path}.json`, constants.R_OK);
  const binary = process.env.LIFTOFF_PIPER_BIN ?? 'piper';
  const candidates = binary.includes('/') ? [resolve(cwd,binary)] : (process.env.PATH ?? '').split(delimiter).map(dir=>resolve(dir,binary));
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); }
    catch { continue; }
    return { binary: candidate, model: path };
  }
  throw new Error('Piper model is configured but the binary is unavailable; install piper-tts or set LIFTOFF_PIPER_BIN');
}

export function piperAvailable(cwd: string) {
  const result = spawnSync(process.env.LIFTOFF_PIPER_BIN ?? 'piper', ['--help'], { cwd, encoding:'utf8', timeout:5000 });
  return !result.error && result.status === 0;
}

export async function synthesizePiper(binary: string, model: string, text: string, output: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, ['--model', model, '--output_file', output], { stdio:['pipe','ignore','pipe'] });
    let error = '';
    child.stderr.on('data', chunk => { error = (error + chunk.toString()).slice(-2000); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Piper synthesis timed out')); }, 120000);
    child.on('error', failure => { clearTimeout(timer); reject(failure); });
    child.on('close', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`Piper synthesis failed (${code}): ${error}`)); });
    child.stdin.on('error', () => {});
    child.stdin.end(text + '\n');
  });
  if (!(await stat(output)).size) throw new Error('Piper returned empty audio');
}
