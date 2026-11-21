import { join } from 'node:path';
import { readOptional, validate } from './posts.js';
import type { Approver, ReviewPost } from './posts.js';

export interface Approval extends Approver {
  channel: string;
  hash: string;
  time: string;
}
type Skips = Record<string, string>;

export async function decisions(paths: { approvals: string; review: string }) {
  const approvals = validate<{ approvals: Approval[] }>('approvals',
    JSON.parse(await readOptional(paths.approvals) ?? '{"approvals":[]}')).approvals;
  const skips: unknown = JSON.parse(await readOptional(join(paths.review, 'skipped.json')) ?? '{}');
  if (!skips || typeof skips !== 'object' || Array.isArray(skips) ||
    Object.values(skips).some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)))
    throw new Error('Invalid review/skipped.json');
  return { approvals, skips: skips as Skips };
}

export function requireApproval(post: ReviewPost, approvals: Approval[], approvers: Approver[] = []) {
  const matches = approvals.filter(approval => approval.channel === post.channel && approval.hash === post.hash);
  if (!matches.some(approval => approval.name.trim()))
    throw new Error(`${post.channel}: exact post and media hash not approved (new or edited post)`);
  for (const { name, role } of approvers) {
    if (!matches.some(approval => approval.name === name && approval.role === role))
      throw new Error(`${post.channel}: missing approval from ${name}${role ? ' (' + role + ')' : ''}`);
  }
}
