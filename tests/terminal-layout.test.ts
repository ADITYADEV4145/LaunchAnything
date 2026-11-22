import { expect, it } from 'vitest';
import { terminalLayout } from '../src/visuals/terminal-layout.js';

it('sizes the window from the longest actual output line and wraps only on word boundaries', () => {
  const line = "Why: 'formatCurrency' is not exported in money.ts. Did you mean formatPrice (money.ts:1, formatPrice(cents: number): string)?";
  const result = terminalLayout(line,{width:1200,fontSize:40});
  expect(result.columns).toBe(110);
  expect(result.width).toBeGreaterThan(1200);
  expect(result.text.split('\n').every(line=>line.length<=result.columns)).toBe(true);
  expect(result.text.replace(/\s+/g,' ')).toBe(line);
  expect(result.text).toContain('money.ts');
  expect(result.text).not.toContain('format\nPrice');
  expect(terminalLayout('READY').columns).toBe(40);
  expect(terminalLayout('')).toMatchObject({text:'',width:1600,height:900});
  expect(terminalLayout('\x1b[32mREADY\x1b[0m').text).toBe('READY');
});

it('rejects tokens that cannot fit instead of splitting identifiers or overflowing the viewport', () => {
  expect(()=>terminalLayout('x'.repeat(111))).toThrow('token exceeds 110 columns');
  for(const cols of [0,111,1.5]) expect(()=>terminalLayout('READY',{cols})).toThrow('columns must be');
  expect(()=>terminalLayout('READY\n'.repeat(1000))).toThrow('too tall');
});
