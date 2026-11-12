import { Client, SdkError, SdkErrorCode } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import type { RunContext } from '../adapters/adapter.js';
import { AppError } from '../domain/errors.js';
import { browserScripts, type BrowserScript } from './browser-scripts.js';
import { terminateOwnedTree } from './process-owner.js';
export type BrowserAction = { kind: 'navigate'; url: string } | { kind: 'read'; script: BrowserScript } | { kind: 'click'; target: string; label: string } | { kind: 'fill'; target: string; text: string; submit?: boolean };
export interface BrowserOptions { command: string; args: string[]; cwd?: string; origins: string[] }
export class BrowserClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private tools = new Map<string, Record<string, unknown>>();
  private connecting: Promise<void> | null = null;
  private connectController: AbortController | null = null;
  private closing: Promise<void> | null = null;
  private invalidated = false;
  constructor(private options: BrowserOptions) {}
  get pid(): number | null { return this.transport?.pid ?? null; }
  private async connect(context?: RunContext): Promise<void> {
    if (this.closing) await this.closing;
    if (this.client) return;
    if (this.connecting) return this.connecting;
    const controller = new AbortController(); this.connectController = controller;
    const signal = context ? AbortSignal.any([controller.signal, context.signal]) : controller.signal;
    const requestOptions = () => ({ signal, timeout: context ? Math.max(1, Math.min(10000, context.deadline - performance.now())) : 10000 });
    this.connecting = (async () => {
      const transport = new StdioClientTransport({ command: this.options.command, args: this.options.args, cwd: this.options.cwd, env: getDefaultEnvironment(), stderr: 'pipe', maxBufferSize: 4 * 1024 * 1024 });
      this.transport = transport; transport.stderr?.on('data', () => {});
      const client = new Client({ name: 'local-social-research-browser-client', version: '0.1.0' });
      try {
        await client.connect(transport, requestOptions());
        const listed = await client.listTools(undefined, requestOptions());
        signal.throwIfAborted();
        for (const tool of listed.tools) this.tools.set(tool.name, tool.inputSchema as Record<string, unknown>);
        for (const [tool, field] of [['browser_navigate', 'url'], ['browser_evaluate', 'function']] as const) {
          const schema = this.tools.get(tool); const properties = schema?.properties as Record<string, { type?: string }> | undefined;
          if (properties?.[field]?.type !== 'string') throw new AppError('INCOMPATIBLE_BROWSER_TOOLS');
        }
        if (!this.tools.has('browser_close')) throw new AppError('INCOMPATIBLE_BROWSER_TOOLS');
        this.client = client;
      } catch (error) {
        try { await this.terminate(transport); } finally { await client.close().catch(() => {}); this.transport = null; this.tools.clear(); }
        throw error instanceof AppError ? error : new AppError('dependency_failure');
      }
    })().finally(() => { this.connecting = null; this.connectController = null; });
    return this.connecting;
  }
  private validateUrl(value: string): void {
    let url: URL; try { url = new URL(value); } catch { throw new AppError('INVALID_SOURCE_URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !this.options.origins.includes(url.origin)) throw new AppError('INVALID_SOURCE_URL');
  }
  private async call(name: string, args: Record<string, unknown>, context: RunContext) {
    context.check(); await this.connect(context); context.check();
    try {
      const value = await this.client!.callTool({ name, arguments: args }, { signal: context.signal, timeout: Math.max(1, Math.min(10000, context.deadline - performance.now())) });
      if (value.isError) throw new AppError('browser_action_failed');
      if (Buffer.byteLength(JSON.stringify(value)) > 2 * 1024 * 1024) throw new AppError('BROWSER_RESPONSE_TOO_LARGE');
      context.check(); return value;
    } catch (error) {
      if (SdkError.isInstance(error)) {
        this.invalidated = true;
        context.check();
        throw new AppError(error.code === SdkErrorCode.RequestTimeout ? 'browser_action_timeout' : 'dependency_failure');
      }
      context.check(); throw error instanceof AppError ? error : new AppError('browser_action_failed');
    }
  }
  private async evaluate(script: BrowserScript, context: RunContext): Promise<unknown> {
    if (!Object.hasOwn(browserScripts, script)) throw new AppError('UNSUPPORTED_BROWSER_ACTION');
    const result = await this.call('browser_evaluate', { function: browserScripts[script] }, context);
    const content = result.content as { type: string; text?: string }[];
    const text = content.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n');
    const matched = /(?:^|\n)### (?:Evaluation result|Result)\r?\n([\s\S]*?)(?=\n### |$)/i.exec(text);
    const raw = (matched?.[1] ?? text).trim().replace(/^```(?:json)?\s*\n/, '').replace(/\n```$/, '');
    try { return JSON.parse(raw) as unknown; } catch { throw new AppError('UNSUPPORTED_BROWSER_OUTPUT'); }
  }
  async execute(action: BrowserAction, context: RunContext): Promise<unknown> {
    context.check();
    if (action.kind === 'navigate') {
      this.validateUrl(action.url); await this.call('browser_navigate', { url: action.url }, context);
      const state = await this.evaluate('state', context) as { url?: unknown };
      if (typeof state.url !== 'string') throw new AppError('UNSUPPORTED_BROWSER_OUTPUT'); this.validateUrl(state.url); return state;
    }
    if (action.kind === 'read') return this.evaluate(action.script, context);
    if (action.kind === 'click' || action.kind === 'fill') {
      await this.connect(context); const name = action.kind === 'click' ? 'browser_click' : 'browser_type';
      const properties = this.tools.get(name)?.properties as Record<string, unknown> | undefined;
      const target = properties?.target ? 'target' : properties?.ref ? 'ref' : null;
      if (!target) throw new AppError('INCOMPATIBLE_BROWSER_TOOLS');
      return this.call(name, action.kind === 'click' ? { [target]: action.target, element: action.label } : { [target]: action.target, text: action.text, submit: action.submit ?? false }, context);
    }
    throw new AppError('UNSUPPORTED_BROWSER_ACTION');
  }
  private async terminate(transport: StdioClientTransport): Promise<void> {
    const owned = transport.pid; if (!owned) return;
    try { process.kill(owned, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return; throw error; }
    try { if (transport.pid === owned) await terminateOwnedTree(owned); }
    catch (error) { try { process.kill(owned, 0); } catch (gone) { if ((gone as NodeJS.ErrnoException).code === 'ESRCH') return; } throw error; }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.connectController?.abort(new AppError('browser_closed'));
    this.closing = this.closeOwned().finally(() => { this.closing = null; });
    return this.closing;
  }
  private async closeOwned(): Promise<void> {
    if (this.connecting) await this.connecting.catch(() => {});
    const client = this.client; const transport = this.transport; if (!transport) return;
    try {
      if (client) {
        if (this.invalidated) { await this.terminate(transport); await client.close(); return; }
        let timer: NodeJS.Timeout | undefined;
        try { await Promise.race([client.callTool({ name: 'browser_close', arguments: {} }, { timeout: 5000 }), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('CLOSE_TIMEOUT')), 5000); })]); }
        catch { await this.terminate(transport); }
        finally { clearTimeout(timer); }
        await client.close();
      } else await transport.close();
    } finally { this.client = null; this.transport = null; this.tools.clear(); this.invalidated = false; }
  }
}
