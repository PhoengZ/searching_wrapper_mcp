import { setTimeout as delay } from 'node:timers/promises';
import type { Source, Capabilities } from '../domain/types.js';
import type { Adapter, CandidateInput, PostCandidate, RunContext } from './adapter.js';
import type { CommentsInput, DiscoveryInput, SearchInput } from '../schemas/tools.js';
import { AppError } from '../domain/errors.js';
export class MockAdapter implements Adapter {
  calls = { search: 0, comments: 0, discovery: 0, probe: 0 };
  constructor(public options: { posts?: PostCandidate[]; candidates?: CandidateInput[]; comments?: PostCandidate[]; delayMs?: number; error?: string } = {}) {}
  async probeSource(_source: Source, context: RunContext): Promise<Capabilities> { context.check(); this.calls.probe++; return { search: 'supported', comments: 'supported', sort: ['newest', 'relevant'], limitations: ['Synthetic mock data; not collected from social media.'] }; }
  private async before(context: RunContext) { context.check(); if (this.options.delayMs) await delay(this.options.delayMs, undefined, { signal: context.signal }); if (this.options.error) throw new AppError(this.options.error); context.check(); }
  async *discover(_request: DiscoveryInput, context: RunContext) {
    this.calls.discovery++; await this.before(context);
    for (const candidate of this.options.candidates ?? [{ name: 'Synthetic investment page', canonical_url: 'https://example.com/pages/demo', platform_id: 'demo', description: 'Synthetic DCA research fixture', source_type: 'page' as const, limitations: ['Synthetic example.'] }]) { context.check(); yield candidate; }
  }
  async *search(source: Source, _request: SearchInput, context: RunContext) {
    this.calls.search++; await this.before(context);
    for (const post of this.options.posts ?? [1, 2, 3].map(number => ({ platform_id: `post-${number}`, source_identity: source.identity, record_type: 'post' as const, url: `https://example.com/posts/${number}`, text: number === 3 ? 'คำถามกองทุน' : `เริ่ม DCA เดือนละเท่าไรดี ${number}`, published_at: '2026-11-05T05:00:00Z', published_at_raw: '5 November 2026', limitations: ['Synthetic example.'] }))) { context.check(); yield post; }
  }
  async *comments(source: Source, post: { record_id: string; url: string }, request: CommentsInput, context: RunContext) {
    this.calls.comments++; await this.before(context);
    for (const comment of this.options.comments ?? [1, 2].map(number => ({ platform_id: `${post.record_id}-c-${number}`, source_identity: source.identity, record_type: 'comment' as const, url: post.url, text: `คอมเมนต์ DCA สังเคราะห์ ${number}`, published_at: null, published_at_raw: null, evidence_level: 'post' as const, comment_sort: request.sort ?? 'unknown', limitations: ['No direct comment URL; synthetic data.'] }))) { context.check(); yield comment; }
  }
  async close(): Promise<void> {}
}
