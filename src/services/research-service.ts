import type { Config } from '../config.js';
import type { Adapter, PostCandidate, RunContext } from '../adapters/adapter.js';
import { AppError } from '../domain/errors.js';
import type { Job, Source } from '../domain/types.js';
import type { JobEngine } from '../jobs/engine.js';
import { schemas, type CommentsInput } from '../schemas/tools.js';
import { authorize } from '../sources/url-policy.js';
import type { Store } from '../storage/store.js';
import { matchText, matchesDate } from './matching.js';
import { evidenceInput } from '../schemas/output.js';
export class ResearchService {
  constructor(private store: Store, private config: Config, private engine: JobEngine, private adapter: Adapter) {
    engine.register('search', (job, context) => this.search(job, context));
    engine.register('comments', (job, context) => this.comments(job, context));
  }
  startComments(raw: unknown) {
    const input = schemas.read_comments.parse(raw); this.checkLimits(input);
    const source = this.store.source(input.source_id); authorize(source.canonical_url, this.config);
    if (source.capabilities.comments === 'unsupported') throw new AppError('UNSUPPORTED_CAPABILITY');
    const posts = [...new Set(input.post_record_ids)].map(id => {
      const record = this.store.record(id);
      if (record.record_type !== 'post' || record.source_id !== source.source_id) throw new AppError('INVALID_POST_SELECTION');
      if (this.store.job(record.job_id).source?.identity !== source.identity) throw new AppError('SOURCE_IDENTITY_CHANGED');
      return { record_id: record.record_id, url: record.url };
    });
    return this.engine.submit('comments', { ...input, _posts: posts }, source);
  }
  private checkLimits(input: Record<string, unknown>): void {
    for (const field of ['max_posts', 'max_comments_per_post', 'max_total_comments', 'max_duration_seconds'] as const) if (typeof input[field] === 'number' && input[field] > this.config.limits[field]) throw new AppError('LIMIT_EXCEEDED');
  }
  startSearch(raw: unknown) {
    const input = schemas.start_search.parse(raw);
    if (input.include_comments) { input.max_comments_per_post ??= Math.min(20, this.config.limits.max_comments_per_post); input.max_total_comments ??= Math.min(300, this.config.limits.max_total_comments); }
    this.checkLimits(input);
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
    const { source_identity: _identity, ...observed } = candidate;
    const record = this.store.observe(job.job_id, evidenceInput.parse({ ...observed, platform: job.source!.platform, source_id: job.source!.source_id, parent_id: candidate.parent_id ?? null, published_at: published, text: fullText.slice(0, this.config.limits.max_text_length).join(''), matched_keywords: matched, text_truncated: truncated, limitations: [...candidate.limitations, ...(truncated ? ['text_truncated'] : [])] }));
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
      if (matched.length && matchesDate(candidate.published_at, input)) {
        const post = this.save(job, candidate, matched, context); job.counts.posts_matched++; job.counts.posts_saved++;
        this.store.patchJob(job.job_id, { counts: job.counts });
        if (input.include_comments) {
          if (capabilities.comments === 'unsupported') throw new AppError('unsupported_ui');
          const commentInput = schemas.read_comments.parse({ source_id: source.source_id, post_record_ids: [post.record_id], max_comments_per_post: input.max_comments_per_post ?? 20, max_total_comments: input.max_total_comments ?? 300, max_duration_seconds: input.max_duration_seconds });
          await this.collectComments(job, post, commentInput, context);
        }
      }
      this.store.patchJob(job.job_id, { counts: job.counts });
      if (job.counts.posts_examined >= input.max_posts) { reason = 'limit_reached'; break; }
    }
    return reason;
  }
  private async comments(job: Job, context: RunContext): Promise<string> {
    const { _posts, ...request } = job.input; const input = schemas.read_comments.parse(request);
    const caps = await this.probe(job.source!, context); if (caps.comments === 'unsupported') throw new AppError('unsupported_ui');
    job.limitations.push(...caps.limitations); this.store.patchJob(job.job_id, { limitations: job.limitations, effective_filters: { requested_sort: input.sort ?? null, observed_sort: 'adapter_reported', ...{ requested: request } } });
    for (const post of _posts as { record_id: string; url: string }[]) {
      if (job.counts.comments_examined >= input.max_total_comments) return 'limit_reached';
      await this.collectComments(job, post, input, context);
    }
    return job.counts.comments_examined >= input.max_total_comments ? 'limit_reached' : 'no_more_results';
  }
  private async collectComments(job: Job, post: { record_id: string; url: string }, input: CommentsInput, context: RunContext): Promise<void> {
    if (!input.max_comments_per_post || job.counts.comments_examined >= input.max_total_comments) return;
    let perPost = 0; const seen = new Set<string>(); const parents = new Map<string, string>();
    for await (const candidate of this.adapter.comments(job.source!, post, input, context)) {
      context.check(); if (candidate.source_identity !== job.source!.identity) throw new AppError('source_mismatch');
      const key = candidate.platform_id ?? `${candidate.text}\u0000${candidate.published_at_raw}\u0000${candidate.parent_id}`;
      if (seen.has(key)) { job.counts.duplicates++; continue; } seen.add(key);
      perPost++; job.counts.comments_examined++;
      const parent = candidate.parent_id ? parents.get(candidate.parent_id) ?? null : null;
      const record = this.save(job, { ...candidate, record_type: 'comment', post_record_id: post.record_id, parent_id: parent, evidence_level: candidate.evidence_level ?? 'post', comment_sort: candidate.comment_sort ?? 'unknown', limitations: [...candidate.limitations, ...(!parent && candidate.parent_id ? ['parent_relationship_unknown'] : [])] }, [], context);
      if (candidate.platform_id) parents.set(candidate.platform_id, record.record_id);
      job.counts.comments_saved++; this.store.patchJob(job.job_id, { counts: job.counts });
      if (perPost >= input.max_comments_per_post || job.counts.comments_examined >= input.max_total_comments) break;
    }
  }
}
