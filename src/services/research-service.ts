import type { Config } from '../config.js';
import type { Adapter, PostCandidate, RunContext } from '../adapters/adapter.js';
import { AppError } from '../domain/errors.js';
import type { Job, Source } from '../domain/types.js';
import type { JobEngine } from '../jobs/engine.js';
import { schemas, type SearchInput } from '../schemas/tools.js';
import { authorize } from '../sources/url-policy.js';
import type { Store } from '../storage/store.js';
import { matchText, matchesDate } from './matching.js';
export class ResearchService {
  constructor(private store: Store, private config: Config, private engine: JobEngine, private adapter: Adapter) { engine.register('search', (job, context) => this.search(job, context)); }
  private checkLimits(input: Record<string, unknown>): void {
    for (const field of ['max_posts', 'max_comments_per_post', 'max_total_comments', 'max_duration_seconds'] as const) if (typeof input[field] === 'number' && input[field] > this.config.limits[field]) throw new AppError('LIMIT_EXCEEDED');
  }
  startSearch(raw: unknown) {
    const input = schemas.start_search.parse(raw); this.checkLimits(input);
    if (input.include_comments) throw new AppError('UNSUPPORTED_CAPABILITY');
    const source = this.store.source(input.source_id); authorize(source.canonical_url, this.config);
    if (source.capabilities.search === 'unsupported') throw new AppError('UNSUPPORTED_CAPABILITY');
    if (input.resume_from_job_id) {
      const prior = this.store.job(input.resume_from_job_id);
      if (prior.kind !== 'search' || prior.source?.source_id !== source.source_id) throw new AppError('INVALID_RESUME_JOB');
      if (prior.source.identity !== source.identity) throw new AppError('SOURCE_IDENTITY_CHANGED');
    }
    return this.engine.submit('search', input, source);
  }
  private async probe(source: Source, context: RunContext) {
    context.check(); const capabilities = await this.adapter.probeSource(source, context); context.check();
    const current = this.store.source(source.source_id);
    if (current.version === source.version) this.store.saveSource({ ...current, capabilities, verified_at: new Date().toISOString() });
    return capabilities;
  }
  private save(job: Job, candidate: PostCandidate, matched: string[], context: RunContext) {
    context.check(); if (candidate.source_identity !== job.source!.identity) throw new AppError('source_mismatch');
    const fullText = Array.from(candidate.text); const truncated = fullText.length > this.config.limits.max_text_length;
    const published = candidate.published_at && Number.isFinite(Date.parse(candidate.published_at)) ? new Date(candidate.published_at).toISOString() : null;
    const record = this.store.observe(job.job_id, { ...candidate, platform: job.source!.platform, source_id: job.source!.source_id, parent_id: candidate.parent_id ?? null, published_at: published, text: fullText.slice(0, this.config.limits.max_text_length).join(''), matched_keywords: matched, text_truncated: truncated, limitations: [...candidate.limitations, ...(truncated ? ['text_truncated'] : [])] });
    if (record.seen_before) job.counts.duplicates++; else job.counts.new_records++;
    return record;
  }
  private async search(job: Job, context: RunContext): Promise<string> {
    const input = schemas.start_search.parse(job.input); const source = job.source!;
    const capabilities = await this.probe(source, context);
    if (capabilities.search !== 'supported') throw new AppError('unsupported_ui');
    job.limitations.push(...capabilities.limitations);
    this.store.patchJob(job.job_id, { effective_filters: { keywords: input.keywords, match_mode: input.match_mode, date_from: input.date_from ?? null, date_to: input.date_to ?? null, timezone: input.timezone, local_text: 'enforced', local_dates: 'enforced_when_known', platform_filters: 'adapter_reported', ...{ requested: input } }, limitations: job.limitations });
    const seen = new Set<string>(); let reason = 'no_more_results';
    for await (const candidate of this.adapter.search(source, input, context)) {
      context.check(); if (candidate.source_identity !== source.identity) throw new AppError('source_mismatch');
      const key = candidate.platform_id ?? candidate.url;
      if (seen.has(key)) { job.counts.duplicates++; this.store.patchJob(job.job_id, { counts: job.counts }); continue; }
      seen.add(key); job.counts.posts_examined++;
      const matched = matchText(candidate.text, input.keywords, input.match_mode);
      if (!candidate.published_at || !Number.isFinite(Date.parse(candidate.published_at))) job.counts.unknown_date_count++;
      if (matched.length && matchesDate(candidate.published_at, input)) { this.save(job, candidate, matched, context); job.counts.posts_matched++; job.counts.posts_saved++; }
      this.store.patchJob(job.job_id, { counts: job.counts });
      if (job.counts.posts_examined >= input.max_posts) { reason = 'limit_reached'; break; }
    }
    return reason;
  }
}
