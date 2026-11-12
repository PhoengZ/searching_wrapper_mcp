import { expect, test } from 'vitest';
import { schemas } from '../../src/schemas/tools.js';
import { readConfig } from '../../src/config.js';
test('strict inputs reject invalid dates, limits, unknown fields and inconsistent comments', () => {
  const base = { source_id: 'a', keywords: ['DCA'] };
  for (const patch of [{ keywords: ['  '] }, { max_posts: '5' }, { max_posts: 101 }, { date_from: '2026-02-30' }, { date_from: '2026-11-12', date_to: '2026-11-01' }, { timezone: 'No/SuchZone' }, { extra: true }, { include_comments: false, max_total_comments: 3 }, { include_comments: true, max_total_comments: 0 }]) {
    expect(schemas.start_search.safeParse({ ...base, ...patch }).success).toBe(false);
  }
  expect(schemas.start_search.parse(base)).toMatchObject({ max_posts: 30, timezone: 'Asia/Bangkok', include_comments: false });
  expect(schemas.register_source.safeParse({ source_type: 'page', candidate_id: 'a', url: 'https://www.facebook.com/a' }).success).toBe(false);
});
test('configuration defaults deny external collection and rejects unsafe sizes', () => {
  const config = readConfig({ WRAPPER_DATA_DIR: process.cwd(), WRAPPER_MODE: 'mock' });
  expect(config.authorization.facebook.collection_scope).toBe('none');
  expect(() => readConfig({ WRAPPER_MODE: 'other' })).toThrow();
});
