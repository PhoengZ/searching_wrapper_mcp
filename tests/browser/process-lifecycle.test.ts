import { test, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserClient } from '../../src/clients/playwright-client.js';
import { browserOptions } from '../../src/clients/browser-options.js';
import { readConfig } from '../../src/config.js';
test('real pinned Playwright MCP opens a controlled page and closes its process', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-browser-'));
  const server = createServer((_request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<!doctype html><html><head><title>Controlled research fixture</title></head><body><main><h1>ข้อมูลสังเคราะห์</h1></main></body></html>'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  const options = browserOptions(readConfig({ WRAPPER_DATA_DIR: directory, WRAPPER_HEADLESS: 'true' })); options.origins = [origin];
  const browser = new BrowserClient(options); const controller = new AbortController(); const context = { signal: controller.signal, deadline: performance.now() + 25000, check() { controller.signal.throwIfAborted(); } };
  let pid: number | null = null;
  try { expect(await browser.execute({ kind: 'navigate', url: origin }, context)).toMatchObject({ title: 'Controlled research fixture', url: `${origin}/` }); pid = browser.pid; expect(pid).toBeGreaterThan(0); }
  finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, { recursive: true, force: true }); }
  expect(browser.pid).toBeNull(); if (pid) expect(() => process.kill(pid!, 0)).toThrow();
});
