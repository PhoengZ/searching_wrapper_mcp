import { expect, test } from 'vitest';
import { canonicalizeSource } from '../../src/sources/url-policy.js';
test('source URL policy rejects local, deceptive, credential and unsupported targets', () => {
  for (const url of ['file:///C:/secret', 'javascript:alert(1)', 'http://localhost/x', 'http://127.0.0.1', 'http://[::1]', 'https://facebook.com.evil.test/a', 'https://me:secret@www.facebook.com/a', 'https://www.facebook.com:8443/a', 'https://fb.me/a']) {
    expect(() => canonicalizeSource(url, 'page')).toThrow('INVALID_SOURCE_URL');
  }
  expect(canonicalizeSource('http://m.facebook.com/profile.php?id=123&utm_source=test#x', 'profile')).toBe('https://www.facebook.com/profile.php?id=123');
  expect(() => canonicalizeSource('https://www.facebook.com/groups/123', 'page')).toThrow();
});
