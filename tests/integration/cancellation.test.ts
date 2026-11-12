import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../../src/runtime.js';
import { readConfig } from '../../src/config.js';
import { MockAdapter } from '../../src/adapters/mock-adapter.js';
test('running cancellation is idempotent and login gate does not replay queued work', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-cancel-')); const adapter = new MockAdapter({ delayMs: 1000 }); const runtime = await createRuntime(readConfig({ WRAPPER_MODE: 'mock', WRAPPER_DATA_DIR: directory }), { adapter });
  try {
    const source = runtime.sources.registerSource({ url: 'https://example.com/pages/demo', source_type: 'page', name: 'Demo' }); const request = { source_id: source.source_id, keywords: ['DCA'] };
    const job = runtime.research.startSearch(request); await new Promise<void>(resolve => setImmediate(resolve));
    expect(runtime.store.job(job.job_id).status).toBe('running'); runtime.engine.cancel(job.job_id); runtime.engine.cancel(job.job_id); await runtime.engine.idle();
    expect(runtime.store.job(job.job_id).status).toBe('cancelled'); expect(runtime.store.evidence(job.job_id)).toEqual([]);
    adapter.options.delayMs = 0; adapter.options.error = 'login_required'; const first = runtime.research.startSearch(request); const second = runtime.research.startSearch(request); await runtime.engine.idle();
    expect(runtime.store.job(first.job_id).status).toBe('needs_login'); expect(runtime.store.job(second.job_id).status).toBe('needs_login'); const calls = adapter.calls.search;
    runtime.query.getJob({ job_id: second.job_id }); expect(adapter.calls.search).toBe(calls);
    adapter.options.error = undefined; const afterLogin = runtime.research.startSearch(request); await runtime.engine.idle(); expect(runtime.store.job(afterLogin.job_id).status).toBe('completed');
    expect(runtime.store.job(second.job_id).status).toBe('needs_login');
  } finally { await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});
