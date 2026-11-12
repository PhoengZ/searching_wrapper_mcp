import { test, expect } from 'vitest';
import { matchText, matchesDate } from '../../src/services/matching.js';
test('literal matching normalizes case and dates respect Bangkok boundaries', () => {
  expect(matchText('DCA กับกองทุน', ['dca', 'กองทุน'], 'all')).toEqual(['dca', 'กองทุน']);
  expect(matchText('DCA อย่างเดียว', ['DCA', 'กองทุน'], 'all')).toEqual([]);
  expect(matchesDate('2026-10-31T17:00:00Z', { date_from: '2026-11-01', timezone: 'Asia/Bangkok' })).toBe(true);
  expect(matchesDate('2026-11-12T17:00:00Z', { date_to: '2026-11-12', timezone: 'Asia/Bangkok' })).toBe(false);
  expect(matchesDate(null, { date_from: '2026-11-01', timezone: 'Asia/Bangkok' })).toBe(false);
});
