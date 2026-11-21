import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decisions } from './approvals.js';
import { loadReview, mediaType } from './posts.js';
import type { ReviewPost } from './posts.js';

const escape = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
const safeLink = (value: string) => /^https?:\/\//i.test(value);
const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

function card(post: ReviewPost, state: string, timezone: string) {
  const media = post.media.map(({ path, slot, bytes }) => {
    const mime = mediaType(path);
    const src = mime && 'data:' + mime + ';base64,' + bytes.toString('base64');
    if (mime?.startsWith('video/')) return `<video src="${src}" controls preload="metadata"></video>`;
    if (mime?.startsWith('image/')) return `<img src="${src}" alt="${escape(slot)}">`;
    return `<p>Attachment: ${escape(path)}</p>`;
  }).join('');
  const titleCount = [...post.title].length;
  const bodyCount = [...post.body].length;
  const time = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone })
    .format(new Date(post.scheduledAt));
  return `<article data-channel="${post.channel}">
  <header><strong>${escape(post.label)}</strong><span class="state">${escape(state)}</span></header>
  <h2>${escape(post.title)}</h2>
  <div class="body">${escape(post.body)}</div>
  ${post.link ? `<p>${safeLink(post.link) ? `<a href="${escape(post.link)}" target="_blank" rel="noopener noreferrer">${escape(post.link)}</a>`
    : escape(post.link)}</p>` : ''}
  ${media}
  <dl>
    <div><dt>Scheduled</dt><dd><time datetime="${post.scheduledAt}">${escape(time)} (${escape(timezone)})</time></dd></div>
    <div><dt>Characters</dt><dd>${titleCount} title · ${bodyCount} body</dd></div>
    <div><dt>Checks</dt><dd>Post schema passed · ${post.media.length} local attachments verified</dd></div>
  </dl>
  <div class="actions">
    <button type="button" data-action="approve">Approve</button>
    <button type="button" data-action="edit">Edit</button>
    <button type="button" data-action="skip">Skip</button>
  </div>
  <div class="edit" hidden><label>Source Markdown<textarea rows="12" spellcheck="false"></textarea></label>
    <button type="button" data-action="save">Save edit</button></div>
  <p class="feedback" role="status"></p>
  </article>`;
}

const script = String.raw`
const snapshot = JSON.parse(document.getElementById('snapshot').textContent);
const approver = document.getElementById('approver');
let launch;
let saving = false;
async function chooseLaunch() {
  if (!window.showDirectoryPicker)
    throw new Error('Open this local file in a Chromium browser to save review decisions.');
  const repo = await window.showDirectoryPicker({ id: 'liftoff-review', mode: 'readwrite' });
  return repo.getDirectoryHandle('.launch');
}
async function read(dir, name, fallback) {
  try { return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text()); }
  catch (error) { if (error.name !== 'NotFoundError') throw error; return fallback; }
}
async function write(dir, name, value) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writer = await handle.createWritable();
  await writer.write(value);
  await writer.close();
}
for (const article of document.querySelectorAll('article')) {
  const channel = article.dataset.channel;
  const post = snapshot.posts[channel];
  const feedback = article.querySelector('.feedback');
  const state = article.querySelector('.state');
  const editor = article.querySelector('.edit');
  const buttons = Array.from(article.querySelectorAll('button'));
  const input = editor.querySelector('textarea');
  for (const button of buttons) button.addEventListener('click', async () => {
    const action = button.dataset.action;
    if (action === 'edit') {
      if (editor.hidden) input.value = post.source;
      editor.hidden = !editor.hidden;
      if (!editor.hidden) input.focus();
      return;
    }
    if (saving) return;
    saving = true;
    for (const item of buttons) item.disabled = true;
    try {
      const person = snapshot.approvers.length
        ? snapshot.approvers[Number(approver.value || '-1')]
        : { name: approver.value.trim() };
      if (action === 'approve' && !person?.name) throw new Error('Enter or select your name first.');
      launch ??= await chooseLaunch();
      const postDir = await launch.getDirectoryHandle('posts');
      const file = await (await postDir.getFileHandle(post.filename)).getFile();
      if (await file.text() !== post.source)
        throw new Error('This post changed or the wrong repository was selected. Run liftoff review and reopen the page.');
      if (action === 'save') {
        await write(postDir, post.filename, input.value);
        editor.hidden = true;
        state.textContent = 'Edited';
        feedback.textContent = 'Saved. Run liftoff review and reopen the page to approve the new version.';
        return;
      }
      const review = await launch.getDirectoryHandle('review');
      const skipped = await read(review, 'skipped.json', {});
      if (action === 'skip') {
        skipped[channel] = post.hash;
        await write(review, 'skipped.json', JSON.stringify(skipped, null, 2) + '\n');
        state.textContent = 'Skipped';
        feedback.textContent = 'This version will be excluded from publish.';
        return;
      }
      const records = await read(launch, 'approvals.json', { approvals: [] });
      records.approvals = records.approvals.filter(item =>
        item.channel !== channel || item.name !== person.name);
      records.approvals.push({ channel, ...person, time: new Date().toISOString(), hash: post.hash });
      await write(launch, 'approvals.json', JSON.stringify(records, null, 2) + '\n');
      if (Object.hasOwn(skipped, channel)) {
        delete skipped[channel];
        await write(review, 'skipped.json', JSON.stringify(skipped, null, 2) + '\n');
      }
      const matched = records.approvals.filter(item => item.channel === channel && item.hash === post.hash);
      const waiting = snapshot.approvers.filter(person => !matched.some(item =>
        item.name === person.name && item.role === person.role));
      state.textContent = waiting.length ? 'Awaiting approval' : 'Approved';
      feedback.textContent = waiting.length ? 'Still needed: ' + waiting.map(person => person.name).join(', ') : 'Approval saved.';
    } catch (error) {
      launch = undefined;
      feedback.textContent = error.message;
    } finally {
      saving = false;
      for (const item of buttons) item.disabled = false;
    }
  });
}
`;

