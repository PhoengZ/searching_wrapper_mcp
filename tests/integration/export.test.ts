import { test, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime } from '../../src/runtime.js';
import { readConfig } from '../../src/config.js';
import { DataService } from '../../src/services/data-service.js';
test('UTF-8 exports preserve originals, escape formula cells, reject traversal and refuse overwrite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-export-')); const runtime = await createRuntime(readConfig({ WRAPPER_MODE: 'mock', WRAPPER_DATA_DIR: directory })); const data = new DataService(runtime.store, runtime.config);
  try {
    const job = runtime.store.createJob('search', {}); runtime.store.patchJob(job.job_id, { status: 'running' });
    runtime.store.observe(job.job_id, { platform: 'mock', source_id: 's', record_type: 'post', platform_id: '1', url: 'https://example.com/p', parent_id: null, text: '  =1+1', published_at: null, published_at_raw: null, matched_keywords: [], limitations: ['ภาษาไทย, "quote"\nline'] }); runtime.store.patchJob(job.job_id, { status: 'completed' });
    const csv = await data.exportResults({ job_id: job.job_id, format: 'csv', filename: 'evidence.csv' }); expect(csv.row_count).toBe(1);
    const content = readFileSync(csv.path, 'utf8'); expect(content.startsWith('\uFEFF')).toBe(true); expect(content).toContain("'  =1+1"); expect(content).toContain('ภาษาไทย');
    const json = await data.exportResults({ job_id: job.job_id, format: 'json' }); expect(JSON.parse(readFileSync(json.path, 'utf8')).items[0].text).toBe('  =1+1');
    await expect(data.exportResults({ job_id: job.job_id, format: 'csv', filename: '../escape.csv' })).rejects.toThrow('INVALID_EXPORT_FILENAME');
    await expect(data.exportResults({ job_id: job.job_id, format: 'csv', filename: 'evidence.csv' })).rejects.toThrow('EXPORT_EXISTS');
  } finally { await data.close(); await runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});
