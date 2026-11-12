import { z } from 'zod';
import { AppError } from '../../domain/errors.js';
import type { Source, Capabilities } from '../../domain/types.js';
import type { CommentsInput, DiscoveryInput, SearchInput } from '../../schemas/tools.js';
import { canonicalizeSource } from '../../sources/url-policy.js';
import type { BrowserClient } from '../../clients/playwright-client.js';
import type { Adapter, PostCandidate, RunContext } from '../adapter.js';
export type BrowserPort = Pick<BrowserClient, 'execute' | 'close'>;
export const pageState = z.object({ url: z.string().url(), title: z.string(), blocked: z.string().nullable(), has_articles: z.boolean().optional(), no_results: z.boolean().optional() });
const pages = z.array(z.object({ name: z.string().max(200), url: z.string().max(2048), platform_id: z.string().nullable() })).max(10);
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
      context.check(); const rows = pages.parse(await this.browser.execute({ kind: 'read', script: 'pages' }, context)); let added = 0;
      for (const row of rows) {
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
  async probeSource(_source: Source, _context: RunContext): Promise<Capabilities> { return { search: 'unsupported', comments: 'unsupported', sort: [], limitations: ['Collection adapter pending verification.'] }; }
  async *search(_source: Source, _request: SearchInput, _context: RunContext): AsyncGenerator<PostCandidate> { throw new AppError('unsupported_ui'); }
  async *comments(_source: Source, _post: { record_id: string; url: string }, _request: CommentsInput, _context: RunContext): AsyncGenerator<PostCandidate> { throw new AppError('unsupported_ui'); }
  async close(): Promise<void> { await this.browser.close(); }
}
