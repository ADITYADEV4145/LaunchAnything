export const secretPatterns: Record<string, RegExp> = {
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  aws: /\bAKIA[A-Z0-9]{16}\b/g,
  github: /\b(?:ghp_[\w]{20,}|github_pat_[\w]{20,})/g,
  slack: /\bxox[a-z]?-[\w-]{10,}/g,
  stripe: /\b(?:sk_live_|sk_test_|rk_(?:live_|test_)?)[\w]{10,}/g,
  ai: /\bsk-[\w-]{16,}/g,
  google: /\bAIza[\w-]{20,}/g,
  jwt: /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,
  privateKey: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g,
  assignment: /\b(?:api[_-]?key|token)\s*[=:]\s*["']?[\w./+-]{16,}/gi,
};
export function scanSecrets(text: string): string[] {
  return Object.entries(secretPatterns).filter(([, pattern]) => new RegExp(pattern).test(text)).map(([name]) => name);
}
export function maskSecrets(text: string): string {
  for (const pattern of Object.values(secretPatterns)) text = text.replace(new RegExp(pattern), '[REDACTED]');
  return text;
}
export function assertPrivate(text: string): void {
  const names = scanSecrets(text);
  if (names.length) throw new Error(`Privacy guard: ${names.join(', ')} [REDACTED]`);
}
