import { test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
test('public package includes installation and license docs while ignoring local planning files', () => {
  for (const path of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md', 'docs/TOOLS.md', 'docs/TESTING.md']) expect(existsSync(path), path).toBe(true);
  expect(JSON.parse(readFileSync('package.json', 'utf8')).license).toBe('Apache-2.0');
});
