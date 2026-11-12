import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../../src/config.js';
import { Store } from '../../src/storage/store.js';
import { JobEngine } from '../../src/jobs/engine.js';
import { MockAdapter } from '../../src/adapters/mock-adapter.js';
import { SourceService } from '../../src/services/source-service.js';
import { DiscoveryService } from '../../src/services/discovery-service.js';
test('runtime query discovers observed candidates for host choice without a predefined page URL', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-discover-')); const store = new Store(directory); const config = readConfig({ WRAPPER_MODE: 'mock', WRAPPER_DATA_DIR: directory }); const engine = new JobEngine(store, 20); const discovery = new DiscoveryService(store, config, engine, new MockAdapter());
  try {
    const ack = discovery.startDiscovery({ query: 'DCA กองทุน' }); expect(ack.status).toBe('queued'); await engine.idle();
    const candidates = store.candidates(ack.job_id); expect(candidates).toHaveLength(1);
    const source = new SourceService(store, config).registerSource({ candidate_id: candidates[0]!.candidate_id, source_type: 'page' });
    expect(source.canonical_url).toBe(candidates[0]!.canonical_url); expect(source.name).toBe(candidates[0]!.name);
  } finally { await engine.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
