import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readConfig } from '../../src/config.js';
import { BrowserClient } from '../../src/clients/playwright-client.js';
import { browserOptions } from '../../src/clients/browser-options.js';
import { FacebookPageAdapter } from '../../src/adapters/facebook/page-adapter.js';
import { schemas } from '../../src/schemas/tools.js';
import type { Source } from '../../src/domain/types.js';
test('real browser fixed extractors discover Pages and preserve post/comment/reply identity on intercepted synthetic HTML', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-facebook-fixture-'));
  const options = browserOptions(readConfig({ WRAPPER_DATA_DIR: directory, WRAPPER_HEADLESS: 'true' })); options.args.push('--init-page', resolve('tests/fixtures/controlled-facebook.ts')); options.args[options.args.indexOf('--timeout-settle') + 1] = '0';
  const adapter = new FacebookPageAdapter(new BrowserClient(options)); const controller = new AbortController(); const context = { signal: controller.signal, deadline: performance.now() + 25000, check() { controller.signal.throwIfAborted(); } };
  try {
    const candidates = []; for await (const candidate of adapter.discover(schemas.discover_sources.parse({ query: 'DCA', max_candidates: 1 }), context)) candidates.push(candidate);
    expect(candidates[0]?.canonical_url).toBe('https://www.facebook.com/synthetic-page');
    const source: Source = { source_id: 'synthetic', name: 'Synthetic', source_type: 'page', platform: 'facebook', canonical_url: candidates[0]!.canonical_url, identity: candidates[0]!.canonical_url, version: 1, verified_at: null, capabilities: { search: 'unverified', comments: 'unverified', sort: [], limitations: [] } };
    expect((await adapter.probeSource(source, context)).search).toBe('supported');
    const posts = []; for await (const post of adapter.search(source, schemas.start_search.parse({ source_id: source.source_id, keywords: ['DCA'], max_posts: 1 }), context)) posts.push(post);
    expect(posts).toHaveLength(1); expect(posts[0]?.published_at).toBe('2026-11-05T05:00:00Z');
    const comments = []; for await (const comment of adapter.comments(source, { record_id: 'post1', url: posts[0]!.url }, schemas.read_comments.parse({ source_id: source.source_id, post_record_ids: ['post1'], max_comments_per_post: 2 }), context)) comments.push(comment);
    expect(comments.map(comment => comment.platform_id)).toEqual(['c1', 'r1']); expect(comments[1]?.parent_id).toBe('c1');
  } finally { await adapter.close(); rmSync(directory, { recursive: true, force: true }); }
});
