import { readdir, readFile, stat } from 'node:fs/promises';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { maskSecrets } from '../visuals/privacy.js';

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
  const probes: [string, string[], boolean, string, string][] = [
    ['git', ['--version'], true, 'repository history', 'Install git (apt install git / brew install git)'],
    ['ffmpeg', ['-version'], true, 'animated capture, video rendering and judge frame sampling', 'Install FFmpeg (apt install ffmpeg / brew install ffmpeg)'],
    ['playwright', ['--version'], false, 'CLI only; the bundled Playwright library renders media', 'Optional CLI: npm install -g playwright'],
    ['remotion', ['versions'], false, 'optional renderer; ffmpeg is the fallback', 'Optional: install templates/video/remotion dependencies'],
    ['tesseract', ['--version'], true, 'storyboard capture, polish, images and judge; legacy OCR remains optional', 'Install tesseract (apt install tesseract-ocr / brew install tesseract)'],
    ['vhs', ['--version'], false, 'CLI recording; when absent the HTML terminal and ffmpeg are used', 'Optional: install VHS from https://github.com/charmbracelet/vhs and install ttyd'],
    ['ttyd', ['--version'], false, 'required when VHS is installed; not needed for HTML capture', 'Install ttyd >=1.7.2 from https://github.com/tsl0922/ttyd/releases or brew install ttyd'],
    ['ffprobe', ['-version'], true, 'HTML capture and video validation', 'Install FFmpeg including ffprobe (apt install ffmpeg / brew install ffmpeg)'],
  ];
  const probeDir = mkdtempSync(join(tmpdir(), 'liftoff-probes-'));
  try {
    chmodSync(probeDir, 0o700);
    const tools = Object.fromEntries(probes.map(([name, args, required, requiredFor, installHint]) => {
      const result = spawnSync(name, args, { cwd: probeDir, encoding: 'utf8', timeout: 5000 });
      const available = !result.error && result.status === 0;
      return [name, { available, version: available ? maskSecrets(String(result.stdout || result.stderr || '').split(/\r?\n/)[0]) || null : null,
        required, requiredFor, installHint }];
    }));
    tools.ttyd.required = tools.vhs.available;
    const candidates = [...new Set([chromium.executablePath(), 'google-chrome', process.env.LIFTOFF_CHROME,
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, join(home,'.local/bin/google-chrome'), 'chromium', 'chromium-browser'].filter((value):value is string=>Boolean(value)))];
    let version: string | null = null;
    for (const executable of candidates) {
      const result = spawnSync(executable,['--version'],{cwd:probeDir,encoding:'utf8',timeout:5000});
      if (!result.error && result.status===0) { version=maskSecrets(String(result.stdout || result.stderr || '').split(/\r?\n/)[0]) || 'version unavailable';break; }
    }
    tools.chrome = { available: version!==null, version, required:true, requiredFor:'web capture, HTML fallback, polish, images, video layouts and contact sheets',
      installHint:'Run npx playwright install --with-deps chromium or set LIFTOFF_CHROME / PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH' };
    return { skills, mcpServers, tools, warnings };
  } finally { rmSync(probeDir, { recursive: true, force: true }); }
}
