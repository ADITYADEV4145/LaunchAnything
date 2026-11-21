import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function assertSafePath(cwd: string, target: string) {
  const root = resolve(cwd);
  const inside = (base: string, path: string) => {
    const part = relative(base, path);
    return part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
  };
  if (!inside(root, resolve(target))) throw new Error('Unsafe output path outside repository: ' + target);
  const canonicalRoot = realpathSync(root);
  let current = root;
  for (const part of relative(root, resolve(target)).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    let entry;
    try { entry = lstatSync(current); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (entry.isSymbolicLink() || !inside(canonicalRoot, realpathSync(current)))
      throw new Error('Unsafe symlink or escaped output path: ' + current);
  }
}
