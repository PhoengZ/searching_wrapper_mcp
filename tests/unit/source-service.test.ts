import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readConfig } from '../../src/config.js';
import { Store } from '../../src/storage/store.js';
import { SourceService } from '../../src/services/source-service.js';
test('source registration persists, updates versions and never trusts unverified capabilities', () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-source-'));
  const config = readConfig({ WRAPPER_MODE: 'mock', WRAPPER_DATA_DIR: directory }); const store = new Store(directory);
  try {
    const service = new SourceService(store, config);
    const first = service.registerSource({ url: 'https://example.com/a', source_type: 'page', name: 'เพจ A' });
    expect(service.listSources({}).items).toHaveLength(1);
    expect(first.capabilities.search).toBe('unverified');
    const next = service.registerSource({ source_id: first.source_id, url: 'https://example.com/b', source_type: 'page', name: 'เพจ B' });
    expect(next.version).toBe(2); expect(next.verified_at).toBeNull(); expect(next.identity).not.toBe(first.identity);
    expect(() => service.registerSource({ candidate_id: 'invented', source_type: 'page' })).toThrow('CANDIDATE_NOT_FOUND');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
