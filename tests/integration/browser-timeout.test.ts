import { test, expect } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserClient } from '../../src/clients/playwright-client.js';
import { Store } from '../../src/storage/store.js';
import { JobEngine } from '../../src/jobs/engine.js';

test('a timed-out noncooperative child is terminated before the next queued job', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-timeout-')); const store = new Store(directory);
  const browser = new BrowserClient({ command: process.execPath, args: [resolve('tests/fixtures/noncooperative-child.mjs'), 'action', join(directory, 'marker')], origins: ['https://example.com'] });
  const engine = new JobEngine(store, 20, () => browser.close()); const pids: (number | null)[] = []; const states: unknown[] = [];
  engine.register('search', async (_job, context) => { try { states.push(await browser.execute({ kind: 'navigate', url: 'https://example.com/' }, context)); return 'no_more_results'; } finally { pids.push(browser.pid); } });
  try {
    const first = engine.submit('search', { max_duration_seconds: 25 }); const next = engine.submit('search', { max_duration_seconds: 25 });
    await engine.idle();
    expect(store.job(first.job_id)).toMatchObject({ status: 'failed', stop_reason: 'browser_action_timeout' });
    expect(store.job(next.job_id).status).toBe('completed'); expect(states).toEqual([{ url: 'https://example.com/', title: 'busy=false' }]);
    expect(pids[0]).not.toBe(pids[1]);
  } finally { await engine.close(); await browser.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
}, 30000);

test.each([true, false])('closing during tools/list terminates the child promptly (job cancellation=%s)', async cancel => {
  const directory = mkdtempSync(join(tmpdir(), 'research-discovery-stall-')); const marker = join(directory, 'marker');
  const browser = new BrowserClient({ command: process.execPath, args: [resolve('tests/fixtures/noncooperative-child.mjs'), 'discovery', marker], origins: ['https://example.com'] });
  const controller = new AbortController(); const context = { signal: controller.signal, deadline: performance.now() + 25000, check() { controller.signal.throwIfAborted(); } };
  const operation = browser.execute({ kind: 'navigate', url: 'https://example.com/' }, context).catch(error => error);
  let closing: Promise<void> | undefined; let pid: number | null = null;
  try {
    const until = performance.now() + 4000; while (!existsSync(marker) && performance.now() < until) await delay(20);
    expect(existsSync(marker)).toBe(true); pid = browser.pid; if (cancel) controller.abort(new Error('cancelled'));
    closing = browser.close();
    await Promise.race([closing, delay(1200).then(() => { throw new Error('CLOSE_STALLED_DURING_DISCOVERY'); })]);
    expect(browser.pid).toBeNull(); expect(await operation).toBeInstanceOf(Error);
    expect(() => process.kill(pid!, 0)).toThrow();
  } finally {
    if (pid && browser.pid === pid) try { process.kill(pid, 'SIGKILL'); } catch {}
    await closing; await operation; await browser.close(); rmSync(directory, { recursive: true, force: true });
  }
});
