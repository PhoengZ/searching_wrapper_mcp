import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../src/storage/store.js';
test('durable jobs, immutable observations, dedup, rollback and runtime ownership', () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-store-'));
  let store = new Store(directory);
  try {
    expect(() => new Store(directory)).toThrow('PROFILE_IN_USE');
    const job = store.createJob('search', { source_id: 's' });
    store.patchJob(job.job_id, { status: 'running' });
    const input = { platform: 'mock', source_id: 's', record_type: 'post' as const, platform_id: 'p', url: 'https://example.com/p', parent_id: null, text: 'คำถาม DCA', published_at: null, published_at_raw: null, matched_keywords: ['DCA'], limitations: [] };
    const first = store.observe(job.job_id, input);
    store.observe(job.job_id, input);
    expect(store.evidence(job.job_id)).toHaveLength(1);
    const next = store.createJob('search', {}); store.patchJob(next.job_id, { status: 'running' });
    const again = store.observe(next.job_id, { ...input, text: 'new text' });
    expect(again.record_id).toBe(first.record_id); expect(again.seen_before).toBe(true);
    expect(store.evidence(job.job_id)[0]?.text).toBe('คำถาม DCA');
    store.patchJob(job.job_id, { status: 'completed' });
    expect(() => store.observe(job.job_id, { ...input, platform_id: 'late' })).toThrow('JOB_NOT_RUNNING');
    expect(() => store.transaction(() => { store.createJob('search', {}); throw new Error('rollback'); })).toThrow('rollback');
    expect(store.listJobs()).toHaveLength(2);
    store.close(); store = new Store(directory);
    expect(store.evidence(job.job_id)[0]?.text).toBe('คำถาม DCA');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
