import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fetchCommunities, importEvidence, reportCommunities, checkCommunities, scoreEvidence } from '../src/communities/index.js';
import type { Evidence } from '../src/communities/adapters.js';
import { restrictions, postingSlot, postingWindow } from '../src/communities/schedule.js';
import * as schedule from '../src/communities/schedule.js';
const fixture = JSON.parse(await readFile('fixtures/cli-tool/.liftoff-fixture/communities-evidence.json', 'utf8')) as Evidence[];
const dirs: string[] = [];
async function setup() { const cwd = await mkdtemp(join(tmpdir(), 'communities-')); dirs.push(cwd); await mkdir(join(cwd, '.launch/research'), { recursive: true }); await writeFile(join(cwd, '.launch/research/pains.json'), JSON.stringify({ idea: 'Groundwork', pains: [{ name: 'pain tracking', quotes: [{ url: 'https://www.reddit.com/r/builders/comments/a/ask', text: 'pain tracking' }] }] })); return cwd; }
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
describe('communities', () => {
  it.each(['UTC', 'ET'])('accepts 24:00 as an end-of-day boundary in %s', async zone => {
    const cwd = await setup(); await writeFile(join(cwd, '.launch/config.json'), JSON.stringify({ launchDate: '2026-01-04', timezone: 'UTC' }));
    const rules = [{ short_name: 'Self-Promo Sunday', description: `Only on Sunday 18:00-24:00 ${zone}` }]; const limit = restrictions(rules, 'UTC');
    expect(limit).toMatchObject({ start: 1080, end: 1440, manualReview: undefined });
    const offset = zone === 'ET' ? 5 : 0; const lateDate = zone === 'ET' ? '2026-01-05' : '2026-01-04';
    expect(postingWindow(lateDate, zone === 'ET' ? '04:59' : '23:59', 'UTC', limit)).toEqual({ day: true, time: true });
    expect(postingWindow('2026-01-04', `${17 + offset}:59`, 'UTC', limit).time).toBe(false);
    expect(postingWindow('2026-01-05', zone === 'ET' ? '05:00' : '00:00', 'UTC', limit).day).toBe(false);
    const capture = join(cwd, 'capture.json'); await writeFile(capture, JSON.stringify({ ...fixture[0]!, rules })); await importEvidence(cwd, capture);
    const result = await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(result.valid).toBe(true); expect(report.plan[0].time).toBe(`${18 + offset}:00`); expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
  });
  it.each(['24:00-24:00 UTC', '18:00-24:01 UTC', '18:00-25:00 UTC', '18:00-24:00pm UTC'])('does not accept invalid uses of the 24:00 boundary: %s', description => {
    expect(restrictions([{ short_name: 'Promotions', description }], 'UTC').manualReview).toBeDefined();
  });
  it.each(['Please post on Sundays at 9am ET', 'Please post on Sundays at 9am', 'Post at 9am Sundays', 'at 9am ET Singapore', 'ET at 9am Sundays'])('limits place checks to attached context: %s', async description => {
    const cwd = await setup(); const rules = [{ short_name: 'Self-Promo Sunday', description }];
    expect(restrictions(rules, 'UTC').manualReview).toBeUndefined();
    const capture = join(cwd, 'capture.json'); await writeFile(capture, JSON.stringify({ ...fixture[0]!, rules })); await importEvidence(cwd, capture);
    const result = await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(result.valid).toBe(true); expect(report.plan).toHaveLength(1); expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
  });
  it.each(['9:1 ratio', '9:10 contribution ratio', 'ratio of 9:10', 'except for affiliate links', 'with a 9:1 ratio; post at 9am ET', 'except for affiliate links; post at 9am ET'])('keeps non-time promotion conditions schedulable: %s', async condition => {
    const cwd = await setup(); const rules = [{ short_name: 'Promotions', description: `Self-promotion allowed ${condition}` }];
    expect(restrictions(rules, 'UTC').manualReview).toBeUndefined();
    const capture = join(cwd, 'capture.json'); await writeFile(capture, JSON.stringify({ ...fixture[0]!, rules })); await importEvidence(cwd, capture);
    const result = await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(result.valid).toBe(true); expect(report.plan).toHaveLength(1); expect(report.recommended).toEqual(['builders']);
    expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
  });
  it.each(['at 18:30 UTC', 'at noon UTC', 'from 18 to 21 in ET', 'after 9am ET'])('still requires review for real unparsed time constraints: %s', description => {
    expect(restrictions([{ short_name: 'Promotions', description }], 'UTC').manualReview).toBeDefined();
  });
  it.each(['weekly_thread', 'megathread', 'self_promo', 'promo-thread', 'discussion'])('directs URL-only promotion restrictions to the cited %s thread', async slug => {
    const cwd = await setup(); const url = `https://reddit.com/r/builders/comments/abc/${slug}`;
    const rules = [{ short_name: 'Promotions', description: `Self-promo only in ${url}` }];
    expect(restrictions(rules, 'UTC')).toMatchObject({ megathread: true, threadUrl: url, manualReview: undefined });
    const capture = join(cwd, 'capture.json'); await writeFile(capture, JSON.stringify({ ...fixture[0]!, rules })); await importEvidence(cwd, capture);
    const result = await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(result.valid).toBe(true); expect(report.plan[0].destination).toBe(`megathread: ${url}`);
    expect(await readFile(join(cwd, '.launch/communities', report.plan[0].file), 'utf8')).toContain(`Destination: megathread: ${url}`);
    report.plan[0].destination = 'standalone post'; expect((await checkCommunities(cwd, report)).errors).toContain('builders: must post in the megathread');
  });
  it('fails closed for ambiguous or unverified URL-only thread destinations', () => {
    for (const description of ['Self-promo only in https://example.com/weekly_thread', 'Self-promo only in https://reddit.com/r/x/comments/a/weekly_thread or https://reddit.com/r/x/comments/b/megathread']) {
      const limit = restrictions([{ short_name: 'Promotions', description }], 'UTC');
      expect(limit.manualReview).toContain('Unresolved thread destination'); expect(() => postingSlot('2026-01-04', limit, 'UTC')).toThrow();
    }
  });
  it.each(['communities.md', 'communities.json', 'communities/replies', 'communities/posts'])('refuses symlink report destination %s without modifying the target', async destination => {
    const cwd = await setup(); const outside = await mkdtemp(join(tmpdir(), 'communities-outside-')); dirs.push(outside);
    const marker = join(outside, 'untouched'); await writeFile(marker, 'unchanged');
    const capture = join(cwd, 'capture.json'); await writeFile(capture, JSON.stringify(fixture[0])); await importEvidence(cwd, capture);
    await symlink(destination.endsWith('.md') || destination.endsWith('.json') ? marker : outside, join(cwd, '.launch', destination));
    await expect(reportCommunities(cwd)).rejects.toThrow('Unsafe symlink');
    expect(await readFile(marker, 'utf8')).toBe('unchanged'); expect(await readdir(outside)).toEqual(['untouched']);
  });
  it('lists only solution-seeking HN threads, groups sources, and labels empty sections', async () => {
    const cwd = await setup();
    const posts = [
      ['Ask HN: Pain tracking tools', ''],
      ['Which pain tracking tool do you recommend?', ''],
      ['My workflow', 'Looking for pain tracking recommendations'],
      ['Show HN: Pain tracking?', 'Is there a tool for pain tracking?'],
      ['Launch HN: Pain tracking', 'Looking for pain tracking feedback'],
      ['Show HN – Pain tracking', 'How do you handle pain tracking?'],
      ['Pain tracking update', 'We changed the layout.'],
      ['Ask HN: Unrelated problem', ''],
    ].map(([title, selftext], i) => ({ title, selftext, url: `https://news.ycombinator.com/item?id=${i}`, created_utc: 1760000000, score: 1, num_comments: 0 }));
    await mkdir(join(cwd, '.launch/communities'), { recursive: true });
    await writeFile(join(cwd, '.launch/communities/hn.json'), JSON.stringify([...posts, posts[0]]));
    await writeFile(join(cwd, '.launch/communities/other.json'), JSON.stringify([
      { host: 'news.ycombinator.com', kind: 'hn', url: posts[0].url },
      { host: 'news.ycombinator.com', kind: 'hn', url: posts[1].url },
      { host: 'github.com', kind: 'github', url: 'https://github.com/example/repo/issues/1' },
      { host: 'discord.gg', kind: 'other', url: 'https://discord.gg/example' },
    ]));
    const result = await reportCommunities(cwd);
    const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(report.threads.map((p: any) => p.url)).toEqual(posts.slice(0, 3).map(p => p.url));
    expect(result.markdown).not.toContain('Show HN'); expect(result.markdown).not.toContain('Launch HN');
    expect(result.markdown).toContain('[Hacker News](https://news.ycombinator.com/) — news.ycombinator.com (hn); 2 cited threads.');
    expect(result.markdown).toContain('[github.com](https://github.com/example/repo/issues/1) — github');
    expect(result.markdown).toContain('[discord.gg](https://discord.gg/example) — other');
    expect(result.markdown).not.toContain('{"url"');
    expect(result.markdown).toContain('No subreddit evidence yet: set REDDIT_ACCESS_TOKEN or capture rules in the agent browser, then `liftoff communities import`.');
    for (const section of ['Low signal', 'Do not post', 'Needs manual review', 'Cross-post plan']) expect(result.markdown).toContain(`## ${section}\nNone.`);
    const reply = await readFile(join(cwd, '.launch/communities', report.threads[0].file), 'utf8');
    expect(reply).toContain('You asked: Ask HN: Pain tracking tools'); expect(reply).toContain("I'm Aditya and I built Groundwork"); expect(reply).not.toMatch(/upvote/i);
  });
  it('ignores vote language in exact source metadata but still blocks it in founder replies', async () => {
    const cwd = await setup(); await mkdir(join(cwd, '.launch/communities'));
    const posts = ['Ask HN: pain tracking without asking for upvotes?', 'Ask HN: looking for pain tracking?'].map((title, i) => ({ title, url: `https://news.ycombinator.com/item?id=${i}&context=upvotes`, created_utc: 1760000000, score: 1, num_comments: 0 }));
    await writeFile(join(cwd, '.launch/communities/hn.json'), JSON.stringify(posts));
    expect((await reportCommunities(cwd)).valid).toBe(true);
    const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(report.threads.map((t: any) => t.url)).toEqual(posts.map(p => p.url));
    expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
    const file = join(cwd, '.launch/communities', report.threads[0].file); const original = await readFile(file, 'utf8');
    await writeFile(file, original + '\nYou asked: Please upvote my project.');
    expect((await checkCommunities(cwd)).errors).toContain(`Prohibited pattern: ${report.threads[0].file}`);
    await expect(reportCommunities(cwd)).rejects.toThrow('Prohibited pattern');
  });
  it('omits an unsafe generated reply with a manual-review note instead of aborting the report', async () => {
    const cwd = await setup(); await mkdir(join(cwd, '.launch/communities'));
    await writeFile(join(cwd, '.launch/research/pains.json'), JSON.stringify({ idea: 'Upvote helper', pains: [{ name: 'pain tracking', quotes: [] }] }));
    await writeFile(join(cwd, '.launch/communities/hn.json'), JSON.stringify([{ title: 'Ask HN: pain tracking?', url: 'https://news.ycombinator.com/item?id=1', created_utc: 1760000000, score: 1, num_comments: 0 }]));
    const result = await reportCommunities(cwd); expect(result.valid).toBe(true);
    expect(result.markdown).toContain('generated reply contains prohibited language; no draft created.');
    expect(result.markdown).toContain('## Threads asking for this\nNone.');
    expect(JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8')).threads).toEqual([]);
    await expect(readFile(join(cwd, '.launch/communities/replies/6dd66cdf745b.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('schedules allowed days/times and megathreads, separates low signal, and gates forbidden replies and duplicate URLs', async () => {
    const cwd = await setup();
    await writeFile(join(cwd, '.launch/config.json'), JSON.stringify({ launchDate: '2026-11-23', timezone: 'UTC' }));
    const sunday = { ...fixture[0]!, subreddit: 'sunday', rules: [{ short_name: 'Self-Promo Sunday', description: 'Only on Sunday between 9am and 5pm UTC in the megathread.' }] };
    const saturday = { ...fixture[3]!, rules: [{ short_name: 'Promotions', description: 'Only on Saturday in the megathread.' }] };
    const low = { ...fixture[1]!, subreddit: 'low', topPosts: [], searchHits: [] };
    const all = [sunday, saturday, low, fixture[4]!, fixture[6]!];
    for (const e of all) { const file = join(cwd, e.subreddit + '.json'); await writeFile(file, JSON.stringify(e)); await importEvidence(cwd, file); }
    await reportCommunities(cwd);
    const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    const md = await readFile(join(cwd, '.launch/communities.md'), 'utf8');
    expect(md).toContain('## Low signal\n- r/low: pain count 0'); expect(md).toContain('Flair: not required'); expect(md).toContain('no stated karma/age requirement'); expect(md).toContain('Verify your account meets it before posting'); expect(md).toContain('founder.json');
    expect(report.recommended).not.toContain('low');
    const sun = report.plan.find((p: any) => p.subreddit === 'sunday'); expect(new Date(sun.date).getUTCDay()).toBe(0); expect(sun.time).toBe('09:00'); expect(sun.destination).toBe('megathread');
    const sat = report.plan.find((p: any) => p.subreddit === 'weekly'); expect(new Date(sat.date).getUTCDay()).toBe(6); expect(sat.destination).toBe('megathread');
    expect(new Set(report.plan.map((p: any) => p.date)).size).toBe(report.plan.length);
    expect(report.threads.some((t: any) => t.url.includes('/r/banned/'))).toBe(false);
    expect(restrictions([{ short_name: 'Promo', description: 'Only on weekends' }], 'UTC').days.sort()).toEqual([0, 6]);
    const original = sun.date; sun.date = '2026-11-23'; expect((await checkCommunities(cwd, report)).errors).toContain('sunday: posting day violates cited rule'); sun.date = original;
    sun.time = '20:00'; expect((await checkCommunities(cwd, report)).errors).toContain('sunday: posting time violates cited rule'); sun.time = '09:00';
    sun.destination = 'standalone post'; expect((await checkCommunities(cwd, report)).errors).toContain('sunday: must post in the megathread'); sun.destination = 'megathread';
    report.threads.push(report.threads[0]); expect((await checkCommunities(cwd, report)).errors).toContain('Duplicate thread URL'); report.threads.pop();
    const forbidden = { ...fixture[4]!.searchHits![0]!, file: 'replies/abcdef.md' }; await writeFile(join(cwd, '.launch/communities', forbidden.file), 'Groundwork https://example.com'); report.threads.push(forbidden);
    expect((await checkCommunities(cwd, report)).errors).toContain('Forbidden community reply promotes: replies/abcdef.md');
    report.recommended.push('low'); expect((await checkCommunities(cwd, report)).valid).toBe(false);
  });
  it.each([
    ['ET', '2026-01-04', 'UTC', '14:00'], ['ET', '2026-07-05', 'UTC', '13:00'],
    ['EST', '2026-07-05', 'UTC', '14:00'], ['EDT', '2026-01-04', 'UTC', '13:00'],
    ['PT', '2026-01-04', 'UTC', '17:00'], ['PT', '2026-07-05', 'UTC', '16:00'],
    ['CT', '2026-01-04', 'UTC', '15:00'], ['CT', '2026-07-05', 'UTC', '14:00'],
    ['MT', '2026-01-04', 'UTC', '16:00'], ['MT', '2026-07-05', 'UTC', '15:00'],
    ['UTC', '2026-01-04', 'America/New_York', '04:00'], ['GMT', '2026-07-05', 'America/Los_Angeles', '02:00'],
  ])('converts %s rules on %s to %s using the posting date', (zone, date, timezone, time) => {
    const limit = restrictions([{ short_name: 'Promo', description: `Only on Sunday 9am-5pm ${zone}` }], timezone);
    expect(limit.manualReview).toBeUndefined();
    const slot = postingSlot(date, limit, timezone); expect(slot).toMatchObject({ date, time, timezone }); expect(slot.instant).toMatch(/Z$/);
    expect(postingWindow(slot.date, slot.time, slot.timezone, limit, slot.instant)).toEqual({ day: true, time: true });
    expect(postingWindow(slot.date, undefined, slot.timezone, limit).time).toBe(false);
  });
  it('preserves source-zone weekdays across date rollover and overnight windows', () => {
    const late = restrictions([{ short_name: 'Promo', description: 'Only on Sunday from 11pm to 2am PT' }], 'UTC');
    expect(postingSlot('2026-01-05', late, 'UTC')).toEqual({ date: '2026-01-05', time: '07:00', timezone: 'UTC', instant: '2026-01-05T07:00:00.000Z' });
    expect(postingWindow('2026-01-05', '09:00', 'UTC', late)).toEqual({ day: true, time: true });
    expect(postingWindow('2026-01-05', '11:00', 'UTC', late).time).toBe(false);
    const early = restrictions([{ short_name: 'Promo', description: 'Only on Sunday from 1am to 2am UTC' }], 'America/Los_Angeles');
    expect(postingSlot('2026-01-03', early, 'America/Los_Angeles')).toEqual({ date: '2026-01-03', time: '17:00', timezone: 'America/Los_Angeles', instant: '2026-01-04T01:00:00.000Z' });
    expect(postingWindow('2026-01-03', '17:00', 'America/Los_Angeles', early)).toEqual({ day: true, time: true });
    const local = restrictions([], 'America/New_York');
    expect(postingSlot('2026-01-04', local, 'America/New_York')).toEqual({ date: '2026-01-04', time: undefined, timezone: 'America/New_York' });
  });
  it.each([
    'titles 10–50 characters; post 9am-5pm ET',
    'titles 10-20 characters; post 09:00–17:00 ET',
    'titles 10–50 characters; post 9-17 ET',
    'titles 10–50 characters; post ET 9-17',
    'titles 10-20 characters; post between 9 and 17 ET',
  ])('ignores non-time numeric ranges in %s', description => {
    const limit = restrictions([{ short_name: 'Self-Promo Sunday', description }], 'UTC');
    expect(limit).toMatchObject({ start: 540, end: 1020, timezone: 'America/New_York' }); expect(limit.manualReview).toBeUndefined();
    const slot = postingSlot('2026-01-04', limit, 'UTC'); expect(slot).toMatchObject({ date: '2026-01-04', time: '14:00' });
    expect(postingWindow(slot.date, slot.time, slot.timezone, limit, slot.instant)).toEqual({ day: true, time: true });
  });
  it('leaves non-time ranges unparsed and still writes a plan with a later time window', async () => {
    const limit = restrictions([{ short_name: 'Promo', description: 'Titles 10–50 characters; account 90-180 days old.' }], 'UTC');
    expect(limit.start).toBeUndefined(); expect(limit.end).toBeUndefined(); expect(limit.manualReview).toBeUndefined();
    const cwd = await setup(); await writeFile(join(cwd, '.launch/config.json'), JSON.stringify({ launchDate: '2026-01-04', timezone: 'UTC' }));
    const evidence = { ...fixture[0]!, rules: [{ short_name: 'Self-Promo Sunday', description: 'Titles 10–50 characters; post 9am-5pm ET' }] };
    const file = join(cwd, 'capture.json'); await writeFile(file, JSON.stringify(evidence)); await importEvidence(cwd, file);
    expect((await reportCommunities(cwd)).valid).toBe(true);
    const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(report.recommended).toEqual(['builders']); expect(report.plan[0]).toMatchObject({ date: '2026-01-04', time: '14:00', timezone: 'UTC' });
    expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
  });
  it.each(['at 9am Sundays', 'at 9am sharp on Sundays', 'at 9am, Sundays', 'at 9am Sundays; read https://www.reddit.com/r/builders/about/rules'])('does not treat prose after a clock as a zone: %s', async description => {
    const rules = [{ short_name: 'Self-Promo Sunday', description }];
    const limit = restrictions(rules, 'UTC'); expect(limit).toMatchObject({ days: [0], start: 540, end: 540, timezone: 'UTC' }); expect(limit.manualReview).toBeUndefined();
    const cwd = await setup(); await writeFile(join(cwd, '.launch/config.json'), JSON.stringify({ launchDate: '2026-01-04', timezone: 'UTC' }));
    const file = join(cwd, 'capture.json'); await writeFile(file, JSON.stringify({ ...fixture[0]!, rules })); await importEvidence(cwd, file);
    const result = await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(report.recommended).toEqual(['builders']); expect(report.plan[0]).toMatchObject({ date: '2026-01-04', time: '09:00', timezone: 'UTC' });
    expect(result.markdown).toContain('## Needs manual review\nNone.'); expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
  });
  it.each([['ET', '14:00'], ['(ET)', '14:00'], ['Europe/Paris', '08:00']])('recognizes the zone token %s before trailing weekdays', (zone, time) => {
    const limit = restrictions([{ short_name: 'Promo', description: `at 9am ${zone} Sundays` }], 'UTC');
    expect(limit.manualReview).toBeUndefined(); expect(postingSlot('2026-01-04', limit, 'UTC')).toMatchObject({ date: '2026-01-04', time, timezone: 'UTC' });
  });
  it.each([
    'from 18 to 21 in ET', 'from 18 to 21', 'after 9am ET', 'at noon ET', '18:00 ET',
    '9am-5pm ET and from 18 to 21', 'at 9am and at 5pm ET', 'at 25am ET',
    '9:75am-5pm ET', '9-5pm ET', 'post during business hours ET', 'at 9am for 2 hours ET',
  ])('fails closed instead of scheduling a partially parsed time: %s', async description => {
    const rules = [{ short_name: 'Self-Promo Sunday', description }]; const limit = restrictions(rules, 'UTC');
    expect(limit.manualReview).toBe('Unparsed or ambiguous posting time/window'); expect(() => postingSlot('2026-01-04', limit, 'UTC')).toThrow();
    const cwd = await setup(); const file = join(cwd, 'capture.json'); await writeFile(file, JSON.stringify({ ...fixture[0]!, rules })); await importEvidence(cwd, file);
    const result = await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(result.valid).toBe(true); expect(result.markdown).toContain('Unparsed or ambiguous posting time/window');
    expect(report.recommended).toEqual([]); expect(report.plan).toEqual([]); expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
    report.plan.push({ subreddit: 'builders', date: '2026-01-04', time: '12:00', timezone: 'UTC', angle: 'lesson', variant: 'value-first', file: 'posts/builders.md' });
    expect((await checkCommunities(cwd, report)).errors).toContain('builders: rule timezone needs manual review');
  });
  it.each(['9am Singapore', 'Singapore at 9am', 'at 9am in Singapore', 'Singapore time at 9am', 'at 9am (Singapore)', 'İstanbul says to post at 9am Singapore'])('never substitutes the config zone for an unknown place: %s', async description => {
    const rules = [{ short_name: 'Self-Promo Sunday', description }]; const limit = restrictions(rules, 'UTC');
    expect(limit.manualReview).toBe('Unrecognized rule timezone or place: Singapore'); expect(() => postingSlot('2026-01-04', limit, 'UTC')).toThrow();
    const cwd = await setup(); const file = join(cwd, 'capture.json'); await writeFile(file, JSON.stringify({ ...fixture[0]!, rules })); await importEvidence(cwd, file);
    const result = await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(result.valid).toBe(true); expect(result.markdown).toContain('Unrecognized rule timezone or place: Singapore');
    expect(report.recommended).toEqual([]); expect(report.plan).toEqual([]); expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
  });
  it.each([
    'in r/builders', 'for u/Somebody', 'r/builders and u/Singapore', '/r/builders and /u/Somebody',
    'https://www.reddit.com/r/builders/about/rules.json', '[rules](https://example.org/Europe/Paris?at=6pm)',
    'www.example.org/Europe/Paris?at=6pm', 'example.org/Europe/Paris?at=6pm',
  ])('ignores references rather than treating them as rule times or zones: %s', async reference => {
    const description = `Only on Sunday at 9am ET ${reference}`; const rules = [{ short_name: 'Self-Promo Sunday', description }]; const limit = restrictions(rules, 'UTC');
    expect(limit.manualReview).toBeUndefined(); expect(limit.timezone).toBe('America/New_York'); expect(postingSlot('2026-01-04', limit, 'UTC').time).toBe('14:00');
    const cwd = await setup(); const file = join(cwd, 'capture.json'); await writeFile(file, JSON.stringify({ ...fixture[0]!, rules })); await importEvidence(cwd, file);
    const result = await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(result.valid).toBe(true); expect(result.markdown).toContain(description); expect(report.recommended).toEqual(['builders']);
    expect(report.plan).toHaveLength(1); expect(report.plan[0].time).toBe('14:00'); expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
  });
  it('does not infer restrictions from reference contents or erase actual unknown places', () => {
    const rules = (description: string) => [{ short_name: 'Self-Promo Sunday', description }];
    expect(restrictions(rules('r/builders u/Singapore https://example.org/?at=9am&zone=IST'), 'UTC')).toMatchObject({ start: undefined, end: undefined, timezone: 'UTC', manualReview: undefined });
    expect(restrictions(rules('at 9am Singapore in r/builders'), 'UTC').manualReview).toContain('Singapore');
    expect(restrictions(rules('at 9am Europe/Imaginary in r/builders'), 'UTC').manualReview).toContain('europe/imaginary');
  });
  it.each([5, 6])('preserves the %s:30 UTC instant when New York repeats 01:30 at fall-back', async hour => {
    const cwd = await setup(); await writeFile(join(cwd, '.launch/config.json'), JSON.stringify({ launchDate: '2026-11-01', timezone: 'America/New_York' }));
    const evidence = { ...fixture[0]!, rules: [{ short_name: 'Self-Promo Sunday', description: `Only on Sunday at ${hour}:30am UTC` }] };
    const file = join(cwd, 'capture.json'); await writeFile(file, JSON.stringify(evidence)); await importEvidence(cwd, file);
    const result = await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    const instant = `2026-11-01T0${hour}:30:00.000Z`;
    expect(report.plan[0]).toMatchObject({ date: '2026-11-01', time: '01:30', timezone: 'America/New_York', instant });
    expect(result.markdown).toContain(`01:30 America/New_York (${instant})`);
    expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
    report.plan[0].instant = `2026-11-01T0${hour === 5 ? 6 : 5}:30:00.000Z`;
    expect((await checkCommunities(cwd, report)).errors).toContain('builders: posting time violates cited rule');
    report.plan[0].instant = 'invalid'; expect((await checkCommunities(cwd, report)).valid).toBe(false);
  });
  it.each(['invalid slot', 'scheduling error'])('omits a generated %s for manual review without losing the report or other slots', async failure => {
    const cwd = await setup(); await writeFile(join(cwd, '.launch/config.json'), JSON.stringify({ launchDate: '2026-11-01', timezone: 'UTC' }));
    for (const evidence of fixture.slice(0, 2)) { const file = join(cwd, evidence.subreddit + '.json'); await writeFile(file, JSON.stringify(evidence)); await importEvidence(cwd, file); }
    const spy = vi.spyOn(schedule, 'postingSlot');
    if (failure === 'invalid slot') spy.mockReturnValueOnce({ date: '2026-11-01', time: '09:00', timezone: 'UTC', instant: '2026-11-01T08:00:00.000Z' });
    else spy.mockImplementationOnce(() => { throw new Error('No valid rule time found'); });
    try {
      const result = await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
      expect(result.valid).toBe(true); expect(report.recommended).toEqual(['makers']); expect(report.plan.map((p: any) => p.subreddit)).toEqual(['makers']);
      expect(result.markdown).toContain('r/builders: no valid generated posting slot');
      await expect(readFile(join(cwd, '.launch/communities/posts/builders.md'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
    } finally { spy.mockRestore(); }
  });
  it('writes converted plan times and gates times interpreted in the wrong zone', async () => {
    const cwd = await setup(); await writeFile(join(cwd, '.launch/config.json'), JSON.stringify({ launchDate: '2026-01-04', timezone: 'UTC' }));
    const evidence = { ...fixture[0]!, rules: [{ short_name: 'Self-Promo Sunday', description: 'Only on Sunday 9am-5pm ET' }] };
    const file = join(cwd, 'capture.json'); await writeFile(file, JSON.stringify(evidence)); await importEvidence(cwd, file);
    await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(report.plan[0]).toMatchObject({ date: '2026-01-04', time: '14:00', timezone: 'UTC' });
    expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
    report.plan[0].time = '09:00'; expect((await checkCommunities(cwd, report)).errors).toContain('builders: posting time violates cited rule');
    report.plan[0].timezone = 'America/New_York'; expect((await checkCommunities(cwd, report)).errors).toContain('builders: posting timezone differs from config');
  });
  it('requires manual review for unrecognized or conflicting rule zones instead of scheduling them', async () => {
    const cwd = await setup(); await writeFile(join(cwd, '.launch/config.json'), JSON.stringify({ launchDate: '2026-01-04', timezone: 'UTC' }));
    for (const zone of ['IST', 'Europe/Imaginary', 'UTC+2', 'ET or PT']) {
      const limit = restrictions([{ short_name: 'Promo', description: `Only on Sunday from 9am to 5pm ${zone}` }], 'UTC');
      expect(limit.manualReview).toBeTruthy(); expect(() => postingSlot('2026-01-04', limit, 'UTC')).toThrow();
    }
    const evidence = { ...fixture[0]!, rules: [{ short_name: 'Self-Promo Sunday', description: 'Only on Sunday from 9am to 5pm IST' }] };
    const file = join(cwd, 'capture.json'); await writeFile(file, JSON.stringify(evidence)); await importEvidence(cwd, file);
    const result = await reportCommunities(cwd); const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(report.recommended).toEqual([]); expect(report.plan).toEqual([]); expect(result.markdown).toContain('Unrecognized rule timezone: ist');
    expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
    report.recommended.push('builders'); report.plan.push({ subreddit: 'builders', date: '2026-01-04', time: '09:00', timezone: 'UTC', angle: 'lesson', variant: 'value-first', file: 'posts/builders.md' });
    expect((await checkCommunities(cwd, report)).errors).toContain('builders: rule timezone needs manual review');
  });
  it('fetches OAuth evidence and caches every external response', async () => {
    const cwd = await setup(); let calls = 0;
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); calls++;
      if (url.includes('hn.algolia')) return new Response('{"hits":[]}');
      expect((init?.headers as Record<string, string>)['User-Agent']).toBe('liftoff-communities/0.1');
      const body = url.includes('/api/v1/me') ? { total_karma: 200, created_utc: 1700000000 } : url.includes('post_requirements') ? { is_flair_required: true } : url.endsWith('/about/rules') ? { rules: fixture[0]!.rules } : url.endsWith('/about') ? { data: fixture[0]!.about } : { data: { children: [{ data: { ...fixture[0]!.topPosts[0], permalink: '/r/builders/comments/a/ask' } }] } };
      return new Response(JSON.stringify(body));
    }) as typeof fetch;
    const opts = { fetch: fetcher, env: { REDDIT_ACCESS_TOKEN: 'fixture-token' } };
    expect((await fetchCommunities(cwd, [], opts)).needsBrowser).toEqual([]); const count = calls;
    await fetchCommunities(cwd, [], opts); expect(calls).toBe(count);
    await reportCommunities(cwd); expect((await checkCommunities(cwd)).valid).toBe(true);
  });
  it('merges new query hits into existing subreddit evidence by URL without refetching metadata', async () => {
    const cwd = await setup(); const calls: string[] = [];
    const post = (id: string) => ({ data: { ...fixture[0]!.searchHits![0], permalink: `/r/builders/comments/${id}/ask` } });
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input); calls.push(url);
      const body = url.includes('hn.algolia') ? { hits: [] } : url.includes('/search?') ? { data: { children: url.includes('second') ? [post('a'), post('b'), post('b')] : [post('a')] } } : url.includes('/api/v1/me') ? { total_karma: 200, created_utc: 1700000000 } : url.includes('post_requirements') ? { is_flair_required: false } : url.endsWith('/about/rules') ? { rules: fixture[0]!.rules } : url.endsWith('/about') ? { data: fixture[0]!.about } : { data: { children: [] } };
      return new Response(JSON.stringify(body));
    }) as typeof fetch;
    const opts = { fetch: fetcher, env: { REDDIT_ACCESS_TOKEN: 'fixture-token' } };
    await fetchCommunities(cwd, ['first'], opts);
    const file = join(cwd, '.launch/communities/raw/reddit/builders.json'); const before = JSON.parse(await readFile(file, 'utf8'));
    const count = calls.length; await fetchCommunities(cwd, ['second'], opts);
    expect(calls.slice(count)).toHaveLength(2); expect(calls.slice(count).every(u => u.includes('/search?'))).toBe(true);
    const after = JSON.parse(await readFile(file, 'utf8'));
    expect(after.searchHits.map((p: any) => p.url)).toEqual(['https://www.reddit.com/r/builders/comments/a/ask', 'https://www.reddit.com/r/builders/comments/b/ask']);
    expect({ ...after, searchHits: [] }).toEqual({ ...before, searchHits: [] });
    const cachedCount = calls.length; await fetchCommunities(cwd, ['second'], opts); expect(calls).toHaveLength(cachedCount);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(after);
    await reportCommunities(cwd); expect((await checkCommunities(cwd)).valid).toBe(true);
  });
  it('uses browser fallback, caches HN and never calls Reddit without a token', async () => {
    const cwd = await setup(); let calls = 0;
    const fetcher = (async (url: string | URL | Request) => { expect(String(url)).toContain('hn.algolia.com'); calls++; return new Response(JSON.stringify({ hits: [] })); }) as typeof fetch;
    const first = await fetchCommunities(cwd, [], { fetch: fetcher, env: {} }); expect(first.needsBrowser[0]!.subreddit).toBe('builders'); expect(calls).toBe(2);
    await fetchCommunities(cwd, [], { fetch: fetcher, env: {} }); expect(calls).toBe(2);
  });
  it('imports evidence, generates distinct drafts, excludes bans and gates edits', async () => {
    const cwd = await setup();
    for (const e of fixture) { const file = join(cwd, e.subreddit + '.json'); await writeFile(file, JSON.stringify(e)); await importEvidence(cwd, file); }
    await writeFile(join(cwd, '.launch/communities/hn.json'), await readFile('fixtures/cli-tool/.liftoff-fixture/communities-hn.json', 'utf8'));
    await reportCommunities(cwd); expect(await checkCommunities(cwd)).toEqual({ valid: true, errors: [] });
    const report = JSON.parse(await readFile(join(cwd, '.launch/communities.json'), 'utf8'));
    expect(report.plan.some((p: any) => p.subreddit === 'banned' || p.subreddit === 'unknown')).toBe(false);
    expect(report.plan.find((p: any) => p.subreddit === 'weekly').variant).toBe('value-first');
    expect(report.threads.length).toBeGreaterThan(0);
    report.plan.push({ ...report.plan[0], subreddit: 'banned', date: '2028-01-01' }); expect((await checkCommunities(cwd, report)).valid).toBe(false); report.plan.pop();
    report.subreddits.find((s: any) => s.subreddit === report.recommended[0]).citedRules = []; expect((await checkCommunities(cwd, report)).valid).toBe(false);
    report.threads = Array(11).fill(report.threads[0]); expect((await checkCommunities(cwd, report)).errors).toContain('More than 10 replies');
    const first = await readFile(join(cwd, '.launch/communities', report.plan[0].file), 'utf8');
    await writeFile(join(cwd, '.launch/communities', report.plan[1].file), first); expect((await checkCommunities(cwd)).errors).toContain('Identical drafts');
    await writeFile(join(cwd, '.launch/communities', report.plan[0].file), 'please upvote'); expect((await checkCommunities(cwd)).valid).toBe(false);
  });
  it('handles empty evidence, unknown accounts, deterministic scoring and invalid imports', async () => {
    const cwd = await setup(); const e = fixture.find(e => e.subreddit === 'karma')!;
    expect(scoreEvidence(e, ['pain tracking'], [], {}, 'UTC').eligibility).toBe('unknown');
    expect(scoreEvidence(e, ['pain tracking'], [], { karma: 0, accountAgeDays: 0 }, 'UTC').eligibility).toBe('fails');
    expect(scoreEvidence(e, ['pain tracking'], [], { karma: 100, accountAgeDays: 30 }, 'UTC').eligibility).toBe('meets');
    await reportCommunities(cwd); expect((await checkCommunities(cwd)).valid).toBe(true);
    const markdown = await readFile(join(cwd, '.launch/communities.md'), 'utf8');
    expect(markdown).toContain('## Threads asking for this\nNone.'); expect(markdown).toContain('## Other communities\nNone.');
    const bad = join(cwd, 'bad.json'); await writeFile(bad, '{"subreddit":"../bad"}'); await expect(importEvidence(cwd, bad)).rejects.toThrow();
  });
});
