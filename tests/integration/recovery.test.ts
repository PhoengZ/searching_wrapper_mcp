import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../../src/storage/store.js';
test('recovery ends interrupted jobs without replay and refuses a future database version', () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-recover-'));
  let store = new Store(directory); const job = store.createJob('search', {}); store.patchJob(job.job_id, { status: 'running' }); store.close();
  store = new Store(directory); store.recover(); expect(store.job(job.job_id)).toMatchObject({ status: 'failed', stop_reason: 'interrupted' }); store.close();
  const database = new DatabaseSync(join(directory, 'research.sqlite')); database.exec('PRAGMA user_version=999'); database.close();
  let unexpected: Store | undefined;
  try { expect(() => { unexpected = new Store(directory); }).toThrow('UNSUPPORTED_DB_VERSION'); }
  finally { unexpected?.close(); rmSync(directory, { recursive: true, force: true }); }
});
