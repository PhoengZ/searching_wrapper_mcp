import { test, expect } from 'vitest';
import { createRuntime } from '../../src/runtime.js';
import { readConfig } from '../../src/config.js';
test('authorized live discovery and bounded collection (explicit opt-in)', async () => {
  if (!process.env.WRAPPER_LIVE_QUERY || !process.env.WRAPPER_CONFIG_FILE || !process.env.WRAPPER_DATA_DIR) throw new Error('LIVE_PREREQUISITES_REQUIRED: set WRAPPER_LIVE_QUERY, WRAPPER_CONFIG_FILE and a dedicated WRAPPER_DATA_DIR; login manually in that profile. No live access was attempted.');
  const config = readConfig(); if (config.mode !== 'facebook') throw new Error('LIVE_MODE_REQUIRED');
  const runtime = await createRuntime(config); const ownedJobs: string[] = [];
  try {
    const discovery = runtime.discovery.startDiscovery({ query: process.env.WRAPPER_LIVE_QUERY, max_candidates: 2, max_duration_seconds: 30 }); ownedJobs.push(discovery.job_id); await runtime.engine.idle();
    const candidate = runtime.store.candidates(discovery.job_id)[0]; expect(candidate, `Discovery status: ${runtime.store.job(discovery.job_id).status}`).toBeTruthy();
    // A deterministic test harness selects the first observed candidate. Host LLM selection is a separate manual acceptance check.
    const source = runtime.sources.registerSource({ candidate_id: candidate!.candidate_id, source_type: 'page' });
    const job = runtime.research.startSearch({ source_id: source.source_id, keywords: [process.env.WRAPPER_LIVE_KEYWORD ?? 'DCA'], max_posts: 3, max_duration_seconds: 60 }); ownedJobs.push(job.job_id); await runtime.engine.idle();
    expect(runtime.store.job(job.job_id).status).toBe('completed'); expect(runtime.store.evidence(job.job_id).length).toBeGreaterThan(0);
    const exported = await runtime.data.exportResults({ job_id: job.job_id, format: 'json' }); expect(exported.row_count).toBeGreaterThan(0);
  } finally { for (const id of ownedJobs.reverse()) { const job = runtime.store.job(id); if (job.status === 'running' || job.status === 'queued') runtime.engine.cancel(id); await runtime.engine.idle(); await runtime.data.deleteJob(id); } await runtime.close(); }
});
