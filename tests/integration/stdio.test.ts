import { test, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('stdio discovery and empty sources from another cwd', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'research-stdio-'));
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/index.js')], cwd: directory, env: { ...process.env as Record<string, string>, WRAPPER_MODE: 'mock', WRAPPER_DATA_DIR: directory }, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += String(chunk); });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name)).toContain('list_sources');
    const result = await client.callTool({ name: 'list_sources', arguments: {} });
    expect(result.structuredContent).toMatchObject({ items: [] });
    expect(stderr).not.toContain('secret-test-value');
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
