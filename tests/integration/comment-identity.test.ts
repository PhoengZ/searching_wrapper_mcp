import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../src/storage/store.js';
test('anonymous identical comments on separate posts keep distinct identities across jobs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-anonymous-')); const store = new Store(directory);
  try {
    const input = { platform: 'mock', source_id: 's', record_type: 'comment' as const, platform_id: null, parent_id: null, text: 'same anonymous comment', published_at: null, published_at_raw: null, matched_keywords: [], limitations: [], evidence_level: 'post' as const };
    const job = store.createJob('comments', {}); store.patchJob(job.job_id, { status: 'running' });
    const first = store.observe(job.job_id, { ...input, post_record_id: 'post-a', url: 'https://example.com/posts/a' });
    const second = store.observe(job.job_id, { ...input, post_record_id: 'post-b', url: 'https://example.com/posts/b' });
    expect(first.record_id).not.toBe(second.record_id); expect(store.evidence(job.job_id)).toHaveLength(2);
    store.patchJob(job.job_id, { status: 'completed' });
    const next = store.createJob('comments', {}); store.patchJob(next.job_id, { status: 'running' });
    const a = store.observe(next.job_id, { ...input, post_record_id: 'post-a', url: 'https://example.com/posts/a' });
    const b = store.observe(next.job_id, { ...input, post_record_id: 'post-b', url: 'https://example.com/posts/b' });
    expect(a.record_id).toBe(first.record_id); expect(b.record_id).toBe(second.record_id); expect([a, b].every(item => item.seen_before)).toBe(true);
    expect(store.evidence(job.job_id).map(item => item.post_record_id)).toEqual(['post-a', 'post-b']);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
