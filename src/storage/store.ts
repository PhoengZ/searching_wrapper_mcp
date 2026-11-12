import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../domain/errors.js';
import { emptyCounts, terminal, type Job, type JobKind, type Source, type Evidence, type EvidenceInput, type Candidate, type ExportManifest } from '../domain/types.js';
type PayloadRow = { payload: string; seq?: number };
export class Store {
  private db: DatabaseSync;
  private lock: DatabaseSync;
  private closed = false;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.lock = new DatabaseSync(join(directory, 'runtime-lock.sqlite'));
    try { this.lock.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;'); }
    catch { this.lock.close(); throw new AppError('PROFILE_IN_USE'); }
    try {
      this.db = new DatabaseSync(join(directory, 'research.sqlite'));
      this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=100;
        CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS identities (id TEXT PRIMARY KEY, identity_key TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS observations (seq INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE, record_id TEXT REFERENCES identities(id), payload TEXT NOT NULL, UNIQUE(job_id, record_id));
        CREATE TABLE IF NOT EXISTS candidates (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS exports (id TEXT PRIMARY KEY, job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE, payload TEXT NOT NULL);
        PRAGMA user_version=1;`);
    } catch (error) { this.lock.close(); throw error; }
  }
  close(): void { if (!this.closed) { this.closed = true; this.db.close(); this.lock.close(); } }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private one<T>(sql: string, ...values: (string | number)[]): T | null {
    const row = this.db.prepare(sql).get(...values) as PayloadRow | undefined;
    return row ? JSON.parse(row.payload) as T : null;
  }
  private many<T>(sql: string, ...values: (string | number)[]): T[] {
    return (this.db.prepare(sql).all(...values) as PayloadRow[]).map(row => ({ ...JSON.parse(row.payload), ...(row.seq === undefined ? {} : { sequence: row.seq }) }) as T);
  }
  source(id: string): Source { const value = this.one<Source>('SELECT payload FROM sources WHERE id=?', id); if (!value) throw new AppError('SOURCE_NOT_FOUND'); return value; }
  sources(): Source[] { return this.many<Source>('SELECT payload FROM sources ORDER BY id'); }
  saveSource(value: Source): Source { this.db.prepare('INSERT INTO sources VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(value.source_id, JSON.stringify(value)); return value; }
  createJob(kind: JobKind, input: Record<string, unknown>, source: Source | null = null): Job {
    const job: Job = { job_id: randomUUID(), kind, input, source, status: 'queued', created_at: new Date().toISOString(), started_at: null, finished_at: null, counts: emptyCounts(), limitations: [], stop_reason: null, effective_filters: {}, cancellation_requested: false };
    this.db.prepare('INSERT INTO jobs VALUES (?,?)').run(job.job_id, JSON.stringify(job)); return job;
  }
  job(id: string): Job { const value = this.one<Job>('SELECT payload FROM jobs WHERE id=?', id); if (!value) throw new AppError('JOB_NOT_FOUND'); return value; }
  listJobs(): Job[] { return this.many<Job>('SELECT payload FROM jobs ORDER BY id'); }
  patchJob(id: string, patch: Partial<Job>): Job {
    const before = this.job(id);
    if (terminal(before.status) && patch.status && patch.status !== before.status) throw new AppError('INVALID_JOB_TRANSITION');
    if (before.status === 'queued' && patch.status === 'completed') throw new AppError('INVALID_JOB_TRANSITION');
    const next = { ...before, ...patch, job_id: before.job_id };
    if (terminal(next.status) && !next.finished_at) next.finished_at = new Date().toISOString();
    this.db.prepare('UPDATE jobs SET payload=? WHERE id=?').run(JSON.stringify(next), id); return next;
  }
  recover(): void { for (const job of this.listJobs()) if (!terminal(job.status)) this.patchJob(job.job_id, { status: this.evidence(job.job_id).length || this.candidates(job.job_id).length ? 'partial' : 'failed', stop_reason: 'interrupted', limitations: [...job.limitations, 'Previous runtime interrupted; no automatic replay.'] }); }
  observe(jobId: string, input: EvidenceInput): Evidence {
    if (this.job(jobId).status !== 'running') throw new AppError('JOB_NOT_RUNNING');
    const method = input.platform_id ? 'platform_id' : input.record_type === 'post' || input.evidence_level === 'comment' ? 'url' : 'hash';
    const itemKey = method === 'platform_id' ? input.platform_id : method === 'url' ? input.url : createHash('sha256').update(JSON.stringify([input.text.normalize('NFC'), input.parent_id, input.published_at_raw])).digest('hex');
    const key = JSON.stringify([input.platform, input.source_id, input.record_type, method, itemKey]);
    const existing = this.db.prepare('SELECT id FROM identities WHERE identity_key=?').get(key) as { id: string } | undefined;
    const recordId = existing?.id ?? randomUUID();
    const current = this.one<Evidence>('SELECT payload FROM observations WHERE job_id=? AND record_id=?', jobId, recordId);
    if (current) return current;
    const record: Evidence = { ...input, record_id: recordId, job_id: jobId, collected_at: new Date().toISOString(), dedup_method: method, seen_before: Boolean(existing), date_status: input.published_at ? 'known' : 'unknown' };
    this.transaction(() => { this.db.prepare('INSERT OR IGNORE INTO identities VALUES (?,?)').run(recordId, key); this.db.prepare('INSERT INTO observations (job_id,record_id,payload) VALUES (?,?,?)').run(jobId, recordId, JSON.stringify(record)); });
    return record;
  }
  evidence(jobId: string): Evidence[] { return this.many<Evidence>('SELECT seq,payload FROM observations WHERE job_id=? ORDER BY seq', jobId); }
  record(id: string): Evidence { const value = this.one<Evidence>('SELECT payload FROM observations WHERE record_id=? ORDER BY seq DESC LIMIT 1', id); if (!value) throw new AppError('RECORD_NOT_FOUND'); return value; }
  addCandidate(jobId: string, input: Omit<Candidate, 'candidate_id' | 'job_id' | 'collected_at'>): Candidate {
    if (this.job(jobId).status !== 'running') throw new AppError('JOB_NOT_RUNNING');
    const prior = this.candidates(jobId).find(item => item.canonical_url === input.canonical_url); if (prior) return prior;
    const value: Candidate = { ...input, candidate_id: randomUUID(), job_id: jobId, collected_at: new Date().toISOString() };
    this.db.prepare('INSERT INTO candidates (id,job_id,payload) VALUES (?,?,?)').run(value.candidate_id, jobId, JSON.stringify(value)); return value;
  }
  candidates(jobId: string): Candidate[] { return this.many<Candidate>('SELECT seq,payload FROM candidates WHERE job_id=? ORDER BY seq', jobId); }
  candidate(id: string): Candidate { const value = this.one<Candidate>('SELECT payload FROM candidates WHERE id=?', id); if (!value) throw new AppError('CANDIDATE_NOT_FOUND'); return value; }
  saveExport(value: ExportManifest): void { this.db.prepare('INSERT INTO exports VALUES (?,?,?)').run(value.export_id, value.job_id, JSON.stringify(value)); }
  exports(jobId: string): ExportManifest[] { return this.many<ExportManifest>('SELECT payload FROM exports WHERE job_id=?', jobId); }
  deleteData(jobId: string): void { this.transaction(() => { this.db.prepare('DELETE FROM jobs WHERE id=?').run(jobId); this.db.exec('DELETE FROM identities WHERE id NOT IN (SELECT record_id FROM observations)'); }); }
}
