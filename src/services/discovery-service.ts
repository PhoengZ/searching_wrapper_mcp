import { z } from 'zod';
import type { Adapter, RunContext } from '../adapters/adapter.js';
import type { Config } from '../config.js';
import { AppError } from '../domain/errors.js';
import type { Job } from '../domain/types.js';
import type { JobEngine } from '../jobs/engine.js';
import { schemas } from '../schemas/tools.js';
import { authorize, canonicalizeSource } from '../sources/url-policy.js';
import type { Store } from '../storage/store.js';
const candidateSchema = z.object({ name: z.string().trim().min(1).max(200), canonical_url: z.string().max(2048), platform_id: z.string().max(200).nullable(), description: z.string().max(2000).nullable(), source_type: z.literal('page'), limitations: z.array(z.string().max(500)).max(20) });
export class DiscoveryService {
  constructor(private store: Store, private config: Config, private engine: JobEngine, private adapter: Adapter) { engine.register('discovery', (job, context) => this.discover(job, context)); }
  startDiscovery(raw: unknown) {
    const input = schemas.discover_sources.parse(raw); authorize('', this.config, true);
    if (input.max_candidates > this.config.limits.max_candidates || input.max_duration_seconds > this.config.limits.max_discovery_seconds) throw new AppError('LIMIT_EXCEEDED');
    return this.engine.submit('discovery', input);
  }
  private async discover(job: Job, context: RunContext): Promise<string> {
    const input = schemas.discover_sources.parse(job.input); const seen = new Set<string>();
    for await (const raw of this.adapter.discover(input, context)) {
      context.check(); const candidate = candidateSchema.parse(raw); candidate.canonical_url = canonicalizeSource(candidate.canonical_url, 'page', this.config.mode);
      if (seen.has(candidate.canonical_url)) { job.counts.duplicates++; continue; } seen.add(candidate.canonical_url);
      this.store.addCandidate(job.job_id, candidate); job.counts.candidates++; this.store.patchJob(job.job_id, { counts: job.counts });
      if (job.counts.candidates >= input.max_candidates) return 'limit_reached';
    }
    return 'no_more_results';
  }
}
