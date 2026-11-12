import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
export function createServer(): McpServer {
  const server = new McpServer({ name: 'local-social-research-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.registerTool('list_sources', { description: 'List saved sources locally without opening a browser.', inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true, openWorldHint: false } }, async () => ({ content: [{ type: 'text', text: 'No saved sources.' }], structuredContent: { items: [], next_cursor: null } }));
  return server;
}
