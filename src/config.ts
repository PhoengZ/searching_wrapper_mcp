import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { AppError } from './domain/errors.js';
const configuration = z.object({
  limits: z.object({ max_posts: z.number().int().min(1).max(100).default(100), max_comments_per_post: z.number().int().min(1).max(100).default(100), max_total_comments: z.number().int().min(1).max(1000).default(1000), max_duration_seconds: z.number().int().min(1).max(600).default(600), max_candidates: z.number().int().min(1).max(10).default(10), max_discovery_seconds: z.number().int().min(1).max(120).default(120), max_queue: z.number().int().min(1).max(1000).default(20), max_text_length: z.number().int().min(100).max(20000).default(20000) }).strict().prefault({}),
  retention_days: z.number().int().min(0).max(36500).default(30), export_dir: z.string().optional(),
  authorization: z.object({ facebook: z.object({ discovery_allowed: z.boolean().default(false), collection_scope: z.enum(['none', 'listed_sources', 'platform']).default('none'), source_urls: z.array(z.string().url()).max(1000).default([]) }).strict().prefault({}) }).strict().prefault({}),
}).strict();
export type Config = z.infer<typeof configuration> & { dataDir: string; mode: 'mock' | 'facebook'; exportDir: string };
export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  try {
    if (env.WRAPPER_CONFIG_FILE && !isAbsolute(env.WRAPPER_CONFIG_FILE)) throw new Error('Absolute config path required');
    const parsed = configuration.parse(env.WRAPPER_CONFIG_FILE ? JSON.parse(readFileSync(env.WRAPPER_CONFIG_FILE, 'utf8')) : {});
    const mode = z.enum(['mock', 'facebook']).parse(env.WRAPPER_MODE ?? 'facebook');
    const dataDir = resolve(env.WRAPPER_DATA_DIR ?? join(env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'local-social-research-mcp'));
    if (parsed.export_dir && !isAbsolute(parsed.export_dir)) throw new Error('Absolute export path required');
    return { ...parsed, mode, dataDir, exportDir: resolve(parsed.export_dir ?? join(dataDir, 'exports')) };
  } catch { throw new AppError('INVALID_CONFIGURATION'); }
}
