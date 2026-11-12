import { test, expect } from 'vitest';
import { FacebookPageAdapter, type BrowserPort } from '../../src/adapters/facebook/page-adapter.js';
import { schemas } from '../../src/schemas/tools.js';
import type { Source } from '../../src/domain/types.js';
const source: Source = { source_id: 'page', name: 'Synthetic page', source_type: 'page', platform: 'facebook', canonical_url: 'https://www.facebook.com/synthetic-page', identity: 'https://www.facebook.com/synthetic-page', version: 1, verified_at: null, capabilities: { search: 'unverified', comments: 'unverified', sort: [], limitations: [] } };
const context = () => { const controller = new AbortController(); return { signal: controller.signal, deadline: performance.now() + 10000, check() { controller.signal.throwIfAborted(); } }; };
test('Page adapter extracts bounded candidates and rejects same-name wrong target', async () => {
  let url = source.canonical_url; let wrong = false;
  const browser: BrowserPort = { async execute(action) {
    if (action.kind === 'navigate') { url = action.url; return {}; }
    if (action.kind === 'read' && action.script === 'state') return { url: wrong ? 'https://www.facebook.com/wrong-page' : url, title: 'Synthetic page', blocked: null, has_articles: true, has_comment_controls: true, no_results: false };
    if (action.kind === 'read' && action.script === 'posts') return { url, items: [{ text: 'DCA คำถาม', url: 'https://www.facebook.com/synthetic-page/posts/1', platform_id: '1', published_at: null, published_at_raw: null }] };
    return {};
  }, async close() {} };
  const adapter = new FacebookPageAdapter(browser); const request = schemas.start_search.parse({ source_id: 'page', keywords: ['DCA'], max_posts: 1 });
  const rows = []; for await (const row of adapter.search(source, request, context())) rows.push(row);
  expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ source_identity: source.identity, text: 'DCA คำถาม', platform_id: '1' });
  wrong = true; await expect(adapter.probeSource(source, context())).rejects.toThrow('source_mismatch');
});
test('login and unsupported UI never become successful empty results', async () => {
  const browser: BrowserPort = { async execute() { return { url: source.canonical_url, title: 'Login', blocked: 'login_required' }; }, async close() {} };
  await expect(new FacebookPageAdapter(browser).probeSource(source, context())).rejects.toThrow('login_required');
});
