import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../../src/config.js';
import { Store } from '../../src/storage/store.js';
import { SourceService } from '../../src/services/source-service.js';
import { JobEngine } from '../../src/jobs/engine.js';
import { MockAdapter } from '../../src/adapters/mock-adapter.js';
import { ResearchService } from '../../src/services/research-service.js';
test('bounded post search acknowledges before work, persists evidence, resumes and rejects changed source', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-search-')); const config = readConfig({ WRAPPER_MODE: 'mock', WRAPPER_DATA_DIR: directory }); const store = new Store(directory); const adapter = new MockAdapter(); const engine = new JobEngine(store, 20); const sources = new SourceService(store, config); const research = new ResearchService(store, config, engine, adapter);
  try {
    const source = sources.registerSource({ url: 'https://example.com/pages/demo', source_type: 'page', name: 'Demo' });
    const before = performance.now(); const ack = research.startSearch({ source_id: source.source_id, keywords: ['DCA'], max_posts: 2 });
    expect(ack.status).toBe('queued'); expect(performance.now() - before).toBeLessThan(1000); expect(adapter.calls.search).toBe(0);
    await engine.idle(); expect(store.evidence(ack.job_id)).toHaveLength(2); expect(store.job(ack.job_id).counts.posts_examined).toBe(2); expect(adapter.calls.comments).toBe(0);
    const next = research.startSearch({ source_id: source.source_id, keywords: ['DCA'], max_posts: 2, resume_from_job_id: ack.job_id }); await engine.idle();
    expect(store.evidence(next.job_id).every(row => row.seen_before)).toBe(true);
    sources.registerSource({ source_id: source.source_id, url: 'https://example.com/other', source_type: 'page', name: 'Other' });
    expect(() => research.startSearch({ source_id: source.source_id, keywords: ['DCA'], resume_from_job_id: ack.job_id })).toThrow('SOURCE_IDENTITY_CHANGED');
  } finally { await engine.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
