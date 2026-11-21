import { join, posix } from 'node:path';
import { auditPaths, isFeedbackUrl, readText, webUrl, type Input } from './input.js';
import { addition, insertion } from './diff.js';

type Status = 'pass' | 'fail' | 'unverified';
const finding = (check: string, passed: boolean | undefined, detail: string) => ({
  check, status: (passed === undefined ? 'unverified' : passed ? 'pass' : 'fail') as Status, detail,
});
const checklist = (findings: ReturnType<typeof finding>[]) => findings.filter(item => item.status !== 'pass');
const demoLabel = /\b(?:demo|preview|walkthrough|playground)\b/i;
const actionLabel = /\b(?:get started|getting started|quickstart|try|install|download|sign up|join|start)\b/i;
const draftMarker = '<!-- liftoff: support draft -->';
const hideComments = (source: string) => source.replace(/<!--[\s\S]*?-->/g, '');
const plain = (text: string) => text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').trim();
const withoutCode = (source: string) => hideComments(source).replace(/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}(?:`{3,}|~{3,})[^\n]*$/gm, '');
const code = (command: string) => {
  const fence = '`'.repeat(1 + Math.max(0, ...(command.match(/`+/g) ?? []).map(run => run.length)));
  const padding = command.startsWith('`') || command.endsWith('`') ? ' ' : '';
  return fence + padding + command + padding + fence;
};
const hasCommand = (text: string, command: string) => !!command && (text.includes(code(command)) ||
  text.split(/\r?\n/).some(line => line.trim().replace(/^\$\s+/, '') === command));
