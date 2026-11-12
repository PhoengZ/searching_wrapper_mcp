import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../src/storage/store.js';
import { readConfig } from '../../src/config.js';
import { DataService } from '../../src/services/data-service.js';
test('deleting one job preserves shared observations and retention ignores active work', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-delete-')); const store = new Store(directory); const config = readConfig({ WRAPPER_MODE: 'mock', WRAPPER_DATA_DIR: directory }); const data = new DataService(store, config);
  try {
    const input = { platform: 'mock', source_id: 's', record_type: 'post' as const, platform_id: 'p', url: 'https://example.com/p', parent_id: null, text: 'DCA', published_at: null, published_at_raw: null, matched_keywords: [], limitations: [] };
    const first = store.createJob('search', {}); store.patchJob(first.job_id, { status: 'running' }); store.observe(first.job_id, input); store.patchJob(first.job_id, { status: 'completed' });
    const next = store.createJob('search', {}); store.patchJob(next.job_id, { status: 'running' }); store.observe(next.job_id, input); store.patchJob(next.job_id, { status: 'completed', finished_at: '2020-01-01T00:00:00Z' });
    expect((await data.deleteJob(first.job_id)).deleted).toBe(true); expect(store.evidence(next.job_id)).toHaveLength(1); expect((await data.deleteJob(first.job_id)).deleted).toBe(false);
    const active = store.createJob('search', {}); await expect(data.deleteJob(active.job_id)).rejects.toThrow('JOB_NOT_TERMINAL');
    expect((await data.sweep()).deleted).toBe(1); expect(store.job(active.job_id).status).toBe('queued');
  } finally { await data.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
