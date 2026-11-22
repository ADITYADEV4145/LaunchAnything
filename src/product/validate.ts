import { realpath, stat, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, join } from 'node:path';
import { parse } from 'yaml';
import { launchDir } from '../core/launch-dir.js';
import { validateFile } from '../core/schema.js';
import { site } from '../core/registry.js';
import { git } from './files.js';

interface Source { type: 'file' | 'commit' | 'url'; ref: string }
export async function validateProduct(cwd: string, product: unknown) {
  const result = validateFile('product', product);
  const errors = [...result.errors], warnings: string[] = [];
  if (!result.valid) return { valid: false, errors, warnings };
  const root = await realpath(cwd);
  const groups = product as { features: { sources: Source[] }[]; claims: { id: string; sources: Source[] }[] };
  const ids = groups.claims.map(claim => claim.id);
  if (new Set(ids).size !== ids.length) errors.push('/claims ids must be unique');
  for (const [group, values] of Object.entries(groups).filter(([key]) => key === 'features' || key === 'claims')) {
    for (const [index, item] of (values as { sources: Source[] }[]).entries()) {
      for (const source of item.sources) {
        const prefix = `/${group}/${index}/sources: ${source.ref}`;
        if (source.type === 'file') {
          try {
            if (isAbsolute(source.ref)) throw new Error('absolute source');
            const path = await realpath(resolve(root, source.ref));
            const rel = relative(root, path);
            if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || !(await stat(path)).isFile()) throw new Error('outside repository or not a file');
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
