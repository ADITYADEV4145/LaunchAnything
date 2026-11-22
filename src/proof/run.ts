import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';
import { assertSafePath, atomicWrite } from '../copy/safe-path.js';
import { jsonPointer } from './pointer.js';

interface Benchmark {
  name: string; command?: string; repos?: string[]; results: string;
  metrics: { metric: string; pointer: string; unit: string; context: string }[];
}
export interface ProofConfig { benchmarks: Benchmark[] }

function runCommand(command: string, cwd: string, timeout: number): Promise<void> {
  return new Promise((accept, reject) => {
    const child = spawn(command, { cwd, shell: true, detached: true, stdio: 'ignore' });
    const timer = setTimeout(() => {
      if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } }
      reject(new Error('Benchmark timed out after ' + timeout + ' seconds'));
    }, timeout * 1000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) accept();
      else reject(new Error(`Benchmark command failed: exit ${code}, signal ${signal ?? 'none'}`));
    });
  });
}

export async function runProof(cwd: string, options: { skipRun?: boolean; timeout?: number } = {}) {
  cwd = resolve(cwd);
  const timeout = options.timeout ?? 1800;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2147483) throw new Error('--timeout must be a positive number of seconds (maximum 2147483)');
  const paths = launchDir(cwd);
  const config = JSON.parse(readFileSync(paths.config, 'utf8')) as { profile?: string; proof?: ProofConfig };
  const checked = validateFile('config', config);
  if (!checked.valid) throw new Error(checked.errors.join('; '));
  const directory = join(paths.root, 'proof');
  assertSafePath(cwd, directory);
  mkdirSync(directory, { recursive: true });
  if (!config.proof?.benchmarks.length) {
    const product = existsSync(paths.product) ? JSON.parse(readFileSync(paths.product, 'utf8')) as { features?: { name: string; description: string }[] } : {};
    const plan = join(directory, 'plan.md');
    atomicWrite(cwd, plan, [
      '# Benchmark plan', '',
      'Profile: ' + (config.profile ?? 'not selected'),
      'Measure the current product, not a prediction. Have the founder choose 1–3 representative sample repos and save their revisions.',
      'Features to test:', ...(product.features ?? []).map(f => '- ' + f.name + ': ' + f.description),
      '', '## Arms and metrics',
      'Run the same task on each sample repo in two arms: baseline without the product, and with-product. Keep inputs, machine, revisions and task identical.',
      'For a devtool, consider duplicates caught, invented calls flagged, tokens saved and time saved. For other profiles, measure the feature’s completed task, errors and time saved. Pick metrics appropriate to the listed features; do not invent values.',
      'Record raw counts and elapsed seconds for both arms; compute saved values from those observations. Document limitations and repeated-run variance.',
      '', '## Required result-file shape',
      'Have the benchmark write JSON, for example {"baseline":{"seconds":12},"with_product":{"seconds":8},"time_saved":4}. These numbers are illustrative only; replace them by running measurements.',
      'Choose a JSON pointer to each numeric or string measurement. Never hand-type a proof value into product.json.',
      '', '## Config snippet to add',
      '```json', JSON.stringify({ proof: { benchmarks: [{ name: 'task-time', command: 'node scripts/benchmark.mjs {repo}', repos: ['sample-one', 'sample-two'], results: 'benchmarks/{repo}.json', metrics: [{ metric: 'Time saved', pointer: '/time_saved', unit: 'seconds', context: 'Same task, baseline vs with-product' }] }] } }, null, 2), '```',
      'Replace the command and paths with your real benchmark. Run liftoff proof run, then paste its metrics into product.json proof.', '',
    ].join('\n'));
    throw new Error('No benchmark is configured; benchmark plan written to .launch/proof/plan.md');
  }
  const jobs = config.proof.benchmarks.flatMap(benchmark => (benchmark.repos ?? [null]).map((repo, index) => ({
    benchmark, repo, name: benchmark.name + (repo === null ? '' : '-' + (index + 1)),
  })));
  if (new Set(jobs.map(job => job.name)).size !== jobs.length) throw new Error('Benchmark output names collide; choose distinct benchmark names');
  const records = [];
  for (const { benchmark, repo, name } of jobs) {
    const substitute = (value: string) => value.replaceAll('{repo}', repo ?? '');
    const command = benchmark.command ? substitute(benchmark.command) : null;
    const resultsFile = substitute(benchmark.results);
    if (isAbsolute(resultsFile)) throw new Error('Benchmark results must be relative to the repository');
    const resultPath = resolve(cwd, resultsFile);
    assertSafePath(cwd, resultPath);
    const mode = command && !options.skipRun ? 'ran' : 'recorded';
    if (mode === 'ran') await runCommand(command!, cwd, timeout);
    assertSafePath(cwd, resultPath);
    let raw: Buffer, results: unknown;
    try { raw = readFileSync(resultPath); results = JSON.parse(raw.toString('utf8')); }
    catch (error) { throw new Error(`Benchmark ${name}: missing or invalid JSON results file ${resultsFile}: ${String(error)}`); }
    const source_file = '.launch/proof/' + name + '.json';
    const metrics = benchmark.metrics.map(({ metric, pointer, unit, context }) => {
      const value = jsonPointer(results, pointer);
      if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`${name}: metric ${metric} must resolve to a number or string`);
      return { metric, value, unit, context, source_file, source_pointer: '/results' + pointer };
    });
    const record = { benchmark: benchmark.name, mode, command, repo, ranAt: new Date().toISOString(), exitCode: 0,
      results_file: resultsFile, sha256: createHash('sha256').update(raw).digest('hex'), results, metrics };
    const validation = validateFile('proof', record);
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    atomicWrite(cwd, resolve(cwd, source_file), JSON.stringify(record, null, 2) + '\n');
    records.push(record);
  }
  return { records, lines: records.flatMap(record => record.metrics.map(m => `${m.metric}: ${m.value} ${m.unit} — ${m.context}`)) };
}
