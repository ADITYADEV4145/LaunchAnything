import { afterEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { doctor } from '../src/core/doctor.js';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it('uses supported version commands for installed optional tools', async () => {
  vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);
  const report = await doctor(tmpdir(), tmpdir());
  expect(report.tools.ffmpeg.available).toBe(true);
  expect(report.tools.remotion.available).toBe(true);
  expect(spawnSync).toHaveBeenCalledWith('ffmpeg', ['-version'], expect.any(Object));
  expect(spawnSync).toHaveBeenCalledWith('remotion', ['versions'], expect.any(Object));
});

it('probes in a private directory and removes it afterwards', async () => {
  const directories = new Set<string>();
  vi.mocked(spawnSync).mockImplementation((_command, _args, options) => {
    const cwd = String(options?.cwd);
    directories.add(cwd);
    expect(dirname(cwd)).toBe(tmpdir());
    expect(cwd).not.toBe(process.cwd());
    expect(cwd).not.toBe(tmpdir());
    if (process.platform !== 'win32') expect(statSync(cwd).mode & 0o777).toBe(0o700);
    return { status: 0 } as ReturnType<typeof spawnSync>;
  });
  await doctor(process.cwd(), tmpdir());
  expect(directories.size).toBe(1);
  for (const dir of directories) expect(existsSync(dir)).toBe(false);
  await doctor(process.cwd(), tmpdir());
  expect(directories.size).toBe(2);
  for (const dir of directories) expect(existsSync(dir)).toBe(false);
});

it('removes the private directory even if a probe throws', async () => {
  let directory = '';
  vi.mocked(spawnSync).mockImplementation((_command, _args, options) => {
    directory = String(options?.cwd);
    throw new Error('probe failed');
  });
  await expect(doctor(process.cwd(), tmpdir())).rejects.toThrow('probe failed');
  expect(directory).not.toBe('');
  expect(existsSync(directory)).toBe(false);
});

it('reports media versions and required versus optional degradation without downloads',async()=>{
  vi.mocked(spawnSync).mockImplementation((command)=>({status:command==='vhs'?1:0,stdout:'tool 1.2.3\nmore details'} as ReturnType<typeof spawnSync>));
  const report=await doctor(tmpdir(),tmpdir());
  for(const name of ['tesseract','ffprobe','chrome']) expect(report.tools[name]).toMatchObject({available:true,required:true,version:'tool 1.2.3',installHint:expect.any(String)});
  expect(report.tools.vhs).toMatchObject({available:false,required:false,version:null});expect(report.tools.ttyd.required).toBe(false);
  vi.mocked(spawnSync).mockReturnValue({status:0,stdout:'tool 1.2.3'} as ReturnType<typeof spawnSync>);
  expect((await doctor(tmpdir(),tmpdir())).tools.ttyd.required).toBe(true);
});

it('reports missing media dependencies with install hints and no misleading versions',async()=>{
  vi.mocked(spawnSync).mockReturnValue({status:null,error:Object.assign(new Error('missing'),{code:'ENOENT'})} as ReturnType<typeof spawnSync>);
  const report=await doctor(tmpdir(),tmpdir());
  for(const name of ['tesseract','vhs','ttyd','ffprobe','chrome']) expect(report.tools[name]).toMatchObject({available:false,version:null,installHint:expect.any(String)});
});

it('reports optional Piper and honors the binary override',async()=>{
  vi.stubEnv('LIFTOFF_PIPER_BIN','/custom/piper');
  try {
    vi.mocked(spawnSync).mockReturnValue({status:0} as ReturnType<typeof spawnSync>);
    expect((await doctor(tmpdir(),tmpdir())).tools.piper).toMatchObject({available:true,required:false});
    expect(spawnSync).toHaveBeenCalledWith('/custom/piper',['--help'],expect.objectContaining({cwd:expect.any(String)}));
    vi.mocked(spawnSync).mockReturnValue({status:1} as ReturnType<typeof spawnSync>);
    expect((await doctor(tmpdir(),tmpdir())).tools.piper.available).toBe(false);
  } finally { vi.unstubAllEnvs(); }
});
