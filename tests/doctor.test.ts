import { afterEach, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
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

it('never uses the inspected repository as the tool execution directory', async () => {
  vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);
  await doctor(process.cwd(), tmpdir());
  for (const call of vi.mocked(spawnSync).mock.calls) {
    expect(call[2]?.cwd).toBe(tmpdir());
    expect(call[2]?.cwd).not.toBe(process.cwd());
  }
});
