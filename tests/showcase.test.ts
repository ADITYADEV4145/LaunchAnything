import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { packageRoot } from '../src/core/package-root.js';

const root = join(packageRoot(), 'showcase');
async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }))).flat();
}

describe('public showcase', () => {
  it('has an honest Results section and complete core artifacts for every kit', async () => {
    const kits = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory());
    expect(kits.map(entry => entry.name)).toEqual(expect.arrayContaining(['groundwork', 'agentlinux']));
    for (const kit of kits) {
      const directory = join(root, kit.name);
      const readme = await readFile(join(directory, 'README.md'), 'utf8');
      expect(readme, kit.name).toMatch(/^## Results\s*$/m);
      expect(readme, kit.name).toContain('not launched yet, no real results — pending');
      for (const artifact of ['product.json', 'plan.md', 'brief.md', 'review/index.html']) {
        expect((await readFile(join(directory, artifact))).length, `${kit.name}/${artifact}`).toBeGreaterThan(0);
      }
      const posts = (await readdir(join(directory, 'posts'))).filter(name => name.endsWith('.md'));
      expect(posts, kit.name).toEqual(expect.arrayContaining(['show-hn.md', 'reddit.md', 'x.md', 'devto.md']));
    }
  });

  it('contains no machine-local home or temporary paths in any file, including media', async () => {
    const paths = await files(root);
    expect(paths.length).toBeGreaterThan(0);
    await Promise.all(paths.map(async path => {
      const content = await readFile(path);
      for (const forbidden of ['/tmp/', '/home/', '/Users/']) {
        expect(content.includes(Buffer.from(forbidden)), `${path}: ${forbidden}`).toBe(false);
      }
    }));
  });
});
