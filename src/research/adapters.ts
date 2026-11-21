export interface Item { source: string; url: string; author_handle: string; date: string; text: string; score: number; replies: number }
export type Fetch = typeof fetch;
export interface Adapter { source: string; skip?: string; run: (query: string, get: (url: string, headers?: Record<string, string>) => Promise<any>) => Promise<Item[]> }
const entities: Record<string, string> = { apos: "'", quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', bull: '•' };
const plain = (s: string = '') => s.replace(/<\/?p\b[^>]*>|<br\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, '')
  .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (!name.startsWith('#')) return entities[name.toLowerCase()] ?? entity;
    const point = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  }).replace(/\s+/gu, ' ').trim();
const date = (v: any) => typeof v === 'number' ? new Date(v * 1000).toISOString() : v || '1970-01-01T00:00:00Z';
export function normalize(source: string, raw: any): Item[] {
  const rows = source === 'play-store' ? raw.reviews : source === 'hn' ? raw.hits : source === 'reddit' ? raw.data?.children?.map((x: any) => x.data) : source === 'x' ? raw.data : source === 'app-store' ? raw.feed?.entry : source === 'product-hunt' ? raw.data?.posts?.edges?.flatMap((e: any) => e.node.comments.edges.map((c: any) => c.node)) : raw.items;
  return (rows ?? []).map((r: any): Item => {
    if (source === 'play-store') { const c = r.comments?.find((c: any) => c.userComment)?.userComment; return { source, url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(raw.packageName)}&reviewId=${encodeURIComponent(r.reviewId)}`, author_handle: r.authorName ?? '', date: date(Number(c?.lastModified?.seconds ?? 0)), text: c?.text ?? '', score: c?.starRating ?? 0, replies: r.comments?.filter((c: any) => c.developerComment).length ?? 0 }; }
    if (source === 'hn') return { source, url: `https://news.ycombinator.com/item?id=${r.objectID}`, author_handle: r.author ?? '', date: date(r.created_at), text: plain(r.comment_text ?? r.story_text ?? r.title), score: r.points ?? 0, replies: r.num_comments ?? 0 };
    if (source === 'reddit') return { source, url: `https://www.reddit.com${r.permalink}`, author_handle: r.author ?? '', date: date(r.created_utc), text: `${r.title ?? ''}\n${r.selftext ?? r.body ?? ''}`.trim(), score: r.score ?? 0, replies: r.num_comments ?? 0 };
    if (source === 'github') return { source, url: r.html_url, author_handle: r.user?.login ?? '', date: date(r.created_at), text: `${r.title ?? ''}\n${r.body ?? ''}`.trim(), score: r.reactions?.total_count ?? 0, replies: r.comments ?? 0 };
    if (source === 'stackoverflow') return { source, url: r.link, author_handle: r.owner?.display_name ?? '', date: date(r.creation_date), text: plain(`${r.title}\n${r.body ?? ''}`), score: r.score ?? 0, replies: r.answer_count ?? 0 };
    if (source === 'x') return { source, url: `https://x.com/i/status/${r.id}`, author_handle: r.author_id ?? '', date: date(r.created_at), text: r.text, score: r.public_metrics?.like_count ?? 0, replies: r.public_metrics?.reply_count ?? 0 };
    if (source === 'app-store') return { source, url: r.link?.attributes?.href ?? r.link?.[0]?.attributes?.href, author_handle: r.author?.name?.label ?? '', date: date(r.updated?.label), text: `${r.title?.label ?? ''}\n${r.content?.label ?? ''}`.trim(), score: Number(r['im:rating']?.label ?? 0), replies: 0 };
    return { source, url: r.url, author_handle: r.user?.username ?? '', date: date(r.createdAt), text: r.body ?? r.text, score: r.votesCount ?? 0, replies: 0 };
  }).filter((r: Item) => r.url && r.text);
}
export function adapters(env: NodeJS.ProcessEnv = process.env): Adapter[] {
  const simple = (source: string, url: (q: string) => string, skip?: string, headers?: Record<string, string>): Adapter => ({ source, skip, run: async (q, get) => normalize(source, await get(url(encodeURIComponent(q)), headers)) });
  return [
    simple('hn', q => `https://hn.algolia.com/api/v1/search?query=${q}&hitsPerPage=100`),
    simple('reddit', q => `https://oauth.reddit.com/search?q=${q}&limit=100`, !env.REDDIT_ACCESS_TOKEN ? 'Set REDDIT_ACCESS_TOKEN from your own Reddit OAuth app. Otherwise use the agent browser on https://www.reddit.com/search/ and record linked evidence; the CLI never scrapes Reddit.' : undefined, { Authorization: `Bearer ${env.REDDIT_ACCESS_TOKEN}`, 'User-Agent': 'liftoff-research/0.1' }),
    { source: 'github', async run(q, get) {
      const headers = env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : undefined;
      const repos = await get(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=5`, headers);
      const items: Item[] = [];
      for (const repo of (repos.items ?? []).slice(0, 5)) {
        items.push(...normalize('github', await get(`https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${repo.full_name} is:issue`)}&per_page=100`, headers)));
        if (repo.has_discussions) {
          const discussions = await get(`https://api.github.com/repos/${repo.full_name}/discussions?per_page=100`, headers);
          items.push(...normalize('github', { items: discussions }));
        }
      }
      return items;
    } },
    simple('stackoverflow', q => `https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow&q=${q}&filter=withbody&pagesize=100`),
    { source: 'product-hunt', skip: !env.PRODUCT_HUNT_TOKEN ? 'Set PRODUCT_HUNT_TOKEN to read competitor launch comments.' : undefined, async run(q, get) {
      const query = `{ posts(first: 50) { edges { node { name tagline comments(first: 50) { edges { node { body url createdAt votesCount user { username } } } } } } } }`;
      const raw = await get(`https://api.producthunt.com/v2/api/graphql?query=${encodeURIComponent(query)}`, { Authorization: `Bearer ${env.PRODUCT_HUNT_TOKEN}` });
      if (raw.errors) throw new Error('Product Hunt GraphQL request failed');
      raw.data.posts.edges = raw.data.posts.edges.filter((e: any) => `${e.node.name} ${e.node.tagline}`.toLowerCase().includes(q.toLowerCase()));
      return normalize('product-hunt', raw);
    } },
    simple('app-store', () => `https://itunes.apple.com/us/rss/customerreviews/id=${encodeURIComponent(env.APP_STORE_ID ?? '')}/sortBy=mostRecent/json`, !env.APP_STORE_ID ? 'Mobile profile: set APP_STORE_ID to fetch App Store reviews.' : undefined),
    { source: 'play-store', skip: !env.GOOGLE_PLAY_ACCESS_TOKEN || !env.GOOGLE_PLAY_PACKAGE ? 'Mobile profile: set GOOGLE_PLAY_PACKAGE and GOOGLE_PLAY_ACCESS_TOKEN for your authorized Play Console app; competitor reviews require agent browser evidence.' : undefined, async run(_q, get) {
      const raw = await get(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.GOOGLE_PLAY_PACKAGE!)}/reviews?maxResults=100`, { Authorization: `Bearer ${env.GOOGLE_PLAY_ACCESS_TOKEN}` });
      return normalize('play-store', { ...raw, packageName: env.GOOGLE_PLAY_PACKAGE });
    } },
    simple('x', q => `https://api.x.com/2/tweets/search/recent?query=${q}&tweet.fields=created_at,author_id,public_metrics&max_results=100`, !env.X_BEARER_TOKEN ? 'Set X_BEARER_TOKEN from your paid X API account.' : undefined, { Authorization: `Bearer ${env.X_BEARER_TOKEN}` }),
  ];
}
