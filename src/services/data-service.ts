import { randomUUID } from 'node:crypto';
import { writeFile, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from '../config.js';
import { AppError } from '../domain/errors.js';
import { terminal, type ExportManifest } from '../domain/types.js';
import { toCsv } from '../export/csv.js';
import { ownedRoot, safeFilename, assertOwnedFile } from '../export/paths.js';
import { schemas } from '../schemas/tools.js';
import type { Store } from '../storage/store.js';
export class DataService {
  private locks = new Map<string, Promise<void>>();
  private stopped = false;
  constructor(private store: Store, private config: Config) {}
  private async exclusive<T>(jobId: string, action: () => Promise<T>): Promise<T> {
    if (this.stopped) throw new AppError('RUNTIME_UNAVAILABLE');
    const previous = this.locks.get(jobId); let release!: () => void;
    const owned = new Promise<void>(resolve => { release = resolve; }); this.locks.set(jobId, owned);
    try { await previous; return await action(); } finally { release(); if (this.locks.get(jobId) === owned) this.locks.delete(jobId); }
  }
  async exportResults(raw: unknown): Promise<ExportManifest> {
    const input = schemas.export_results.parse(raw);
    return this.exclusive(input.job_id, async () => {
      const job = this.store.job(input.job_id);
      if (!terminal(job.status)) throw new AppError('JOB_NOT_TERMINAL');
      if (job.kind === 'discovery') throw new AppError('UNSUPPORTED_EXPORT_KIND');
      if (job.cleanup_pending) throw new AppError('CLEANUP_INCOMPLETE');
      const filename = safeFilename(input.filename ?? `${job.job_id}-${randomUUID()}.${input.format}`, input.format);
      const root = await ownedRoot(this.config.exportDir); const final = join(root, filename); const temporary = join(root, `.tmp-${randomUUID()}`);
      const items = this.store.evidence(job.job_id); const { _posts: _internal, ...requested } = job.input;
      const output = input.format === 'csv' ? toCsv(items) : JSON.stringify({ job_id: job.job_id, status: job.status, source: job.source, requested_filters: requested, effective_filters: job.effective_filters, counts: job.counts, limitations: job.limitations, stop_reason: job.stop_reason, data_source: this.config.mode === 'mock' ? 'synthetic' : 'observed', items }, null, 2);
      let linked = false;
      try {
        await writeFile(temporary, output, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        await link(temporary, final); linked = true;
        const manifest: ExportManifest = { export_id: randomUUID(), job_id: job.job_id, path: final, format: input.format, row_count: items.length, limitations: job.limitations };
        this.store.saveExport(manifest); return manifest;
      } catch (error) {
        if (linked) await unlink(final).catch(() => {});
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new AppError('EXPORT_EXISTS');
        throw error;
      } finally { await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('EXPORT_TEMP_CLEANUP_FAILED'); }); }
    });
  }
  async deleteJob(jobId: string) {
    return this.exclusive(jobId, async () => {
      let job;
      try { job = this.store.job(jobId); } catch (error) { if (error instanceof AppError && error.code === 'JOB_NOT_FOUND') return { job_id: jobId, deleted: false, deleted_exports: 0 }; throw error; }
      if (!terminal(job.status)) throw new AppError('JOB_NOT_TERMINAL');
      this.store.patchJob(jobId, { cleanup_pending: true }); const files = this.store.exports(jobId);
      try {
        for (const file of files) { await assertOwnedFile(file.path, this.config.exportDir); await unlink(file.path).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }); }
        this.store.deleteData(jobId); return { job_id: jobId, deleted: true, deleted_exports: files.length };
      } catch { throw new AppError('CLEANUP_INCOMPLETE'); }
    });
  }
  async sweep(now = Date.now()) {
    let deleted = 0; let failed = 0;
    for (const job of this.store.listJobs()) if (terminal(job.status) && (job.cleanup_pending || (this.config.retention_days > 0 && now - Date.parse(job.finished_at!) >= this.config.retention_days * 86400000))) {
      try { if ((await this.deleteJob(job.job_id)).deleted) deleted++; } catch { failed++; }
    }
    return { deleted, failed };
  }
  async close(): Promise<void> { this.stopped = true; await Promise.all(this.locks.values()); }
}
