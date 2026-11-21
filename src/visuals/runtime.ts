import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
export const exec = promisify(execFile);
export async function browser() {
  const paths = [process.env.LIFTOFF_CHROME, process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, `${homedir()}/.local/bin/google-chrome`].filter((p): p is string => Boolean(p));
  for (const options of [{}, { channel: 'chrome' }, ...paths.filter(existsSync).map(executablePath => ({ executablePath }))]) {
    try { return await chromium.launch({ ...options, headless: true }); } catch { /* try next installation */ }
  }
  throw new Error('Chrome unavailable. Run npx playwright install chromium or set LIFTOFF_CHROME / PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.');
}
export function sanitizedEnv() {
  return Object.fromEntries(['PATH', 'HOME', 'LANG', 'TMPDIR', 'SystemRoot'].flatMap(k => process.env[k] ? [[k, process.env[k]!]] : []));
}
export function start(command: string, cwd: string) {
  const child = spawn(command, { cwd, shell: true, detached: process.platform !== 'win32', env: sanitizedEnv(), stdio: 'ignore' });
  child.on('error', () => {});
  return () => { if (child.pid) { try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch { /* already exited */ } } };
}
export function runTerminal(command: string, cwd: string, timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, detached: process.platform !== 'win32', env: sanitizedEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let failed = false;
    const kill = () => { if (child.pid) try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL'); } catch { /* already exited */ } };
    const timer = setTimeout(() => { failed = true; kill(); }, timeout);
    const collect = (chunk: Buffer) => { output += chunk.toString(); if (output.length > 1024 * 1024) { failed = true; kill(); } };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.on('error', () => { clearTimeout(timer); kill(); reject(new Error('Terminal command could not start')); });
    child.on('close', code => { clearTimeout(timer); kill(); if (failed || code !== 0) reject(new Error('Terminal command failed or timed out (output withheld)')); else resolve(output); });
  });
}
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
