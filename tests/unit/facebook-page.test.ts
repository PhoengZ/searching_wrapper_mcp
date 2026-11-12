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
test.each(['page', 'post'] as const)('a %s source rejects an unrelated article even on the correct document URL', async kind => {
  const selected: Source = kind === 'page' ? source : { ...source, source_type: 'post', canonical_url: `${source.canonical_url}/posts/selected`, identity: `${source.canonical_url}/posts/selected` };
  const browser: BrowserPort = { async execute(action) {
    if (action.kind === 'read' && action.script === 'state') return { url: selected.canonical_url, title: 'Synthetic', blocked: null, has_articles: true };
    if (action.kind === 'read' && action.script === 'posts') return { url: selected.canonical_url, items: [{ text: 'DCA unrelated', url: kind === 'page' ? 'https://www.facebook.com/unrelated/posts/1' : `${source.canonical_url}/posts/unrelated`, platform_id: 'unrelated', published_at: null, published_at_raw: null }] };
    return {};
  }, async close() {} };
  const collect = async () => { const rows = []; for await (const row of new FacebookPageAdapter(browser).search(selected, schemas.start_search.parse({ source_id: 'page', keywords: ['DCA'], max_posts: 1 }), context())) rows.push(row); return rows; };
  await expect(collect()).rejects.toThrow('source_mismatch');
});
test('comments reject unrelated post links instead of inheriting the requested post identity', async () => {
  const postUrl = `${source.canonical_url}/posts/1`;
  const browser: BrowserPort = { async execute(action) {
    if (action.kind === 'read' && action.script === 'state') return { url: postUrl, title: 'Synthetic', blocked: null, has_articles: true };
    if (action.kind === 'read' && action.script === 'comments') return { url: postUrl, items: [{ text: 'foreign comment', url: 'https://www.facebook.com/unrelated/posts/2?comment_id=c', post_url: postUrl, platform_id: 'c', parent_platform_id: null, published_at: null, published_at_raw: null }] };
    return {};
  }, async close() {} };
  const collect = async () => { for await (const _row of new FacebookPageAdapter(browser).comments(source, { record_id: 'p', url: postUrl }, schemas.read_comments.parse({ source_id: 'page', post_record_ids: ['p'], max_comments_per_post: 1 }), context())) {} };
  await expect(collect()).rejects.toThrow('source_mismatch');
});