const attr = (attributes: string, name: string) => {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i').exec(attributes);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
};
const usableLink = (link: string) => !!webUrl(link) || /^(?:#[\w-]+|\/(?![\\/])[^\\\s]+|\.{1,2}\/[^\s]+|[\w-][\w/.-]*(?:#[\w-]+)?)$/.test(link);
const attrEscape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function audit(cwd: string, input: Input) {
  const paths = auditPaths(input);
  const read = (path: string) => readText(cwd, join(cwd, path));
  const readme = read(paths.readme);
  const landing = paths.landing && read(paths.landing);
  const command = input.installCommand?.trim() ?? '';
  const demoUrl = input.demoUrl && webUrl(input.demoUrl)?.href;
  const imageUrl = input.ogImageUrl && webUrl(input.ogImageUrl)?.href;
  const feedbackUrl = input.feedbackUrl && isFeedbackUrl(input.feedbackUrl) ? webUrl(input.feedbackUrl)!.href : undefined;
  const md = withoutCode(readme ?? '');
  const mdLinks = [...md.matchAll(/(!?)\[([^\]\n]+)\]\((?:<([^>\n]+)>|([^\s)]+))\)/g)]
    .map(([, image, label, wrapped, bare]) => ({ image: Boolean(image), label, url: wrapped ?? bare }));
  const feedback = mdLinks.find(({ image, url }) => !image && isFeedbackUrl(url))?.url;
  const mdFindings = [
    finding('headline', /^#[ \t]+\S/m.test(md), 'Add a descriptive top-level heading.'),
    finding('demo', mdLinks.some(({ label, url }) => usableLink(url) && demoLabel.test(label)),
      'Link a demo or walkthrough near the top.'),
    finding('cta', mdLinks.some(({ image, label, url }) => !image && actionLabel.test(label) && usableLink(url)),
      'Add a clear next step such as “Get started”.'),
    finding('install-command', command ? hasCommand(hideComments(readme ?? ''), command) : undefined,
      'Document the verified one-command installation.'),
  ];

  const html = hideComments(landing ?? '').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const htmlLinks = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  const videoSources = [...html.matchAll(/<video\b[^>]*>([\s\S]*?)<\/video>/gi)]
    .flatMap(([, body]) => [...body.matchAll(/<source\b([^>]*)>/gi)]);
  const hasDemo = [...html.matchAll(/<(?:video|iframe)\b([^>]*)>/gi), ...videoSources]
    .some(([, attrs]) => usableLink(attr(attrs, 'src'))) ||
    htmlLinks.some(([, attrs, label]) => demoLabel.test(plain(label)) && usableLink(attr(attrs, 'href')));
  const lcp = input.landingLcpMs ?? undefined;
  const inspected = landing !== undefined;
  const ogTags = [...html.matchAll(/<meta\b([^>]*)>/gi)].filter(([, attrs]) =>
    attr(attrs, 'property').toLowerCase() === 'og:image');
  const htmlFindings = [
    finding('snapshot', paths.landing ? inspected : undefined, 'Supply a saved HTML landing page snapshot.'),
    finding('headline', inspected ? [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].some(([, text]) => !!plain(text)) : undefined,
      'Use a descriptive H1 in the hero.'),
    finding('demo-above-fold', inspected && !hasDemo ? false : (inspected ? input.demoAboveFold ?? undefined : undefined),
      'Place the demo in the hero and record a visual check at your target viewport.'),
    finding('cta', inspected ? htmlLinks.some(([, attrs, label]) => actionLabel.test(plain(label)) && usableLink(attr(attrs, 'href'))) ||
      [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].some(([, label]) => actionLabel.test(plain(label))) : undefined,
      'Add a prominent, actionable call to action.'),
    finding('og-image', inspected ? ogTags.some(([, attrs]) => !!webUrl(attr(attrs, 'content'))) : undefined,
      'Add a public absolute og:image URL.'),
    finding('page-speed', inspected && lcp !== undefined ? lcp <= 2500 : undefined,
      lcp === undefined ? 'Record Largest Contentful Paint from a representative mobile run.' :
        `Recorded LCP: ${lcp} ms (target ≤2500 ms). Optimize the hero and defer nonessential scripts if over budget.`),
  ];
  const docs = {
    faq: read(paths.faq), gettingStarted: read(paths.gettingStarted),
  };
  const hasBody = (text: string) => hideComments(text).split(/\r?\n/).some(line => /^(?!\s*(?:#|TODO\b))\s*\S/i.test(line));
  const hasDoc = (text: string | undefined, heading: RegExp) => {
    if (text && !text.includes(draftMarker) && hasBody(text)) return true;
    const match = heading.exec(md);
    if (!match) return false;
    const level = match[0].match(/^#+/)![0].length;
    const nextPeer = new RegExp(`^#{1,${level}}[ \\t]+`, 'm');
    return hasBody(md.slice(match.index + match[0].length).split(nextPeer)[0]);
  };
  const support = [
    finding('faq', hasDoc(docs.faq, /^#{1,6}[ \t]+(?:FAQ|Frequently asked questions)[ \t]*#*[ \t]*$/im), 'Provide a substantive FAQ.'),
    finding('getting-started', hasDoc(docs.gettingStarted, /^#{1,6}[ \t]+(?:Getting started|Quickstart)[ \t]*#*[ \t]*$/im), 'Provide a guide for a first successful use.'),
    finding('feedback-channel', Boolean(feedback), 'Link GitHub Discussions or a Discord invite in the README.'),
  ];

  const readmeLink = (path: string) => {
    const link = posix.relative(posix.dirname(paths.readme), path);
    return link.startsWith('../') ? link : './' + link;
  };
  const mdAdd: string[] = [];
  const addReadme = (line: string) => { if (!readme?.includes(line)) mdAdd.push(line, ''); };
  if (readme === undefined) mdAdd.push('# TODO: Add the product name and describe who it helps.', '');
  for (const item of checklist(mdFindings)) {
    if (item.check === 'headline' && readme === undefined) continue;
    if (item.check === 'install-command' && command) addReadme('Install: ' + code(command));
    else if (item.check === 'demo' && demoUrl) addReadme('[Try the demo](<' + demoUrl + '>)');
    else if (item.check === 'cta' && docs.gettingStarted && support[1].status === 'pass')
      addReadme(`[Get started](${readmeLink(paths.gettingStarted)})`);
    else addReadme('<!-- TODO: ' + item.detail + ' -->');
  }
  if (!feedback) addReadme(feedbackUrl ? '[Share feedback](<' + feedbackUrl + '>)' :
    '<!-- TODO: Link an active GitHub Discussions or Discord channel. -->');
  const headingLine = readme?.match(/^[^\n]*\n/)?.[0] ?? '';
  const offset = /^#\s+\S/.test(headingLine) ? 1 : 0;
  const readmePatch = readme === undefined ? addition(paths.readme, mdAdd.join('\n')) :
    insertion(paths.readme, readme, offset, mdAdd.length && offset ? ['', ...mdAdd] : mdAdd);

  let landingPatch = '';
  if (landing !== undefined && paths.landing) {
    const improvements = checklist(htmlFindings);
    const head = landing.split('\n').findIndex(line => /^\s*<\/head\s*>/i.test(line));
    const doctype = /^<!doctype[^>]*>[ \t]*\r?\n/i.test(landing) ? 1 : 0;
    const additions = improvements.map(item => item.check === 'og-image' && imageUrl && !ogTags.length && head >= 0 ?
      '  <meta property="og:image" content="' + attrEscape(imageUrl) + '">' : '  <!-- TODO: ' + item.detail + ' -->')
      .filter(line => !landing.includes(line));
    landingPatch = insertion(paths.landing, landing, head >= 0 ? head : doctype, additions);
  }
  const supportPatch = (docs.faq === undefined && support[0].status !== 'pass' ? addition(paths.faq,
    '# FAQ\n\n' + draftMarker + '\n\n## How do I get started?\n\n' +
    `See [Getting started](${posix.relative(posix.dirname(paths.faq), paths.gettingStarted)}).\n\n` +
    '## What should I do if something goes wrong?\n\nTODO: Document common errors and verified fixes.') : '') +
    (docs.gettingStarted === undefined && support[1].status !== 'pass' ? addition(paths.gettingStarted,
      '# Getting started\n\n' + draftMarker + '\n\n## Install\n\n' +
      (command ? code(command) : 'TODO: Add the verified installation command.') +
      '\n\n## First successful run\n\nTODO: Describe the main path and expected result.') : '');
  return {
    readme: { path: paths.readme, checks: mdFindings },
    landing: { path: paths.landing ?? null, checks: htmlFindings },
    support: { checks: support, feedbackUrl: feedback ?? null },
    patch: readmePatch + landingPatch + supportPatch,
  };
}
