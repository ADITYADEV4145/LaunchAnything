import type { PublishReceipt } from './index.js';

export function isLiveReceiptFor(receipt: PublishReceipt, post: { channel: string; hash: string }, approvalIdentity: string) {
  if (receipt.channel !== post.channel || receipt.status !== 'published') return false;
  try { if (new URL(receipt.url ?? '').protocol !== 'https:') return false; }
  catch { return false; }
  const contentHash = receipt.id.split(':').at(-1);
  return receipt.id === approvalIdentity || contentHash === post.hash;
}
