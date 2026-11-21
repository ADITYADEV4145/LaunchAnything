import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

export async function doctor(cwd: string, home = homedir()) {
  if (!(await stat(cwd)).isDirectory()) throw new Error(`Not a directory: ${cwd}`);
  const warnings: string[] = [];
  const skillPaths = [...new Set([join(cwd, '.claude/skills'), join(home, '.claude/skills'),
    join(cwd, '.agents/skills'), join(home, '.agents/skills')])];
  const skills = await Promise.all(skillPaths.map(async path => {
    try { return { path, names: (await readdir(path, { withFileTypes: true })).filter(e => e.isDirectory() || e.isSymbolicLink()).map(e => e.name).sort() }; }
    catch { return { path, names: [] as string[] }; }
  }));
  const mcpServers: { path: string; names: string[] }[] = [];
  for (const path of [join(cwd, '.mcp.json'), join(home, '.claude.json')]) {
    try {
      const config = JSON.parse(await readFile(path, 'utf8'));
      const names = new Set(Object.keys(config.mcpServers ?? {}));
      for (const project of Object.values(config.projects ?? {}) as { mcpServers?: object }[]) {
        for (const name of Object.keys(project.mcpServers ?? {})) names.add(name);
      }
      mcpServers.push({ path, names: [...names].sort() });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warnings.push(`Cannot read MCP config: ${path}`);
    }
  }
  const probes: [string, string[]][] = [
    ['git', ['--version']], ['ffmpeg', ['-version']],
    ['playwright', ['--version']], ['remotion', ['versions']],
  ];
  const tools = Object.fromEntries(probes.map(([name, args]) => {
    const result = spawnSync(name, args, { cwd: tmpdir(), encoding: 'utf8', timeout: 5000, stdio: 'ignore' });
    return [name, { available: !result.error && result.status === 0 }];
  }));
  return { skills, mcpServers, tools, warnings };
}
