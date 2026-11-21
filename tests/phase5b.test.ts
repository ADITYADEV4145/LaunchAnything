import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { phase5bGate } from '../src/selftest/phase5b.js';
import { MemoryKeychain } from '../src/connect/keychain.js';
import { connect, connections } from '../src/connect/registry.js';
import { MockBrowser } from '../src/connect/browser.js';
import { fillForm, forms } from '../src/connect/forms.js';
import { assistedReminder, instagramPayload, productHuntPayload } from '../src/connect/payloads.js';
import type { ReviewPost } from '../src/review/posts.js';

const temp: string[] = [];
async function workspace() { const path = await mkdtemp(join(tmpdir(), 'liftoff-5b-')); temp.push(path); return path; }
afterEach(async () => { await Promise.all(temp.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it('runs the mock-only gate including approvals, secret isolation and cap refusal', async () => {
  await phase5bGate(await workspace());
});
it('validates route and token without persisting invalid connections', async () => {
  const home = await workspace();
  const keys = new MemoryKeychain();
  await expect(connect({ platform: 'reddit', route: 'api', account: 'me' }, 'secret', keys, home)).rejects.toThrow('Unsupported route');
  await expect(connect({ platform: 'devto', route: 'api', account: 'me' }, '', keys, home)).rejects.toThrow('Token required');
  await expect(connect({ platform: 'reddit', route: 'browser', account: 'me' }, undefined, keys, home)).rejects.toThrow('--profile');
  expect(await connections(home)).toEqual([]);
});
it.each(['reddit', 'product-hunt'] as const)('fills %s without any submit operation', async channel => {
  const browser = new MockBrowser(channel === 'reddit' ? 'https://www.reddit.com/r/test/comments/abc/title/' : 'https://www.producthunt.com/posts/my-product');
  const post = { channel, title: 'Product', body: 'Description', scheduledAt: '2026-07-14T12:00:00Z',
    source: '---\nsubreddit: test\nflair: Launch\n---\n', media: [{ path: 'media/gallery.png', slot: 'gallery', bytes: Buffer.from('mock') }, { path: 'media/9x16.mp4', slot: 'video', bytes: Buffer.from('mock') }] } as ReviewPost;
  await fillForm(browser, post, '/launch');
  expect(browser.actions.some(a => a.action === 'upload')).toBe(true);
  expect(await browser.waitForUrl(forms[channel].result, 1)).toBe(browser.result);
  expect('click' in browser).toBe(false);
  expect(browser.actions.some(a => /submit|button/.test(a.selector ?? ''))).toBe(false);
  browser.result = forms[channel].url;
  await expect(browser.waitForUrl(forms[channel].result, 1)).rejects.toThrow('Timed out');
});
it('builds Instagram assets and first comment and refuses missing assets', () => {
  expect(instagramPayload({ gallery: ['a.png', 'b.png'], verticalVideo: '9x16.mp4', caption: 'Launch', hashtags: ['build', '#local'], coverFrame: 2 })).toMatchObject({
    carousel: { images: ['a.png', 'b.png'] }, reel: { aspectRatio: '9:16', coverFrame: 2 }, caption: 'Launch', firstComment: '#build #local',
  });
  expect(() => instagramPayload({ gallery: [], verticalVideo: '', caption: '', hashtags: [], coverFrame: -1 })).toThrow('Instagram requires');
});
it('builds PT launch scheduling and timed open-and-fill alarms', () => {
  const input = { name: 'Product', tagline: 'Tagline', description: 'Description', gallery: [], makerComment: 'Hi', date: '2026-07-14' };
  expect(productHuntPayload(input)).toMatchObject({ launchAt: '2026-07-14T00:01:00', timezone: 'America/Los_Angeles' });
  expect(() => productHuntPayload({ ...input, name: '' })).toThrow('requires');
  const ph = assistedReminder('product-hunt', '2026-07-14T07:01:00Z', input.date);
  expect(ph).toContain('DTSTART;TZID=America/Los_Angeles:20260714T000100');
  expect(ph).toContain('TRIGGER:-PT24H');
  expect(ph).toContain('TRIGGER:-PT1H');
  expect(assistedReminder('reddit', '2026-07-14T12:00:00.000Z')).toContain('DTSTART:20260714T120000Z');
  expect(assistedReminder('show-hn', '2026-07-14T12:00:00Z')).toContain('liftoff publish --confirm --assist show-hn');
});
