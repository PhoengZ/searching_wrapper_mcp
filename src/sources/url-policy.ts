import { AppError } from '../domain/errors.js';
import type { Config } from '../config.js';
export function canonicalizeSource(value: string, type: string, mode: Config['mode'] = 'facebook'): string {
  try {
    const url = new URL(value);
    const hosts = mode === 'mock' ? ['example.com'] : ['facebook.com', 'www.facebook.com', 'm.facebook.com'];
    if (!['https:', 'http:'].includes(url.protocol) || !hosts.includes(url.hostname) || url.port || url.username || url.password) throw new Error();
    if (type === 'page' && /^\/(groups|events)\//.test(url.pathname)) throw new Error();
    url.protocol = 'https:'; url.hostname = mode === 'mock' ? 'example.com' : 'www.facebook.com'; url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_') || ['fbclid', 'ref', 'refsrc', '__tn__'].includes(key)) url.searchParams.delete(key);
    url.searchParams.sort(); url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch { throw new AppError('INVALID_SOURCE_URL'); }
}
export function authorize(url: string, config: Config, discovery = false): void {
  if (config.mode === 'mock') return;
  const policy = config.authorization.facebook;
  if (discovery ? policy.discovery_allowed : policy.collection_scope === 'platform' || (policy.collection_scope === 'listed_sources' && policy.source_urls.some(item => canonicalizeSource(item, 'page') === url))) return;
  throw new AppError('AUTHORIZATION_REQUIRED');
}