const style = `
:root{font:16px/1.55 system-ui,sans-serif;color:#142237;background:#edf2f8}
*{box-sizing:border-box}body{margin:0}main{max-width:970px;margin:auto;padding:40px 24px}
h1,h2,p{margin:0 0 14px}h1{font-size:clamp(2rem,5vw,3rem);line-height:1.12}
article{background:#fff;border:1px solid #ccd7e4;border-radius:16px;margin:22px 0;padding:24px;overflow-wrap:anywhere}
header,.actions,dl{display:flex;gap:12px;flex-wrap:wrap}header{justify-content:space-between;margin-bottom:12px}
.state{border-radius:20px;background:#e6f0ff;padding:2px 12px;font-size:.85rem}
.body{white-space:pre-wrap}img,video{display:block;max-width:100%;max-height:420px;margin:16px 0;border-radius:8px}
dl{border-block:1px solid #e0e8f1;padding:12px 0;gap:12px 28px}dt{font-size:.8rem;font-weight:700}dd{margin:0}
button,input,select,textarea{font:inherit;padding:6px 12px;border:1px solid #7587a0;border-radius:6px}
button{cursor:pointer;background:white;color:inherit}button[data-action=approve]{background:#1b4faf;color:white;border-color:#1b4faf}
button:disabled{opacity:.55;cursor:wait}textarea{display:block;width:100%;margin:8px 0}.edit,.feedback:not(:empty){margin-top:12px}
a{color:#1b4faf}
`;

export async function buildReview(cwd?: string) {
  const { paths, config, posts } = await loadReview(cwd);
  const { approvals, skips } = await decisions(paths);
  const approvers = config.approvers ?? [];
  const selector = approvers.length ? `<select id="approver"><option value="">Choose your name</option>
    ${approvers.map(({ name, role }, i) => `<option value="${i}">${escape(name + (role ? ' · ' + role : ''))}</option>`).join('')}</select>`
    : '<input id="approver" autocomplete="name">';
  const snapshots = Object.fromEntries(posts.map(({ channel, filename, hash, source }) =>
    [channel, { filename, hash, source }]));
  const cards = posts.map(post => {
    const matches = approvals.filter(record => record.channel === post.channel && record.hash === post.hash && record.name.trim());
    const approved = matches.length && approvers.every(person =>
      matches.some(record => record.name === person.name && record.role === person.role));
    return card(post, skips[post.channel] === post.hash ? 'Skipped' : approved ? 'Approved' : 'Awaiting approval', config.timezone);
  });
  const scriptHash = createHash('sha256').update(script).digest('base64');
  const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'">
<title>Liftoff · Launch review</title><style>${style}</style>
<main><h1>Launch review</h1>
<p>Review the exact post and attachments before approving. To save changes, open this file in Chromium and select your repository folder when prompted.</p>
<label>Approver ${selector}</label>
${cards.join('\n')}
</main><script id="snapshot" type="application/json">${json({ approvers, posts: snapshots })}</script>
<script>${script}</script></html>`;
  await mkdir(paths.review, { recursive: true });
  const path = join(paths.review, 'index.html');
  await writeFile(path, html);
  return { path, posts: posts.map(({ channel, hash, scheduledAt }) => ({ channel, hash, scheduledAt })) };
}
