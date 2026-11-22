import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assertSafePath } from '../copy/safe-path.js';
import { realpathSync, statSync, readFileSync, existsSync } from 'node:fs';
import { jsonPointer } from '../proof/pointer.js';
import type { Pains } from '../research/index.js';
import { isAbsolute, relative, resolve, sep, join } from 'node:path';
import { parse } from 'yaml';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';
import { site } from '../core/registry.js';
import { git } from './files.js';

interface Source { type: 'file' | 'commit' | 'url'; ref: string }
function repositoryFile(root: string, ref: string) {
  if (isAbsolute(ref)) throw new Error('file must exist inside the repository');
  const path = realpathSync(resolve(root, ref));
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || !statSync(path).isFile())
    throw new Error('file must exist inside the repository');
  return path;
}
export function validateProduct(cwd: string, product: unknown) {
  const result = validateFile('product', product);
  const errors = [...result.errors], warnings: string[] = [];
  if (!result.valid) return { valid: false, errors, warnings };
  const root = realpathSync(cwd);
  const groups = product as { features: { sources: Source[] }[]; claims: { id: string; sources: Source[] }[] };
  const ids = groups.claims.map(claim => claim.id);
  if (new Set(ids).size !== ids.length) errors.push('/claims ids must be unique');
  for (const [group, values] of Object.entries(groups).filter(([key]) => key === 'features' || key === 'claims')) {
    for (const [index, item] of (values as { sources: Source[] }[]).entries()) {
      for (const source of item.sources) {
        const prefix = `/${group}/${index}/sources: ${source.ref}`;
        if (source.type === 'file') {
          try {
            repositoryFile(root, source.ref);
          } catch { errors.push(`${prefix}: file must exist inside the repository`); }
        } else if (source.type === 'commit') {
          if (!/^[a-f0-9]{4,40}$/i.test(source.ref) || !git(cwd, ['rev-parse', '--verify', `${source.ref}^{commit}`]))
            warnings.push(`${prefix}: commit could not be resolved locally (fetch history or correct the source)`);
        } else {
          try { if (!['https:', 'http:'].includes(new URL(source.ref).protocol)) throw new Error('protocol'); }
          catch { errors.push(`${prefix}: expected an HTTP(S) URL`); }
        }
      }
    }
  }
  const data = product as {
    proof: { source_file: string; source_pointer: string; value: number | string }[];
    problem: { pains?: { name: string; pain_index: number; quotes: { text: string; url: string }[] }[] };
    audience: { where?: string[] };
    competitors?: { name: string; dislikes: string[] }[];
  };
  for (const [index, proof] of data.proof.entries()) {
    const prefix = '/proof/' + index;
    try {
      const provenanceError = 'proof must come from liftoff proof run output';
      if (!/^\.launch\/proof\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(proof.source_file))
        throw new Error(provenanceError);
      let source: { results_file: string; sha256: string; results: unknown };
      try {
        assertSafePath(root, resolve(root, proof.source_file));
        const path = repositoryFile(root, proof.source_file);
        source = JSON.parse(readFileSync(path, 'utf8'));
        const checked = validateFile('proof', source);
        if (!checked.valid) throw new Error(checked.errors.join('; '));
      } catch (error) { throw new Error(provenanceError + ': ' + String(error)); }
      if (proof.source_pointer !== '/results' && !proof.source_pointer.startsWith('/results/'))
        throw new Error('source_pointer must resolve inside proof run results (/results/...)');
      if (isAbsolute(source.results_file)) throw new Error('benchmark results_file must be inside the repository');
      const resultsPath = resolve(root, source.results_file);
      assertSafePath(root, resultsPath);
      if (existsSync(resultsPath)) {
        const hash = createHash('sha256').update(readFileSync(repositoryFile(root, source.results_file))).digest('hex');
        if (hash !== source.sha256) throw new Error('benchmark results changed since proof run; rerun liftoff proof run');
      }
      const value = jsonPointer(source, proof.source_pointer);
      if (value !== proof.value) errors.push(prefix + ': resolved source value does not match proof.value');
    } catch (error) { errors.push(prefix + ': ' + String(error)); }
  }
  if (!data.problem.pains?.length) warnings.push('/problem/pains is empty; run liftoff research');
  const painsPath = join(root, '.launch/research/pains.json');
  if (existsSync(painsPath)) {
    try {
      const research = JSON.parse(readFileSync(painsPath, 'utf8')) as Pains;
      for (const pain of data.problem.pains ?? []) {
        const source = research.pains[pain.pain_index];
        if (!source || source.name !== pain.name) errors.push('/problem/pains: pain_index and name must match pains.json');
        for (const quote of pain.quotes) if (!source?.quotes.some(q => q.text === quote.text && q.url === quote.url))
          errors.push('/problem/pains: quote text and url must match pains.json');
      }
      for (const competitor of data.competitors ?? []) {
        const source = research.competitors.find(c => c.name === competitor.name);
        if (!source) errors.push('/competitors: name must appear in pains.json: ' + competitor.name);
        else for (const dislike of competitor.dislikes) if (!source.complaints.includes(dislike))
          warnings.push('/competitors: dislike is not a recorded complaint: ' + dislike);
      }
    } catch (error) { errors.push('Cannot read pains.json: ' + String(error)); }
  }
  const communitiesPath = join(root, '.launch/communities.md');
  if (data.audience.where?.length) {
    if (!existsSync(communitiesPath)) warnings.push('/audience/where: communities.md is missing');
    else {
      const communities = readFileSync(communitiesPath, 'utf8');
      for (const entry of data.audience.where) if (!communities.includes(entry))
        errors.push('/audience/where: community must appear in communities.md: ' + entry);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}
export async function validate(cwd: string, kind: string, file?: string) {
  if (!/^[a-z][a-z0-9-]*$/.test(kind)) throw new Error('Invalid schema kind');
  const paths = launchDir(cwd);
  const defaults: Record<string, string> = { config: paths.config, scan: paths.scan, product: paths.product,
    shots: paths.shots, 'video-script': join(paths.video, 'script.json'), approvals: paths.approvals,
    published: paths.published, results: paths.results };
  const path = file ? resolve(cwd, file) : defaults[kind];
  if (!path) throw new Error(`Specify --file for schema kind: ${kind}`);
  const text = await readFile(path, 'utf8');
  const data: unknown = /\.ya?ml$/i.test(path) ? parse(text) : JSON.parse(text);
  const result = kind === 'product' ? await validateProduct(cwd, data) :
    { ...validateFile(kind, data), warnings: [] as string[] };
  if (kind === 'config' && result.valid) {
    for (const id of (data as { channels: string[] }).channels) {
      try { site(id, cwd); }
      catch (error) { result.errors.push((error as Error).message); }
    }
    result.valid = result.errors.length === 0;
  }
  return { kind, path, ...result };
}
