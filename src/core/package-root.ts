import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function packageRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(current, 'package.json'))) {
    const parent = dirname(current);
    if (parent === current) throw new Error('Cannot locate Liftoff package root');
    current = parent;
  }
  return current;
}
