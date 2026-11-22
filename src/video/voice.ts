import { access, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';
import { loadScript } from './script.js';
import { piperConfig, synthesizePiper } from './piper.js';

export async function narrationFiles(cwd: string, scenes: { voiceover?: string }[], extensions = ['mp3','wav'], requireScript = true): Promise<(string | undefined)[]> {
  return Promise.all(scenes.map(async (scene, index) => {
    if (requireScript && !scene.voiceover?.trim()) return undefined;
    for (const extension of extensions) {
      const file = join(launchDir(cwd).video, 'vo', `${index}.${extension}`);
      try { await access(file); return file; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return undefined;
  }));
}

export async function voice(cwd: string, options: { dryRun?: boolean; formats?: readonly string[] } = {}) {
  const script = await loadScript(cwd,options.formats);
  const id = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}`;
  const requests = script.scenes.flatMap((scene, index) => scene.voiceover?.trim() ? [{ index, url, method: 'POST', body: { text: scene.voiceover, model_id: 'eleven_multilingual_v2' } }] : []);
  const dir = join(launchDir(cwd).video, 'vo');
  const key = process.env.ELEVENLABS_API_KEY;
  const piper = !key ? await piperConfig(cwd) : undefined;
  if (piper) {
    const localRequests = script.scenes.flatMap((scene,index)=>scene.voiceover?.trim() ? [{index,text:scene.voiceover}] : []);
    const receipt = { engine:'piper', model:basename(piper.model) };
    if (options.dryRun) return {mode:'dry-run',...receipt,requests:localRequests,files:[] as string[]};
    await mkdir(dir,{recursive:true});
    const files: string[] = [];
    for (const request of localRequests) {
      const path = join(dir,`${request.index}.wav`);
      const pending = join(dir,`${request.index}.pending.wav`);
      try {
        await synthesizePiper(piper.binary,piper.model,request.text,pending);
        await rename(pending,path);
        await rm(join(dir,`${request.index}.mp3`),{force:true});
        files.push(path);
      } finally { await rm(pending,{force:true}); }
    }
    const active = new Set(localRequests.map(request=>`${request.index}.wav`));
    for (const file of await readdir(dir)) if (/^\d+\.(mp3|wav)$/i.test(file) && !active.has(file)) await rm(join(dir,file));
    const result = {mode:'voiceover',...receipt,requests:localRequests,files};
    await writeFile(join(dir,'receipt.json'),JSON.stringify(result,null,2));
    return result;
  }
  if (!options.dryRun) {
    const active = new Set(requests.map(request => request.index));
    const existing = await readdir(dir).catch(error => { if (error.code === 'ENOENT') return [] as string[]; throw error; });
    await Promise.all(existing.filter(file => /^\d+\.(?:mp3|wav)$/i.test(file) && !active.has(Number(file.split('.')[0]))).map(file => rm(join(dir, file), { force: true })));
  }
  if (options.dryRun || !key) return { mode: options.dryRun ? 'dry-run' : 'captions-only', requests, files: [] as string[] };
  const files: string[] = [];
  for (const request of requests) {
    const response = await fetch(request.url, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) });
    if (!response.ok) throw new Error(`ElevenLabs request failed (${response.status}) for scene ${request.index}`);
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw new Error(`ElevenLabs returned empty audio for scene ${request.index}`);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${request.index}.mp3`); await writeFile(path, audio); files.push(path);
  }
  return { mode: 'voiceover', requests, files };
}
