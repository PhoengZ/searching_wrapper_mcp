import { test, expect } from 'vitest';
import { resolve } from 'node:path';
import { BrowserClient } from '../../src/clients/playwright-client.js';
test('browser boundary verifies tools, confines navigation, parses results and closes its child', async () => {
  const browser = new BrowserClient({ command: process.execPath, args: [resolve('tests/fixtures/fake-child.mjs')], origins: ['https://example.com'] });
  const controller = new AbortController(); const context = { signal: controller.signal, deadline: performance.now() + 10000, check() { controller.signal.throwIfAborted(); } };
  try {
    const result = await browser.execute({ kind: 'navigate', url: 'https://example.com/a' }, context);
    expect(result).toMatchObject({ url: 'https://example.com/a' }); expect(browser.pid).toBeGreaterThan(0);
    await expect(browser.execute({ kind: 'navigate', url: 'http://127.0.0.1/private' }, context)).rejects.toThrow('INVALID_SOURCE_URL');
  } finally { await browser.close(); }
  expect(browser.pid).toBeNull();
});
