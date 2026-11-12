import type { z } from 'zod';
import type { statusSchema } from '../schemas/tools.js';
export type JobStatus = z.infer<typeof statusSchema>;
export type JobKind = 'discovery' | 'search' | 'comments';
export type Capabilities = { search: 'supported' | 'unsupported' | 'unverified'; comments: 'supported' | 'unsupported' | 'unverified'; sort: ('newest' | 'relevant')[]; limitations: string[] };
export interface Source { source_id: string; name: string; source_type: 'page' | 'group' | 'profile' | 'post'; platform: 'facebook' | 'mock'; canonical_url: string; identity: string; version: number; capabilities: Capabilities; verified_at: string | null }
export interface Candidate { candidate_id: string; job_id: string; name: string; canonical_url: string; platform_id: string | null; description: string | null; source_type: 'page'; collected_at: string; limitations: string[]; sequence?: number }
export interface Counts { posts_examined: number; posts_matched: number; posts_saved: number; comments_examined: number; comments_saved: number; duplicates: number; new_records: number; unknown_date_count: number; candidates: number }
export interface Job { job_id: string; kind: JobKind; status: JobStatus; input: Record<string, unknown>; source: Source | null; created_at: string; started_at: string | null; finished_at: string | null; counts: Counts; limitations: string[]; stop_reason: string | null; effective_filters: Record<string, unknown>; cleanup_pending?: boolean; cancellation_requested: boolean }
export interface EvidenceInput { platform: string; source_id: string; record_type: 'post' | 'comment'; platform_id: string | null; url: string; parent_id: string | null; post_record_id?: string; text: string; published_at: string | null; published_at_raw: string | null; matched_keywords: string[]; limitations: string[]; comment_sort?: string; evidence_level?: 'post' | 'comment'; text_truncated?: boolean }
export interface Evidence extends EvidenceInput { record_id: string; job_id: string; collected_at: string; dedup_method: 'platform_id' | 'url' | 'hash'; seen_before: boolean; date_status: 'known' | 'unknown'; sequence?: number }
export interface ExportManifest { export_id: string; job_id: string; path: string; format: 'json' | 'csv'; row_count: number; limitations: string[] }
export const terminal = (status: JobStatus): boolean => !['queued', 'running'].includes(status);
export const emptyCounts = (): Counts => ({ posts_examined: 0, posts_matched: 0, posts_saved: 0, comments_examined: 0, comments_saved: 0, duplicates: 0, new_records: 0, unknown_date_count: 0, candidates: 0 });
