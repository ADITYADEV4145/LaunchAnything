import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Fetch } from '../research/adapters.js';

export interface Post { title: string; url: string; created_utc: number; score: number; num_comments: number; selftext?: string }
export interface Evidence { subreddit: string; capturedAt: string; source: 'browser' | 'reddit-api'; about: { subscribers: number; active_user_count?: number; created_utc?: number }; rules: { short_name: string; description: string }[]; rulesUrl: string; topPosts: Post[]; postRequirements?: { is_flair_required?: boolean }; searchHits?: Post[] }
export function adapter(cwd: string, options: { fetch?: Fetch; env?: NodeJS.ProcessEnv } = {}) {
  const env = options.env ?? process.env;
  const get = async (url: string, reddit = false): Promise<any> => {
    const path = join(cwd, '.launch/communities/raw', createHash('sha256').update(url).digest('hex') + '.json');
    try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    if (reddit && !env.REDDIT_ACCESS_TOKEN) throw new Error('Reddit requires your own OAuth token; use browser import');
    const response = await (options.fetch ?? fetch)(url, { headers: reddit ? { Authorization: `Bearer ${env.REDDIT_ACCESS_TOKEN}`, 'User-Agent': 'liftoff-communities/0.1' } : {} });
    if (!response.ok) throw new Error(`Communities HTTP ${response.status}: ${url}`);
    const body = await response.json();
    await mkdir(join(cwd, '.launch/communities/raw'), { recursive: true });
    await writeFile(path, JSON.stringify(body, null, 2)); return body;
  };
  const posts = (raw: any): Post[] => (raw.data?.children ?? []).map(({ data: p }: any) => ({ title: p.title, url: `https://www.reddit.com${p.permalink}`, created_utc: p.created_utc, score: p.score, num_comments: p.num_comments, selftext: p.selftext ?? '' }));
  return {
    hasReddit: Boolean(env.REDDIT_ACCESS_TOKEN),
    async hn(query: string): Promise<Post[]> { const raw = await get(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=(story,ask_hn)`); return (raw.hits ?? []).map((p: any) => ({ title: p.title ?? '', url: `https://news.ycombinator.com/item?id=${p.objectID}`, created_utc: p.created_at_i, score: p.points, num_comments: p.num_comments, selftext: p.story_text ?? '' })); },
    async search(query: string) { return posts(await get(`https://oauth.reddit.com/search?q=${encodeURIComponent(query)}&type=link&sort=relevance&t=year`, true)); },
    async founder() { const me = await get('https://oauth.reddit.com/api/v1/me', true); return { reddit: { karma: me.total_karma ?? me.link_karma + me.comment_karma, accountAgeDays: Math.floor((Date.now() / 1000 - me.created_utc) / 86400) } }; },
    async subreddit(sub: string, searchHits: Post[]): Promise<Evidence> {
      const base = `https://oauth.reddit.com/r/${sub}`;
      const about = await get(base + '/about', true); const rules = await get(base + '/about/rules', true);
      const top = await get(base + '/top?t=month&limit=100', true);
      const requirements = await get(`https://oauth.reddit.com/api/v1/${sub}/post_requirements`, true);
      return { subreddit: sub, capturedAt: new Date().toISOString(), source: 'reddit-api', about: { subscribers: about.data.subscribers, active_user_count: about.data.active_user_count, created_utc: about.data.created_utc }, rules: rules.rules.map((r: any) => ({ short_name: r.short_name, description: r.description })), rulesUrl: `https://www.reddit.com/r/${sub}/about/rules`, topPosts: posts(top), postRequirements: { is_flair_required: requirements.is_flair_required }, searchHits };
    },
  };
}
