import type { PublishReceipt } from './index.js';

export function isLiveReceiptFor(receipt: PublishReceipt, post: { channel: string; hash: string }, approvalIdentity: string, destination?: string | null) {
  if (receipt.channel !== post.channel || receipt.status !== 'published') return false;
  let url: URL;
  try { url = new URL(receipt.url ?? ''); if (url.protocol !== 'https:') return false; }
  catch { return false; }
  const host = (url: URL) => url.host === 'old.reddit.com' ? 'reddit.com' : url.host.replace(/^www\./, '');
  if (post.channel === 'reddit' && host(url) === 'redd.it') return false;
  if (receipt.id === approvalIdentity) return true;
  const contentHash = receipt.id.split(':').at(-1);
  if (contentHash !== post.hash || destination === null) return false;
  if (destination) {
    try {
      const target = new URL(destination);
      if (host(url) !== host(target)) return false;
      if (post.channel === 'reddit' && host(target) === 'reddit.com') {
        const subreddit = /^\/r\/([^/]+)\/(?:comments|s)\/[^/]+(?:\/|$)/i.exec(url.pathname)?.[1];
        const targetSubreddit = /^\/r\/([^/]+)\//i.exec(target.pathname)?.[1];
        if (!subreddit || !targetSubreddit || subreddit.toLowerCase() !== targetSubreddit.toLowerCase()) return false;
      } else {
        const prefix = target.pathname.replace(/\/$/, '').toLowerCase() + '/';
        if (!url.pathname.toLowerCase().startsWith(prefix)) return false;
      }
    } catch { return false; }
  }
  return true;
}
