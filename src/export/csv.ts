import type { Evidence } from '../domain/types.js';
export const columns = ['record_id', 'job_id', 'platform', 'source_id', 'record_type', 'platform_id', 'url', 'post_record_id', 'parent_id', 'text', 'published_at', 'published_at_raw', 'collected_at', 'matched_keywords', 'dedup_method', 'seen_before', 'date_status', 'evidence_level', 'comment_sort', 'text_truncated', 'limitations'] as const;
export function escapeCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[\t\r]/.test(text) || /^\s*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function toCsv(rows: Evidence[]): string { return '\uFEFF' + [columns.map(escapeCell).join(','), ...rows.map(row => columns.map(column => escapeCell(row[column])).join(','))].join('\r\n') + '\r\n'; }
