import type { PublishReceipt } from './index.js';

export function isLiveReceiptFor(receipt: PublishReceipt, post: { channel: string; hash: string }, approvalIdentity: string, destination?: string | null) {
  if (receipt.channel !== post.channel || receipt.status !== 'published') return false;
  let url: URL;
  try { url = new URL(receipt.url ?? ''); if (url.protocol !== 'https:') return false; }
  catch { return false; }
  if (receipt.id === approvalIdentity) return true;
  const contentHash = receipt.id.split(':').at(-1);
  if (contentHash !== post.hash || destination === null) return false;
  if (destination) {
    try {
      const target = new URL(destination);
      const host = (url: URL) => url.host === 'old.reddit.com' ? 'reddit.com' : url.host.replace(/^www\./, '');
      const prefix = target.pathname.replace(/\/$/, '').toLowerCase() + '/';
      if (host(url) !== host(target) || !url.pathname.toLowerCase().startsWith(prefix)) return false;
    } catch { return false; }
  }
  return true;
}
