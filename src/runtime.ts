import { readConfig, type Config } from './config.js';
import { Store } from './storage/store.js';
import { JobEngine } from './jobs/engine.js';
import { SourceService } from './services/source-service.js';
import { ResearchService } from './services/research-service.js';
import { JobQueryService } from './services/job-query-service.js';
import type { Adapter } from './adapters/adapter.js';
import { MockAdapter } from './adapters/mock-adapter.js';
import { DataService } from './services/data-service.js';
import { DiscoveryService } from './services/discovery-service.js';
import { FacebookPageAdapter } from './adapters/facebook/page-adapter.js';
import { BrowserClient } from './clients/playwright-client.js';
import { browserOptions } from './clients/browser-options.js';
export async function createRuntime(config: Config = readConfig(), overrides: { adapter?: Adapter } = {}) {
  const store = new Store(config.dataDir); store.recover();
  const adapter: Adapter = overrides.adapter ?? (config.mode === 'mock' ? new MockAdapter() : new FacebookPageAdapter(new BrowserClient(browserOptions(config))));
  const engine = new JobEngine(store, config.limits.max_queue, () => adapter.close());
  const sources = new SourceService(store, config); const research = new ResearchService(store, config, engine, adapter); const query = new JobQueryService(store);
  const data = new DataService(store, config); await data.sweep();
  const discovery = new DiscoveryService(store, config, engine, adapter);
  const retentionTimer = setInterval(() => { void data.sweep().catch(() => console.error('RETENTION_FAILED')); }, 3600000); retentionTimer.unref();
  let closed = false;
  return { config, store, engine, sources, research, query, data, discovery,
    async close() { if (closed) return; closed = true; clearInterval(retentionTimer); await engine.close(); await data.close(); await adapter.close(); store.close(); },
  };
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>;
