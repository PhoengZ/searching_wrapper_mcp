import { z } from 'zod';
import { AppError } from '../../domain/errors.js';
import type { Source, Capabilities } from '../../domain/types.js';
import type { CommentsInput, DiscoveryInput, SearchInput } from '../../schemas/tools.js';
import { canonicalizeSource } from '../../sources/url-policy.js';
import type { BrowserClient } from '../../clients/playwright-client.js';
import type { BrowserScript } from '../../clients/browser-scripts.js';
import type { Adapter, PostCandidate, RunContext } from '../adapter.js';
export type BrowserPort = Pick<BrowserClient, 'execute' | 'close'>;
export const pageState = z.object({ url: z.string().url(), title: z.string(), blocked: z.string().nullable(), has_articles: z.boolean().optional(), has_comment_controls: z.boolean().optional(), no_results: z.boolean().optional(), no_posts: z.boolean().optional(), no_comments: z.boolean().optional() });
const pages = z.object({ url: z.string().url(), items: z.array(z.object({ name: z.string().max(200), url: z.string().max(2048), platform_id: z.string().nullable() })).max(10) });
const rawPost = z.object({ text: z.string().max(80000), url: z.string().max(2048), platform_id: z.string().max(200).nullable(), published_at: z.string().max(500).nullable(), published_at_raw: z.string().max(500).nullable() });
const postBatch = z.object({ url: z.string().url(), items: z.array(rawPost).max(100) });
const commentBatch = z.object({ url: z.string().url(), items: z.array(rawPost.extend({ url: z.string().max(2048).nullable(), parent_platform_id: z.string().max(200).nullable() })).max(1000) });
export class FacebookPageAdapter implements Adapter {
  constructor(private browser: BrowserPort) {}
  protected async state(context: RunContext) {
    context.check(); const state = pageState.parse(await this.browser.execute({ kind: 'read', script: 'state' }, context));
    if (state.blocked) throw new AppError(['login_required', 'access_denied', 'rate_limited'].includes(state.blocked) ? state.blocked : 'unsupported_ui');
    canonicalizeSource(state.url, 'page'); return state;
  }
  async *discover(request: DiscoveryInput, context: RunContext) {
    const target = new URL('https://www.facebook.com/search/pages/'); target.searchParams.set('q', request.query);
    await this.browser.execute({ kind: 'navigate', url: target.toString() }, context);
    const initial = await this.state(context); if (!new URL(initial.url).pathname.startsWith('/search/pages')) throw new AppError('unsupported_ui');
    const seen = new Set<string>(); let empty = 0; let count = 0;
    for (let action = 0; action < 20 && empty < 2; action++) {
      context.check(); const batch = pages.parse(await this.read('pages', context)); let added = 0;
      if (!new URL(batch.url).pathname.startsWith('/search/pages') || canonicalizeSource(batch.url, 'page') !== canonicalizeSource(initial.url, 'page')) throw new AppError('source_mismatch');
      for (const row of batch.items) {
        let url; try { url = canonicalizeSource(row.url, 'page'); } catch { continue; }
        if (seen.has(url)) continue; seen.add(url); added++; count++;
        yield { name: row.name, canonical_url: url, platform_id: row.platform_id, description: null, source_type: 'page' as const, limitations: ['Observed in Pages search; collection rechecks target identity. Live UI compatibility is not yet release-verified.'] };
        if (count >= request.max_candidates) return;
      }
      empty = added ? 0 : empty + 1;
      if (empty < 2) { await this.browser.execute({ kind: 'read', script: 'scroll' }, context); await this.state(context); }
    }
    if (!count && !initial.no_results) throw new AppError('unsupported_ui');
  }
  private async read(script: BrowserScript, context: RunContext): Promise<unknown> {
    try { return await this.browser.execute({ kind: 'read', script }, context); }
    catch (error) { if (!(error instanceof AppError) || error.code !== 'browser_action_failed') throw error; await this.state(context); return this.browser.execute({ kind: 'read', script }, context); }
  }
  private assertTarget(observed: string, expected: string): void { if (canonicalizeSource(observed, 'post') !== canonicalizeSource(expected, 'post')) throw new AppError('source_mismatch'); }
  async probeSource(source: Source, context: RunContext): Promise<Capabilities> {
    if (!['page', 'post'].includes(source.source_type)) throw new AppError('UNSUPPORTED_CAPABILITY');
    await this.browser.execute({ kind: 'navigate', url: source.canonical_url }, context);
    const state = await this.state(context); this.assertTarget(state.url, source.canonical_url);
    return { search: state.has_articles || state.no_posts ? 'supported' : 'unsupported', comments: state.has_comment_controls ? 'supported' : 'unverified', sort: [], limitations: ['Experimental Facebook UI adapter; live compatibility not release-verified.', 'Search samples visible feed posts; platform keyword/date filters are not used.', 'Comment ordering and complete platform coverage are not guaranteed.'] };
  }
  async *search(source: Source, request: SearchInput, context: RunContext): AsyncGenerator<PostCandidate> {
    await this.browser.execute({ kind: 'navigate', url: source.canonical_url }, context);
    const initial = await this.state(context); this.assertTarget(initial.url, source.canonical_url);
    const seen = new Set<string>(); let empty = 0; let count = 0;
    for (let action = 0; action < 20 && empty < 2; action++) {
      context.check(); const current = await this.state(context);
      if (canonicalizeSource(current.url, 'post') !== source.canonical_url) {
        await this.browser.execute({ kind: 'navigate', url: source.canonical_url }, context);
        for (let restore = 0; restore < action; restore++) await this.read('scroll', context);
      }
      await this.read('expand_text', context);
      const batch = postBatch.parse(await this.read('posts', context)); this.assertTarget(batch.url, source.canonical_url); let added = 0;
      for (const row of batch.items) {
        const url = canonicalizeSource(row.url, 'post'); const key = row.platform_id ?? url; if (seen.has(key)) continue; seen.add(key); added++; count++;
        yield { ...row, url, source_identity: source.identity, record_type: 'post', limitations: ['Visible feed sample; original post URL observed in the target feed.'] };
        if (count >= request.max_posts || source.source_type === 'post') return;
      }
      empty = added ? 0 : empty + 1;
      if (empty < 2) await this.read('scroll', context);
    }
    if (!count && !initial.no_posts && !initial.no_results) throw new AppError('unsupported_ui');
  }
  async *comments(source: Source, post: { record_id: string; url: string }, request: CommentsInput, context: RunContext): AsyncGenerator<PostCandidate> {
    await this.browser.execute({ kind: 'navigate', url: canonicalizeSource(post.url, 'post') }, context);
    const initial = await this.state(context); this.assertTarget(initial.url, post.url);
    const seen = new Set<string>(); let empty = 0; let count = 0;
    for (let action = 0; action < 20 && empty < 2; action++) {
      context.check(); await this.state(context); await this.read('expand_comments', context);
      const batch = commentBatch.parse(await this.read('comments', context)); this.assertTarget(batch.url, post.url); let added = 0;
      for (const row of batch.items) {
        const key = row.platform_id ?? `${row.text}\u0000${row.parent_platform_id}`; if (seen.has(key)) continue; seen.add(key); count++; added++;
        const url = row.url ? canonicalizeSource(row.url, 'post') : post.url;
        yield { ...row, url, parent_id: row.parent_platform_id, source_identity: source.identity, record_type: 'comment', post_record_id: post.record_id, evidence_level: row.url ? 'comment' : 'post', comment_sort: 'unknown', limitations: ['Comment sort and completeness are unknown.', ...(request.sort ? ['Requested sort not enforced by this adapter.'] : []), ...(!row.url ? ['No direct comment URL; evidence is post-level.'] : [])] };
        if (count >= request.max_comments_per_post || count >= request.max_total_comments) return;
      }
      empty = added ? 0 : empty + 1;
    }
    if (!count && !initial.no_comments) throw new AppError('unsupported_ui');
  }
  async close(): Promise<void> { await this.browser.close(); }
}
