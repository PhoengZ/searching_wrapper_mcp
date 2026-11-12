import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
let url = 'https://example.com';
serveStdio(() => {
  const server = new McpServer({ name: 'synthetic-browser', version: '1.0.0' });
  const register = (name, schema, action) => server.registerTool(name, { inputSchema: schema }, async input => ({ content: [{ type: 'text', text: '### Evaluation result\n' + JSON.stringify(action(input)) }] }));
  register('browser_navigate', z.object({ url: z.string() }), input => { url = input.url; return {}; });
  register('browser_evaluate', z.object({ function: z.string() }), () => ({ url, title: 'Synthetic page', blocked: null, candidates: [] }));
  register('browser_click', z.object({ target: z.string(), element: z.string().optional() }), () => ({}));
  register('browser_type', z.object({ target: z.string(), text: z.string(), submit: z.boolean().optional() }), () => ({}));
  register('browser_close', z.object({}), () => ({}));
  return server;
});
