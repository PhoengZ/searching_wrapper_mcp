import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Config } from '../config.js';
import type { BrowserOptions } from './playwright-client.js';
const require = createRequire(import.meta.url);
export function browserOptions(config: Config): BrowserOptions {
  const metadataPath = require.resolve('@playwright/mcp/package.json');
  const metadata = require('@playwright/mcp/package.json') as { version: string; bin: Record<string, string> };
  if (metadata.version !== '0.0.85') throw new Error('UNTESTED_PLAYWRIGHT_VERSION');
  const output = join(config.dataDir, 'browser-output'); mkdirSync(output, { recursive: true, mode: 0o700 });
  return { command: process.execPath, args: [join(dirname(metadataPath), metadata.bin['playwright-mcp']!), '--browser', config.browser, '--user-data-dir', join(config.dataDir, 'profile'), '--output-dir', output, '--codegen', 'none', '--no-webmcp', '--block-service-workers', '--console-level', 'error', '--timeout-action', '5000', '--timeout-navigation', '10000', '--timeout-settle', '500', ...(config.headless ? ['--headless'] : [])], cwd: config.dataDir, origins: ['https://www.facebook.com', 'https://facebook.com', 'https://m.facebook.com'] };
}
