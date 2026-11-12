import { z } from 'zod';
import { sourceType, statusSchema } from './tools.js';
const nullableText = z.string().nullable();
const limitations = z.array(z.string());
export const sourceOutput = z.object({ source_id: z.string(), name: z.string(), source_type: sourceType, platform: z.enum(['mock', 'facebook']), canonical_url: z.string().url(), identity: z.string(), version: z.number().int().positive(), verified_at: nullableText, capabilities: z.object({ search: z.enum(['supported', 'unsupported', 'unverified']), comments: z.enum(['supported', 'unsupported', 'unverified']), sort: z.array(z.enum(['newest', 'relevant'])), limitations }).strict() }).strict();
export const evidenceInput = z.object({ platform: z.string(), source_id: z.string(), record_type: z.enum(['post', 'comment']), platform_id: nullableText, url: z.string().url().max(2048), parent_id: nullableText, post_record_id: z.string().optional(), text: z.string().refine(text => Array.from(text).length <= 20000), published_at: nullableText, published_at_raw: nullableText, matched_keywords: z.array(z.string()), limitations, comment_sort: z.string().optional(), evidence_level: z.enum(['post', 'comment']).optional(), text_truncated: z.boolean().optional() });
export const evidenceOutput = evidenceInput.extend({ record_id: z.string(), job_id: z.string(), collected_at: z.string(), dedup_method: z.enum(['platform_id', 'url', 'hash']), seen_before: z.boolean(), date_status: z.enum(['known', 'unknown']), sequence: z.number().int().optional() }).strict();
const candidateOutput = z.object({ candidate_id: z.string(), job_id: z.string(), name: z.string(), canonical_url: z.string().url(), platform_id: nullableText, description: nullableText, source_type: z.literal('page'), collected_at: z.string(), limitations, sequence: z.number().int().optional() }).strict();
const kind = z.enum(['discovery', 'search', 'comments']);
const ack = z.object({ job_id: z.string(), kind, status: z.literal('queued'), created_at: z.string() }).strict();
const counts = z.object({ posts_examined: z.number().int().nonnegative(), posts_matched: z.number().int().nonnegative(), posts_saved: z.number().int().nonnegative(), comments_examined: z.number().int().nonnegative(), comments_saved: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative(), new_records: z.number().int().nonnegative(), unknown_date_count: z.number().int().nonnegative(), candidates: z.number().int().nonnegative() }).strict();
const object = z.record(z.string(), z.unknown());
export const outputs = {
  discover_sources: ack, start_search: ack, read_comments: ack,
  register_source: sourceOutput,
  list_sources: z.object({ items: z.array(sourceOutput), next_cursor: nullableText }).strict(),
  get_job: z.object({ job_id: z.string(), kind, status: statusSchema, created_at: z.string(), started_at: nullableText, finished_at: nullableText, counts, requested_filters: object, effective_filters: object, source: sourceOutput.nullable(), limitations, stop_reason: nullableText, cancellation_requested: z.boolean(), cleanup_pending: z.boolean(), items: z.array(z.union([evidenceOutput, candidateOutput])), next_cursor: nullableText }).strict(),
  cancel_job: z.object({ job_id: z.string(), status: statusSchema, cancellation_requested: z.boolean() }).strict(),
  export_results: z.object({ export_id: z.string(), job_id: z.string(), path: z.string(), format: z.enum(['json', 'csv']), row_count: z.number().int().nonnegative(), limitations }).strict(),
  delete_job: z.object({ job_id: z.string(), deleted: z.boolean(), deleted_exports: z.number().int().nonnegative() }).strict(),
};
