export interface BrowserDriver {
  open(url: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  select(selector: string, value: string): Promise<void>;
  upload(selector: string, files: string[]): Promise<void>;
  currentUrl(): Promise<string>;
  waitForUrl(pattern: RegExp, timeout: number): Promise<string>;
  close(): Promise<void>;
}
export class MockBrowser implements BrowserDriver {
  actions: { action: string; selector?: string; value?: unknown }[] = [];
  constructor(public result = 'https://news.ycombinator.com/item?id=123') {}
  async open(value: string) { this.actions.push({ action: 'open', value }); }
  async fill(selector: string, value: string) { this.guard(selector); this.actions.push({ action: 'fill', selector, value }); }
  async select(selector: string, value: string) { this.guard(selector); this.actions.push({ action: 'select', selector, value }); }
  async upload(selector: string, value: string[]) { this.guard(selector); this.actions.push({ action: 'upload', selector, value }); }
  private guard(selector: string) { if (/submit|button/i.test(selector)) throw new Error('Submit must never be automated'); }
  async currentUrl() { return this.result; }
  async waitForUrl(pattern: RegExp, _timeout: number) {
    if (!pattern.test(this.result)) throw new Error('Timed out waiting for user submission');
    return this.result;
  }
  async close() { this.actions.push({ action: 'close' }); }
}
export async function chromeBrowser(profile: string): Promise<BrowserDriver> {
  const { chromium } = await import('playwright');
  const context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: false });
  const page = await context.newPage();
  const field = (selector: string) => {
    if (/submit|button/i.test(selector)) throw new Error('Submit must never be automated');
    return page.locator(selector);
  };
  return {
    async open(url) { await page.goto(url); },
    async fill(selector, value) { await field(selector).fill(value); },
    async select(selector, value) { await field(selector).selectOption(value); },
    async upload(selector, files) { await field(selector).setInputFiles(files); },
    async currentUrl() { return page.url(); },
    async waitForUrl(pattern, timeout) { await page.waitForURL(pattern, { timeout }); return page.url(); },
    async close() { await context.close(); },
  };
}
