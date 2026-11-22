import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { assertSafePath } from '../copy/safe-path.js';
import { packageRoot } from '../core/package-root.js';
import { checkResearch, researchPaths, type Pains } from '../research/index.js';
import { audiencePath, checked, json, readJson, readLocal, sha256, writeLocal } from './files.js';
import { setupWaitlist } from './waitlist.js';

interface Evidence { pain: string; url: string }
interface Community { id: string; name: string; url: string; evidence: Evidence[] }
interface Draft {
  kind: 'outreach' | 'build-in-public';
  evidence: Evidence;
  body: string;
  community?: string;
  permission?: { rulesUrl: string; note: string };
}
interface Approval { by: string; sha256: string; approvedAt: string }

const normalize = (s: string) => s.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/\p{Pd}/gu, '-').replace(/\s+/gu, ' ').trim().toLowerCase();
const buildId = (evidence: Evidence) => 'build-' + sha256(json([evidence.pain, evidence.url])).slice(0, 12);
const rules = parse(readFileSync(join(packageRoot(), 'rules/audience.yaml'), 'utf8')) as { prohibited: Record<string, string> };
const patterns = Object.entries(rules.prohibited).map(([reason, source]) => [reason, new RegExp(source, 'iu')] as const);

function communityFor(link: string) {
  const url = new URL(link);
  const host = url.hostname.replace(/^www\./, '');
  const subreddit = host === 'reddit.com' || host === 'old.reddit.com'
    ? /^\/r\/([\w]+)(?:\/|$)/i.exec(url.pathname)?.[1]?.toLowerCase() : undefined;
  if (subreddit) return { name: 'r/' + subreddit, url: 'https://www.reddit.com/r/' + subreddit + '/' };
  const repo = host === 'github.com'
    ? /^\/([\w.-]+\/[\w.-]+)\/(?:issues|discussions)\/\d+(?:\/|$)/i.exec(url.pathname)?.[1]?.toLowerCase() : undefined;
  if (repo) return { name: repo, url: 'https://github.com/' + repo };
  if (host === 'news.ycombinator.com') return { name: 'Hacker News', url: 'https://news.ycombinator.com/' };
}

async function context(cwd: string) {
  const paths = researchPaths(cwd);
  for (const path of Object.values(paths)) assertSafePath(cwd, path);
  const pains = readJson<Pains>(cwd, paths.pains, 'pains');
  for (const file of existsSync(paths.raw) ? readdirSync(paths.raw) : [])
    if (file.endsWith('.json')) assertSafePath(cwd, join(paths.raw, file));
  const result = await checkResearch(cwd);
  if (!result.valid) throw new Error('Pain Report evidence: ' + result.errors.join('; '));
  const communities = new Map<string, Community>();
  const ranked = [...pains.pains].sort((a, b) => b.mentions - a.mentions || b.intensity - a.intensity);
  const evidence = ranked.flatMap(p => p.quotes.map(q => ({ pain: p.name, url: q.url })));
  const researchOnly: Evidence[] = [];
  for (const item of evidence) {
    const target = communityFor(item.url);
    if (!target) { researchOnly.push(item); continue; }
    let community = communities.get(target.url);
    if (!community) {
      community = { ...target, id: sha256(target.url).slice(0, 12), evidence: [] };
      communities.set(target.url, community);
    }
    if (!community.evidence.some(other => other.url === item.url && other.pain === item.pain)) community.evidence.push(item);
  }
  return { idea: pains.idea, ranked, evidence, communities: [...communities.values()], researchOnly };
}

function draftPath(cwd: string, id: string) {
  if (!/^(outreach|build)-[a-f0-9]{12}$/.test(id)) throw new Error('Invalid audience draft ID');
  return audiencePath(cwd, 'drafts', id + '.json');
}

