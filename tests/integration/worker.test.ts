import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../../src/storage/store.js';
import { JobEngine } from '../../src/jobs/engine.js';
test('queued admission, serial execution, cancellation and deadline states', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-worker-')); const store = new Store(directory); const engine = new JobEngine(store, 20);
  let concurrent = 0; let peak = 0;
  engine.register('search', async (_job, context) => { concurrent++; peak = Math.max(peak, concurrent); try { await delay(40, undefined, { signal: context.signal }); context.check(); return 'no_more_results'; } finally { concurrent--; } });
  try {
    const first = engine.submit('search', { max_duration_seconds: 3 }); const second = engine.submit('search', { max_duration_seconds: 3 });
    expect(first.status).toBe('queued'); expect(second.status).toBe('queued');
    await engine.idle(); expect(peak).toBe(1); expect(store.job(first.job_id).status).toBe('completed');
    const next = engine.submit('search', { max_duration_seconds: 3 }); engine.cancel(next.job_id); await engine.idle();
    expect(store.job(next.job_id).status).toBe('cancelled');
    const timed = engine.submit('search', { max_duration_seconds: 0.001 }); await engine.idle();
    expect(store.job(timed.job_id)).toMatchObject({ status: 'partial', stop_reason: 'time_limit' });
  } finally { await engine.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
