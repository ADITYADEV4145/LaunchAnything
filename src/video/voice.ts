import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { loadScript } from './script.js';

export async function narrationFiles(cwd: string, scenes: { voiceover?: string }[], extensions = ['mp3','wav']): Promise<(string | undefined)[]> {
  return Promise.all(scenes.map(async (scene, index) => {
    if (!scene.voiceover?.trim()) return undefined;
    for (const extension of extensions) {
      const file = join(launchDir(cwd).video, 'vo', `${index}.${extension}`);
      try { await access(file); return file; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return undefined;
  }));
}

export async function voice(cwd: string, options: { dryRun?: boolean } = {}) {
  const script = await loadScript(cwd);
  const id = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}`;
  const requests = script.scenes.flatMap((scene, index) => scene.voiceover ? [{ index, url, method: 'POST', body: { text: scene.voiceover, model_id: 'eleven_multilingual_v2' } }] : []);
  const key = process.env.ELEVENLABS_API_KEY;
  if (options.dryRun || !key) return { mode: options.dryRun ? 'dry-run' : 'captions-only', requests, files: [] as string[] };
  const files: string[] = [];
  for (const request of requests) {
    const response = await fetch(request.url, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) });
    if (!response.ok) throw new Error(`ElevenLabs request failed (${response.status}) for scene ${request.index}`);
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw new Error(`ElevenLabs returned empty audio for scene ${request.index}`);
    const dir = join(launchDir(cwd).video, 'vo'); await mkdir(dir, { recursive: true });
    const path = join(dir, `${request.index}.mp3`); await writeFile(path, audio); files.push(path);
  }
  return { mode: 'voiceover', requests, files };
}
