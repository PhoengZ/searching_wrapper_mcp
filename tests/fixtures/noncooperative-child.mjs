import { createInterface } from 'node:readline';
import { existsSync, writeFileSync } from 'node:fs';
const [mode, marker] = process.argv.slice(2);
let busy = false;
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') return send(message.id, { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'noncooperative-fixture', version: '1' } });
  if (message.method === 'tools/list') {
    if (mode === 'discovery') { writeFileSync(marker, String(process.pid)); return; }
    return send(message.id, { tools: [
      { name: 'browser_navigate', inputSchema: { type: 'object', properties: { url: { type: 'string' } } } },
      { name: 'browser_evaluate', inputSchema: { type: 'object', properties: { function: { type: 'string' } } } },
      { name: 'browser_close', inputSchema: { type: 'object', properties: {} } },
    ] });
  }
  if (message.method === 'tools/call') {
    if (message.params.name === 'browser_navigate' && !existsSync(marker)) { busy = true; writeFileSync(marker, String(process.pid)); return; }
    send(message.id, { content: [{ type: 'text', text: '### Evaluation result\n' + JSON.stringify(message.params.name === 'browser_evaluate' ? { url: 'https://example.com/', title: 'busy=' + busy } : {}) }] });
  }
});
