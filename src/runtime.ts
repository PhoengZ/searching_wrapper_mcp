import { readConfig, type Config } from './config.js';
import { Store } from './storage/store.js';
import { JobEngine } from './jobs/engine.js';
import { SourceService } from './services/source-service.js';
import { ResearchService } from './services/research-service.js';
import { JobQueryService } from './services/job-query-service.js';
import type { Adapter } from './adapters/adapter.js';
import { MockAdapter } from './adapters/mock-adapter.js';
import { AppError } from './domain/errors.js';
export async function createRuntime(config: Config = readConfig(), overrides: { adapter?: Adapter } = {}) {
  const store = new Store(config.dataDir); store.recover();
  const adapter: Adapter = overrides.adapter ?? (config.mode === 'mock' ? new MockAdapter() : {
    async probeSource() { throw new AppError('DEPENDENCY_UNAVAILABLE'); }, async *discover() { throw new AppError('DEPENDENCY_UNAVAILABLE'); }, async *search() { throw new AppError('DEPENDENCY_UNAVAILABLE'); }, async *comments() { throw new AppError('DEPENDENCY_UNAVAILABLE'); }, async close() {},
  });
  const engine = new JobEngine(store, config.limits.max_queue, () => adapter.close());
  const sources = new SourceService(store, config); const research = new ResearchService(store, config, engine, adapter); const query = new JobQueryService(store);
  let closed = false;
  return { config, store, engine, sources, research, query,
    async close() { if (closed) return; closed = true; await engine.close(); await adapter.close(); store.close(); },
  };
}
export type Runtime = Awaited<ReturnType<typeof createRuntime>>;
