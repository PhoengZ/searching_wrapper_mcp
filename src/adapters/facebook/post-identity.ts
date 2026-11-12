import { AppError } from '../../domain/errors.js';
import type { Source } from '../../domain/types.js';
import { canonicalizeSource } from '../../sources/url-policy.js';

export function postBase(value: string): string {
  const url = new URL(canonicalizeSource(value, 'post'));
  url.searchParams.delete('comment_id'); url.searchParams.delete('reply_comment_id');
  return canonicalizeSource(url.href, 'post');
}

function owner(value: string): string | null {
  const url = new URL(value); const parts = url.pathname.split('/').filter(Boolean);
  if (['profile.php', 'permalink.php', 'story.php'].includes(parts[0] ?? '')) return url.searchParams.get('id');
  if (['pages', 'people'].includes(parts[0] ?? '') && parts.length >= 3) return parts[2]!;
  if (parts.length === 1 || parts[1] === 'posts') return parts[0] ?? null;
  return null;
}

export function assertSamePost(observed: string, expected: string): void {
  if (postBase(observed) !== postBase(expected)) throw new AppError('source_mismatch');
}

export function assertPostSource(observed: string, source: Source): void {
  if (source.source_type === 'post') return assertSamePost(observed, source.canonical_url);
  const expected = owner(source.canonical_url); const actual = owner(postBase(observed));
  if (!expected || expected !== actual) throw new AppError('source_mismatch');
}
