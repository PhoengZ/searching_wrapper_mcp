import { z } from 'zod';
import { AppError } from '../domain/errors.js';
import type { Candidate, Evidence } from '../domain/types.js';
import { schemas } from '../schemas/tools.js';
import type { Store } from '../storage/store.js';
const cursorSchema = z.object({ job_id: z.string(), kind: z.enum(['search', 'comments', 'discovery']), last: z.number().int().nonnegative(), upper: z.number().int().nonnegative() }).strict();
export class JobQueryService {
  constructor(private store: Store) {}
  getJob(raw: unknown) {
    const input = schemas.get_job.parse(raw); const job = this.store.job(input.job_id);
    let upper = this.store.resultUpper(job.job_id, job.kind); let last = 0;
    if (input.cursor) {
      try {
        const cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')));
        if (cursor.job_id !== job.job_id || cursor.kind !== job.kind || cursor.upper > upper || cursor.last > cursor.upper) throw new Error();
        upper = cursor.upper; last = cursor.last;
      } catch { throw new AppError('INVALID_CURSOR'); }
    }
    const rows = this.store.resultPage(job.job_id, job.kind, last, upper, input.page_size + 1);
    const items: (Candidate | Evidence)[] = []; let bytes = 2;
    for (const row of rows.slice(0, input.page_size)) {
      const size = Buffer.byteLength(JSON.stringify(row), 'utf8') + 1;
      if (bytes + size > 256 * 1024) { if (!items.length) throw new AppError('ITEM_TOO_LARGE'); break; }
      items.push(row); bytes += size;
    }
    const hasMore = items.length < rows.length;
    const next_cursor = hasMore ? Buffer.from(JSON.stringify({ job_id: job.job_id, kind: job.kind, last: items.at(-1)!.sequence, upper })).toString('base64url') : null;
    const { _posts: _privatePosts, ...requested } = job.input;
    return { job_id: job.job_id, kind: job.kind, status: job.status, created_at: job.created_at, started_at: job.started_at, finished_at: job.finished_at, counts: job.counts, requested_filters: requested, effective_filters: job.effective_filters, source: job.source, limitations: job.limitations, stop_reason: job.stop_reason, cancellation_requested: job.cancellation_requested, cleanup_pending: job.cleanup_pending ?? false, items, next_cursor };
  }
}
