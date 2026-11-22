export interface XApiCost { create?: number | null; withUrl?: number | null }
export const xPricingSource = 'https://docs.x.com/x-api/getting-started/pricing';
// Official Post: Create rates: https://docs.x.com/x-api/getting-started/pricing
export const defaultXApiCost = { create: 0.015, withUrl: 0.20 };
export function xCost(post: { title: string; body: string; link?: string }, config: XApiCost = {}) {
  const withUrl = Boolean(post.link) || /https?:\/\/|www\.|\b[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.[a-z]{2,}(?=[/\s?#:]|$)/iu.test(post.title + '\n' + post.body);
  const key = withUrl ? 'withUrl' : 'create';
  const amount = config[key] === undefined ? defaultXApiCost[key] : config[key];
  if (amount === null) return 'cost unknown — set it in config';
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error('Invalid X API cost configuration');
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 }).format(amount) +
    ` per Post: Create request${withUrl ? ' (with URL)' : ''}. Estimate only; threads and media may add charges.`;
}
