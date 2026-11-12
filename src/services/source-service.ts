import { randomUUID } from 'node:crypto';
import type { Config } from '../config.js';
import { AppError } from '../domain/errors.js';
import type { Source } from '../domain/types.js';
import { schemas } from '../schemas/tools.js';
import { authorize, canonicalizeSource } from '../sources/url-policy.js';
import type { Store } from '../storage/store.js';
export class SourceService {
  constructor(private store: Store, private config: Config) {}
  registerSource(raw: unknown): Source {
    const input = schemas.register_source.parse(raw);
    const candidate = input.candidate_id ? this.store.candidate(input.candidate_id) : null;
    if (candidate && input.source_type !== 'page') throw new AppError('SOURCE_TYPE_MISMATCH');
    if (this.config.mode === 'facebook' && !['page', 'post'].includes(input.source_type)) throw new AppError('UNSUPPORTED_CAPABILITY');
    const url = canonicalizeSource(candidate?.canonical_url ?? input.url!, input.source_type, this.config.mode);
    authorize(url, this.config);
    const prior = input.source_id ? this.store.sources().find(source => source.source_id === input.source_id) : this.store.sources().find(source => source.canonical_url === url && source.source_type === input.source_type);
    const name = input.name ?? candidate?.name ?? prior?.name;
    if (!name) throw new AppError('SOURCE_NAME_REQUIRED');
    const unchanged = prior?.canonical_url === url && prior.source_type === input.source_type;
    return this.store.saveSource({ source_id: prior?.source_id ?? input.source_id ?? randomUUID(), name, source_type: input.source_type, platform: this.config.mode === 'mock' ? 'mock' : 'facebook', canonical_url: url, identity: url, version: (prior?.version ?? 0) + 1, verified_at: unchanged ? prior.verified_at : null, capabilities: unchanged ? prior.capabilities : { search: 'unverified', comments: 'unverified', sort: [], limitations: ['Capabilities require a queued browser probe.'] } });
  }
  listSources(raw: unknown) {
    const input = schemas.list_sources.parse(raw);
    const all = this.store.sources();
    let offset = 0;
    if (input.cursor) { offset = all.findIndex(source => source.source_id === input.cursor) + 1; if (!offset) throw new AppError('INVALID_CURSOR'); }
    const items = all.slice(offset, offset + input.page_size);
    return { items, next_cursor: offset + items.length < all.length ? items.at(-1)!.source_id : null };
  }
}
