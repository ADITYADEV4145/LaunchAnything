import type { Product } from './context.js';

export interface Citation { text: string; claim?: string; proof?: string; pain?: string | number }
export interface Proof { metric: string; value: number | string; unit?: string; context?: string; source_file?: string }
type Claim = Product['claims'][number];

const asText = (value: unknown) => typeof value === 'string' ? value
  : value && typeof value === 'object' ? String((value as Record<string, unknown>).pain ?? (value as Record<string, unknown>).text
    ?? (value as Record<string, unknown>).summary ?? (value as Record<string, unknown>).title ?? '') : '';
const quoteUrls = (value: unknown) => value && typeof value === 'object' && Array.isArray((value as { quotes?: unknown }).quotes)
  ? ((value as { quotes: unknown[] }).quotes).map(q => q && typeof q === 'object' ? String((q as { url?: unknown }).url ?? '') : '').filter(Boolean) : [];
const quoteTexts = (value: unknown) => value && typeof value === 'object' && Array.isArray((value as { quotes?: unknown }).quotes)
  ? ((value as { quotes: unknown[] }).quotes).map(q => typeof q === 'string' ? q : q && typeof q === 'object' ? String((q as { text?: unknown; quote?: unknown }).text ?? (q as { quote?: unknown }).quote ?? '') : '') : [];

/** Proof metrics (product.proof, Part A) followed by plain proof points (product.proofPoints), numbered from 1. */
export function proofs(product: Product): Proof[] {
  const extra = product as Product & { proof?: unknown; proofPoints?: unknown };
  const metrics = Array.isArray(extra.proof) ? extra.proof.filter((p): p is Proof => !!p && typeof p === 'object'
    && typeof (p as Proof).metric === 'string') : [];
  const points = Array.isArray(extra.proofPoints) ? extra.proofPoints.filter((p): p is string => typeof p === 'string')
    .map((text, i) => ({ metric: String(metrics.length + i + 1), value: text })) : [];
  return [...metrics, ...points];
}
export function pains(product: Product): { text: string; quotes: string[]; urls: string[] }[] {
  const value = (product as Product & { problem?: unknown }).problem;
  const named = value && typeof value === 'object' && !Array.isArray(value) ? (value as { pains?: unknown; summary?: unknown }) : undefined;
  const list = Array.isArray(value) ? value : named && Array.isArray(named.pains) && named.pains.length
    ? [...(named.summary ? [named.summary] : []), ...(named.pains as unknown[]).map(p => p && typeof p === 'object' ? { ...(p as object), text: (p as { name?: unknown }).name } : p)]
    : value ? [value] : [];
  return list.map(item => ({ text: asText(item), quotes: quoteTexts(item), urls: quoteUrls(item) })).filter(p => p.text);
}
export const proofText = (p: Proof) => (/^\d+$/.test(p.metric) ? [String(p.value)] : [p.metric, String(p.value), p.unit, p.context]).filter(Boolean).join(' ');

/** Product claims plus proof metrics and pains as citable claims. pain:1 is always the problem summary; researched pains follow, so adding one never renumbers. */
export function groundedClaims(product: Product): Claim[] {
  const proofClaims = proofs(product).map(p => ({ id: 'proof:' + p.metric, text: proofText(p),
    sources: p.source_file ? [{ type: 'file', ref: p.source_file }] : [] }));
  const painClaims = pains(product).map((p, i) => ({ id: 'pain:' + (i + 1), text: [p.text, ...p.quotes].join(' '),
    sources: p.urls.map(ref => ({ type: 'url', ref })) }));
  return [...product.claims, ...proofClaims, ...painClaims];
}
export function grounded(product: Product): Product { return { ...product, claims: groundedClaims(product) }; }

export function citationId(citation: Citation, product: Product): string | undefined {
  if (citation.claim) return citation.claim;
  if (citation.proof) return 'proof:' + citation.proof;
  if (citation.pain !== undefined) {
    const list = pains(product);
    const index = typeof citation.pain === 'number' || /^\d+$/.test(citation.pain) ? Number(citation.pain)
      : list.findIndex(p => p.text.toLowerCase() === String(citation.pain).toLowerCase()) + 1;
    return 'pain:' + index;
  }
}
export const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
export const spanPattern = (text: string) =>
  new RegExp(normalize(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
export const contains = (text: string, span: string) => spanPattern(span).test(text);
export const inlineTag = /\[claim:[^\]]+\]/;

/** Re-insert hidden citations as internal [claim:id] markers so sentence-level checks can see them. */
export function annotate(text: string, citations: Citation[] | undefined, product: Product) {
  let result = text;
  for (const citation of citations ?? []) {
    const id = citationId(citation, product);
    if (!id) continue;
    const match = spanPattern(citation.text).exec(result);
    if (!match) continue;
    const end = match.index + match[0].length;
    result = result.slice(0, end) + ' [claim:' + id + ']' + result.slice(end);
  }
  return result;
}
export function citationsFor(sentence: string, citations: Citation[] | undefined) {
  const clean = normalize(sentence);
  return (citations ?? []).filter(c => { const t = normalize(c.text); return clean.includes(t) || t.includes(clean); });
}

export function splitSentences(text: string) {
  return text.replace(/^[ \t]*(?:\d+[.)]|[-+*])[ \t]+/gm, '\n\n')
    .split(/\r?\n---\r?\n|\r?\n[ \t]*\r?\n/).flatMap(paragraph => paragraph
      .replace(/\r?\n/g, ' ')
      .replace(/([.!?])\s+((?:\[claim:[^\]]+\]\s*)+)/g, ' $2$1 ')
      .split(/(?<=[.!?])\s+/)).map(s => s.trim()).filter(Boolean);
}

/** Move inline [claim:id] tags into citations metadata; the visible text keeps no tags. */
export function stripInline(title: string, body: string) {
  const citations: Citation[] = [];
  const clean = (text: string) => {
    for (const sentence of splitSentences(text)) {
      const ids = [...sentence.matchAll(/\[claim:([^\]]+)\]/g)].map(m => m[1]);
      const plain = normalize(sentence.replace(/\s*\[claim:[^\]]+\]/g, '')).replace(/\s+([.!?,;:])/g, '$1');
      for (const id of ids) {
        if (plain.length < 3) continue;
        if (id.startsWith('proof:')) citations.push({ text: plain, proof: id.slice(6) });
        else if (id.startsWith('pain:')) citations.push({ text: plain, pain: id.slice(5) });
        else citations.push({ text: plain, claim: id });
      }
    }
    return text.replace(/[ \t]*\[claim:[^\]]+\]/g, '');
  };
  return { title: clean(title), body: clean(body), citations };
}
