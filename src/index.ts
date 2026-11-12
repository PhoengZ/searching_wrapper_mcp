#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';
import { createRuntime } from './runtime.js';
const runtime = await createRuntime();
const server = serveStdio(() => createServer(runtime), { onerror: () => console.error('MCP transport error') });
let stopping = false;
async function stop() { if (stopping) return; stopping = true; try { await runtime.close(); await server.close(); } catch { console.error('RUNTIME_CLEANUP_FAILED'); process.exitCode = 1; } }
process.stdin.on('end', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });
