import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../src/storage/store.js';
import { JobQueryService } from '../../src/services/job-query-service.js';
test('polling is local and snapshot cursors prevent new inserts corrupting continuation pages', () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-query-')); const store = new Store(directory); const query = new JobQueryService(store);
  try {
    const job = store.createJob('discovery', {}); store.patchJob(job.job_id, { status: 'running' });
    const add = (name: string) => store.addCandidate(job.job_id, { name, canonical_url: `https://example.com/${name}`, platform_id: name, description: null, source_type: 'page', limitations: [] });
    add('one'); add('two'); const page = query.getJob({ job_id: job.job_id, page_size: 1 });
    expect(page.items).toHaveLength(1); expect(page.next_cursor).toBeTruthy(); add('three');
    const next = query.getJob({ job_id: job.job_id, cursor: page.next_cursor, page_size: 1 });
    expect(next.items).toHaveLength(1); expect(next.next_cursor).toBeNull(); expect(next.items[0]).toMatchObject({ name: 'two' });
    for (let index = 0; index < 50; index++) query.getJob({ job_id: job.job_id });
    expect(store.listJobs()).toHaveLength(1); expect(store.job(job.job_id).status).toBe('running');
    const other = store.createJob('discovery', {}); expect(() => query.getJob({ job_id: other.job_id, cursor: page.next_cursor })).toThrow('INVALID_CURSOR');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
