import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../../src/config.js';
import { Store } from '../../src/storage/store.js';
import { SourceService } from '../../src/services/source-service.js';
import { JobEngine } from '../../src/jobs/engine.js';
import { MockAdapter } from '../../src/adapters/mock-adapter.js';
import { ResearchService } from '../../src/services/research-service.js';
import { AppError } from '../../src/domain/errors.js';
import type { PostCandidate } from '../../src/adapters/adapter.js';
test('comments are opt-in, selected source is checked, and both comment budgets hold', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-comments-')); const config = readConfig({ WRAPPER_MODE: 'mock', WRAPPER_DATA_DIR: directory }); const store = new Store(directory); const adapter = new MockAdapter(); const engine = new JobEngine(store, 20); const sources = new SourceService(store, config); const research = new ResearchService(store, config, engine, adapter);
  try {
    const source = sources.registerSource({ url: 'https://example.com/pages/demo', source_type: 'page', name: 'Demo' });
    const search = research.startSearch({ source_id: source.source_id, keywords: ['DCA'], max_posts: 2 }); await engine.idle(); const posts = store.evidence(search.job_id);
    const ack = research.startComments({ source_id: source.source_id, post_record_ids: posts.map(post => post.record_id), max_comments_per_post: 2, max_total_comments: 3 });
    expect(ack.status).toBe('queued'); await engine.idle(); const rows = store.evidence(ack.job_id);
    expect(rows).toHaveLength(3); expect(rows.every(row => row.job_id === ack.job_id && row.post_record_id && row.evidence_level === 'post')).toBe(true);
    expect(store.job(ack.job_id).counts.comments_examined).toBe(3);
    const combined = research.startSearch({ source_id: source.source_id, keywords: ['DCA'], max_posts: 2, include_comments: true, max_total_comments: 1 }); await engine.idle();
    expect(store.evidence(combined.job_id).filter(row => row.record_type === 'comment')).toHaveLength(1);
    sources.registerSource({ source_id: source.source_id, url: 'https://example.com/other', source_type: 'page', name: 'Other' });
    expect(() => research.startComments({ source_id: source.source_id, post_record_ids: [posts[0]!.record_id] })).toThrow('SOURCE_IDENTITY_CHANGED');
  } finally { await engine.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('login failure while opening comments preserves saved post counters', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-comment-login-')); const config = readConfig({ WRAPPER_MODE: 'mock', WRAPPER_DATA_DIR: directory }); const store = new Store(directory); const engine = new JobEngine(store, 20);
  class LoginInComments extends MockAdapter { override async *comments(): AsyncGenerator<PostCandidate> { throw new AppError('login_required'); } }
  try {
    const source = new SourceService(store, config).registerSource({ url: 'https://example.com/pages/demo', source_type: 'page', name: 'Demo' });
    const research = new ResearchService(store, config, engine, new LoginInComments()); const ack = research.startSearch({ source_id: source.source_id, keywords: ['DCA'], include_comments: true }); await engine.idle();
    expect(store.job(ack.job_id).status).toBe('needs_login'); expect(store.evidence(ack.job_id)).toHaveLength(1); expect(store.job(ack.job_id).counts.posts_saved).toBe(1);
  } finally { await engine.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('omitted comment limits cannot exceed lower configured hard ceilings', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-comment-ceiling-')); const config = readConfig({ WRAPPER_MODE: 'mock', WRAPPER_DATA_DIR: directory }); config.limits.max_comments_per_post = 1; config.limits.max_total_comments = 1;
  const store = new Store(directory); const engine = new JobEngine(store, 20);
  try {
    const source = new SourceService(store, config).registerSource({ url: 'https://example.com/pages/demo', source_type: 'page', name: 'Demo' });
    const ack = new ResearchService(store, config, engine, new MockAdapter()).startSearch({ source_id: source.source_id, keywords: ['DCA'], max_posts: 1, include_comments: true }); await engine.idle();
    expect(store.evidence(ack.job_id).filter(row => row.record_type === 'comment')).toHaveLength(1); expect(store.job(ack.job_id).counts.comments_examined).toBe(1);
  } finally { await engine.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
});
