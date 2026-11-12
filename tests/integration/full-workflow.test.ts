import { test, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
test('all nine tools complete discovery-choice-search-comments-export-delete through real stdio', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-full-')); const client = new Client({ name: 'workflow-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/index.js')], cwd: directory, env: { ...process.env as Record<string, string>, WRAPPER_MODE: 'mock', WRAPPER_DATA_DIR: directory }, stderr: 'pipe' }); transport.stderr?.on('data', () => {});
  const call = async (name: string, input: Record<string, unknown>) => { const result = await client.callTool({ name, arguments: input }); expect(result.isError, JSON.stringify(result)).not.toBe(true); return result.structuredContent as Record<string, unknown>; };
  const wait = async (job_id: string) => { for (let attempt = 0; attempt < 100; attempt++) { const job = await call('get_job', { job_id }); if (!['queued', 'running'].includes(String(job.status))) return job; await delay(20); } throw new Error('JOB_DID_NOT_FINISH'); };
  try {
    await client.connect(transport); const listed = await client.listTools(); expect(listed.tools).toHaveLength(9);
    expect(listed.tools.find(tool => tool.name === 'get_job')?.annotations?.readOnlyHint).toBe(true); expect(listed.tools.find(tool => tool.name === 'delete_job')?.annotations?.destructiveHint).toBe(true);
    const discovery = await call('discover_sources', { query: 'DCA กองทุน' }); const found = await wait(String(discovery.job_id)); const candidate = (found.items as Record<string, unknown>[])[0]!;
    const source = await call('register_source', { candidate_id: candidate.candidate_id, source_type: 'page' }); expect((await call('list_sources', {})).items).toHaveLength(1);
    const search = await call('start_search', { source_id: source.source_id, keywords: ['DCA'], max_posts: 2 }); const result = await wait(String(search.job_id)); expect(result.status).toBe('completed'); const posts = result.items as Record<string, unknown>[]; expect(posts).toHaveLength(2);
    const comments = await call('read_comments', { source_id: source.source_id, post_record_ids: posts.map(post => post.record_id), max_total_comments: 3 }); const commentResult = await wait(String(comments.job_id)); expect(commentResult.items).toHaveLength(3);
    const exported = await call('export_results', { job_id: comments.job_id, format: 'csv' }); expect(existsSync(String(exported.path))).toBe(true);
    await call('cancel_job', { job_id: comments.job_id }); expect((await call('delete_job', { job_id: comments.job_id })).deleted).toBe(true); expect(existsSync(String(exported.path))).toBe(false);
    const invalid = await client.callTool({ name: 'start_search', arguments: { source_id: source.source_id, keywords: ['DCA'], max_posts: 101 } }).catch(() => null); if (invalid) expect(invalid.isError).toBe(true);
  } finally { await client.close(); rmSync(directory, { recursive: true, force: true }); }
});
