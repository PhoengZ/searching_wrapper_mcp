import type { RunContext } from '../adapters/adapter.js';
import { AppError, errorCode } from '../domain/errors.js';
import { terminal, type Job, type JobKind, type Source } from '../domain/types.js';
import type { Store } from '../storage/store.js';
type Handler = (job: Job, context: RunContext) => Promise<string>;
export class JobEngine {
  private handlers = new Map<JobKind, Handler>();
  private controller: AbortController | null = null;
  private current: string | null = null;
  private scheduled: NodeJS.Immediate | null = null;
  private processing: Promise<void> | null = null;
  private stopped = false;
  private unavailable = false;
  loginGate = false;
  constructor(private store: Store, private max: number, private stopActions: () => Promise<void> = async () => {}) {}
  register(kind: JobKind, handler: Handler): void { this.handlers.set(kind, handler); }
  submit(kind: JobKind, input: Record<string, unknown>, source: Source | null = null) {
    if (this.stopped || this.unavailable) throw new AppError('RUNTIME_UNAVAILABLE');
    if (!this.handlers.has(kind)) throw new AppError('UNSUPPORTED_CAPABILITY');
    if (this.store.listJobs().filter(job => !terminal(job.status)).length >= this.max) throw new AppError('QUEUE_FULL');
    const job = this.store.createJob(kind, input, source);
    this.wake();
    return { job_id: job.job_id, kind, status: 'queued' as const, created_at: job.created_at };
  }
  private wake(): void {
    if (this.processing || this.scheduled || this.stopped || this.unavailable) return;
    this.scheduled = setImmediate(() => { this.scheduled = null; this.processing = this.drain().catch(() => { this.unavailable = true; }).finally(() => { this.processing = null; }); });
  }
  private async drain(): Promise<void> {
    while (!this.stopped && !this.unavailable) {
      const next = this.store.listJobs().find(job => job.status === 'queued'); if (!next) return;
      this.current = next.job_id; this.controller = new AbortController();
      const controller = this.controller;
      const deadline = performance.now() + Number(next.input.max_duration_seconds ?? 180) * 1000;
      const timer = setTimeout(() => controller.abort(new AppError('time_limit')), Math.max(1, deadline - performance.now())); timer.unref();
      let abortListener: (() => void) | undefined;
      const aborted = new Promise<never>((_resolve, reject) => { abortListener = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', abortListener, { once: true }); });
      const context: RunContext = { signal: controller.signal, deadline, check: () => { if (controller.signal.aborted) throw controller.signal.reason; if (performance.now() >= deadline) throw new AppError('time_limit'); } };
      try {
        const job = this.store.patchJob(next.job_id, { status: 'running', started_at: new Date().toISOString() });
        const reason = await Promise.race([this.handlers.get(job.kind)!(job, context), aborted]);
        context.check(); this.store.patchJob(job.job_id, { status: 'completed', stop_reason: reason }); this.loginGate = false;
      } catch (error) {
        const reason = controller.signal.aborted ? errorCode(controller.signal.reason) : errorCode(error);
        const job = this.store.job(next.job_id);
        const hasData = this.store.evidence(job.job_id).length > 0 || this.store.candidates(job.job_id).length > 0;
        const login = reason === 'login_required';
        this.store.patchJob(job.job_id, { status: reason === 'user_cancelled' || reason === 'shutdown' ? 'cancelled' : login ? 'needs_login' : reason === 'time_limit' || hasData ? 'partial' : 'failed', stop_reason: reason, limitations: [...job.limitations, reason] });
        if (login) {
          this.loginGate = true;
          for (const queued of this.store.listJobs()) if (queued.status === 'queued') this.store.patchJob(queued.job_id, { status: 'needs_login', stop_reason: 'login_required' });
        }
        if (controller.signal.aborted || reason === 'time_limit') {
          try { await this.stopActions(); } catch { this.unavailable = true; this.store.patchJob(job.job_id, { limitations: [...this.store.job(job.job_id).limitations, 'browser_cleanup_failed'] }); }
        }
      } finally {
        clearTimeout(timer); if (abortListener) controller.signal.removeEventListener('abort', abortListener); this.current = null; this.controller = null;
      }
    }
  }
  cancel(id: string) {
    const job = this.store.job(id);
    if (terminal(job.status)) return { job_id: id, status: job.status, cancellation_requested: job.cancellation_requested };
    this.store.patchJob(id, { cancellation_requested: true });
    if (job.status === 'queued') this.store.patchJob(id, { status: 'cancelled', stop_reason: 'user_cancelled' });
    else if (this.current === id) this.controller?.abort(new AppError('user_cancelled'));
    return { job_id: id, status: this.store.job(id).status, cancellation_requested: true };
  }
  async idle(): Promise<void> { while (this.scheduled || this.processing) { if (this.processing) await this.processing; else await new Promise<void>(resolve => setImmediate(resolve)); } }
  async close(): Promise<void> {
    this.stopped = true; if (this.scheduled) { clearImmediate(this.scheduled); this.scheduled = null; }
    this.controller?.abort(new AppError('shutdown'));
    for (const job of this.store.listJobs()) if (job.status === 'queued') this.store.patchJob(job.job_id, { status: 'cancelled', stop_reason: 'shutdown' });
    await this.processing;
  }
}