export async function prepare(cwd: string) {
  const data = await context(cwd);
  const mapPath = audiencePath(cwd, 'community-map.json');
  writeLocal(cwd, mapPath, json({
    source: '.launch/research/pains.json', communities: data.communities, researchOnly: data.researchOnly,
    note: 'Evidence of a discussion is not permission to post, contact authors or request votes.',
  }));
  const drafts: { id: string; path: string }[] = [];
  function seed(id: string, draft: Draft) {
    const path = draftPath(cwd, id);
    if (readLocal(cwd, path) === undefined) writeLocal(cwd, path, json(checked('audience-draft', draft)));
    drafts.push({ id, path });
  }
  for (const community of data.communities) {
    const evidence = community.evidence[0]!;
    seed('outreach-' + community.id, {
      kind: 'outreach', community: community.id, evidence,
      body: `Hi ${community.name} — I'm Aditya, and I'm exploring this problem: ${evidence.pain}. How have you been working around it? I'd appreciate feedback here if the moderators are open to the discussion.`,
    });
  }
  for (const pain of data.ranked) {
    const evidence = { pain: pain.name, url: pain.quotes[0]!.url };
    seed(buildId(evidence), {
      kind: 'build-in-public', evidence,
      body: `I'm exploring ${data.idea}. One problem surfaced in the research: ${pain.name}. Here's an example: ${evidence.url}\n\nHave you run into this? I'd like to understand what your current workaround looks like. — Aditya`,
    });
  }
  return { map: mapPath, drafts, waitlist: setupWaitlist(cwd, data.idea) };
}

export async function review(cwd: string) {
  const data = await context(cwd);
  const directory = audiencePath(cwd, 'drafts');
  assertSafePath(cwd, directory);
  const files = readdirSync(directory).filter(file => file.endsWith('.json')).sort();
  const approvals = readJson<Record<string, Approval>>(cwd, audiencePath(cwd, 'approvals.json'), 'audience-approvals', {});
  const bodies = new Set<string>();
  return files.map(file => {
    const id = file.slice(0, -5);
    const raw = readLocal(cwd, draftPath(cwd, id))!;
    const draft = checked<Draft>('audience-draft', JSON.parse(raw));
    const body = normalize(draft.body);
    if (!body) throw new Error(id + ': draft is blank');
    for (const [reason, pattern] of patterns) if (pattern.test(body)) throw new Error(id + ': ' + reason);
    if (bodies.has(body)) throw new Error(id + ': duplicate copy; tailor each draft instead of cross-posting it');
    bodies.add(body);
    const isOutreach = draft.kind === 'outreach';
    const community = data.communities.find(item => item.id === draft.community);
    if (isOutreach && (!community || id !== 'outreach-' + community.id)) throw new Error(id + ': unknown or mismatched community; rerun audience prepare');
    if (!isOutreach && id !== buildId(draft.evidence)) throw new Error(id + ': mismatched build-in-public evidence');
    const sources = community?.evidence ?? data.evidence;
    if (!sources.some(source => source.pain === draft.evidence.pain && source.url === draft.evidence.url))
      throw new Error(id + ': evidence no longer matches the Pain Report; rerun audience prepare and remove the obsolete draft');
    const sha = sha256(json([id, raw, community?.url ?? null]));
    const blocked = isOutreach && (!draft.permission?.note.trim() || !draft.permission.rulesUrl)
      ? 'Record the applicable rules and moderator permission before requesting approval.' : undefined;
    return { id, ...draft, target: community?.url, sha256: sha, blocked, approved: !blocked && approvals[id]?.sha256 === sha };
  });
}

export async function approve(cwd: string, id: string, hash: string, by: string) {
  if (!by.trim()) throw new Error('Provide a named human approver');
  const draft = (await review(cwd)).find(item => item.id === id);
  if (!draft || draft.sha256 !== hash) throw new Error('Draft or hash no longer matches; review the current draft first');
  if (draft.blocked) throw new Error(draft.blocked);
  const path = audiencePath(cwd, 'approvals.json');
  const approvals = readJson<Record<string, Approval>>(cwd, path, 'audience-approvals', {});
  approvals[id] = { by: by.trim(), sha256: hash, approvedAt: new Date().toISOString() };
  writeLocal(cwd, path, json(approvals));
  return { id, ...approvals[id], sent: false };
}
