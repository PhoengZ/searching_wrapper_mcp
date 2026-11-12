import { z } from 'zod';
export const id = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(200);
const positive = (ceiling: number, fallback: number) => z.number().int().min(1).max(ceiling).default(fallback);
const paging = { cursor: z.string().max(2000).optional(), page_size: positive(100, 20) };
const duration = positive(600, 180);
export const sourceType = z.enum(['page', 'group', 'profile', 'post']);
export const statusSchema = z.enum(['queued', 'running', 'needs_login', 'completed', 'partial', 'failed', 'cancelled']);
const search = z.object({
  source_id: id, keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  match_mode: z.enum(['any', 'all', 'phrase']).default('any'),
  date_from: z.iso.date().optional(), date_to: z.iso.date().optional(),
  timezone: z.string().max(100).default('Asia/Bangkok').refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }),
  max_posts: positive(100, 30), include_comments: z.boolean().default(false),
  max_comments_per_post: z.number().int().min(0).max(100).optional(), max_total_comments: z.number().int().min(0).max(1000).optional(),
  max_duration_seconds: duration, resume_from_job_id: id.nullable().optional(),
}).strict().superRefine((input, context) => {
  if (input.date_from && input.date_to && input.date_from > input.date_to) context.addIssue({ code: 'custom', message: 'Reversed date range' });
  if (input.match_mode === 'phrase' && input.keywords.length !== 1) context.addIssue({ code: 'custom', message: 'Phrase requires exactly one keyword' });
  if (!input.include_comments && ((input.max_comments_per_post ?? 0) > 0 || (input.max_total_comments ?? 0) > 0)) context.addIssue({ code: 'custom', message: 'Comments not requested' });
});
export const schemas = {
  discover_sources: z.object({ query: text, platform: z.literal('facebook').default('facebook'), max_candidates: positive(10, 5), max_duration_seconds: positive(120, 30) }).strict(),
  register_source: z.object({ source_id: id.optional(), name: text.optional(), source_type: sourceType, candidate_id: id.optional(), url: z.string().max(2048).optional() }).strict().refine(input => Boolean(input.candidate_id) !== Boolean(input.url), 'Supply candidate_id or url, exclusively'),
  list_sources: z.object(paging).strict(), start_search: search,
  get_job: z.object({ job_id: id, ...paging }).strict(),
  read_comments: z.object({ source_id: id, post_record_ids: z.array(id).min(1).max(30), sort: z.enum(['newest', 'relevant']).optional(), max_comments_per_post: positive(100, 20), max_total_comments: positive(1000, 300), max_duration_seconds: duration }).strict(),
  cancel_job: z.object({ job_id: id }).strict(),
  export_results: z.object({ job_id: id, format: z.enum(['json', 'csv']), filename: z.string().min(1).max(150).optional() }).strict(),
  delete_job: z.object({ job_id: id }).strict(),
};
export type ToolName = keyof typeof schemas;
export type SearchInput = z.infer<typeof search>;
export type DiscoveryInput = z.infer<typeof schemas.discover_sources>;
export type CommentsInput = z.infer<typeof schemas.read_comments>;
