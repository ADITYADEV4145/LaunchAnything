import { createInterface } from 'node:readline/promises';
import { doctor } from '../core/doctor.js';
import { connections, connect, routes, type Route } from '../connect/registry.js';
import { osKeychain } from '../connect/keychain.js';
import { browser } from '../visuals/runtime.js';
import { importBrand } from './brand.js';
import { learnVoice } from '../voice/learn.js';

export async function chromeAvailable() {
  try { const app = await browser(); await app.close(); return true; } catch { return false; }
}
export async function setup(cwd: string, options: { yes?: boolean; json?: boolean; site?: string; siteFile?: string; voice?: string[] } = {}) {
  const diagnostics = await doctor(cwd);
  const fixes: Record<string, string> = { git: 'Ubuntu: sudo apt-get install git; macOS: brew install git; Windows: winget install Git.Git', ffmpeg: 'Ubuntu: sudo apt-get install ffmpeg; macOS: brew install ffmpeg; Windows: winget install Gyan.FFmpeg', playwright: 'npm i -g playwright', chrome: 'npx playwright install chromium' };
  const tools = [...Object.entries(diagnostics.tools).filter(([name]) => name !== 'remotion').map(([name, value]) => ({ name, available: value.available, fix: fixes[name] })), { name: 'chrome', available: await chromeAvailable(), fix: fixes.chrome }];
  const records = await connections();
  const checklist = [
    { name: 'PH', platform: 'product-hunt', route: 'mcp' }, { name: 'X', platform: 'x', route: 'mcp' },
    { name: 'Kit', platform: 'kit', route: 'api' }, { name: 'Postiz', platform: 'x', route: 'postiz' },
    { name: 'GitHub', platform: 'github-release', route: 'api' },
  ].map(item => ({ ...item, supported: routes(item.platform).includes(item.route as Route), connected: records.some(r => r.platform === item.platform && r.route === item.route), command: `liftoff connect ${item.platform} --route ${item.route} --account YOUR_HANDLE --token-env LIFTOFF_CONNECT_TOKEN` }));
  const prompt = process.stdin.isTTY && !options.yes && !options.json ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
  try {
    if (prompt) {
      console.log(tools.map(t => `${t.name}: ${t.available ? 'available' : t.fix}`).join('\n'));
      for (const item of checklist) {
        console.log(`${item.name}: ${item.connected ? 'connected' : 'not connected'}; ${item.command}${item.supported ? '' : ' (not yet supported by connect; skip)'}`);
        if (!item.connected && item.supported && /^y/i.test(await prompt.question('Connect now? [y/N] '))) {
          const account = await prompt.question('Your account handle: ');
          const env = await prompt.question('Environment variable containing token (default LIFTOFF_CONNECT_TOKEN): ');
          await connect({ platform: item.platform, route: item.route as Route, account }, process.env[env || 'LIFTOFF_CONNECT_TOKEN'], osKeychain());
          item.connected = true;
        }
      }
    }
  } finally { prompt?.close(); }
  const brand = options.site || options.siteFile ? await importBrand(cwd, options) : undefined;
  const voice = options.voice?.length ? learnVoice(cwd, options.voice, false) : undefined;
  return { tools, checklist, brand, voice, next: 'liftoff demo (sample kit) or liftoff init (your repository)' };
}
