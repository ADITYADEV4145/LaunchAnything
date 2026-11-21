import { join } from 'node:path';
import { readOptional } from './posts.js';

export const fixListPath = '.launch/posts/fix-list.md';

interface CopyIssue { rule: string; message: string }
export interface CopyVerdict { channel: string; sourceHash: string | null; issues: CopyIssue[] }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function isVerdict(value: unknown): value is CopyVerdict {
  return isRecord(value) && typeof value.channel === 'string' &&
    (value.sourceHash === null || (typeof value.sourceHash === 'string' && /^[a-f0-9]{64}$/.test(value.sourceHash))) &&
    Array.isArray(value.issues) &&
    value.issues.every(issue => isRecord(issue) && typeof issue.rule === 'string' && typeof issue.message === 'string');
}

export async function readCopyVerdicts(postsDir: string): Promise<CopyVerdict[]> {
  const source = await readOptional(join(postsDir, 'check-results.json'));
  if (source === undefined) return [];
  const report: unknown = JSON.parse(source);
  if (!isRecord(report) || !Array.isArray(report.posts) || !report.posts.every(isVerdict))
    throw new Error('Invalid .launch/posts/check-results.json');
  return report.posts;
}
