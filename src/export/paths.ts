import { mkdir, realpath, lstat } from 'node:fs/promises';
import { basename, isAbsolute, resolve, dirname } from 'node:path';
import { AppError } from '../domain/errors.js';
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
export async function ownedRoot(root: string): Promise<string> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  if ((await lstat(root)).isSymbolicLink() || !samePath(await realpath(root), resolve(root))) throw new AppError('UNSAFE_OUTPUT_PATH');
  return resolve(root);
}
export function safeFilename(name: string, format: string): string {
  if (isAbsolute(name) || basename(name) !== name || /[\\/:\x00-\x1f]/.test(name) || name.includes('..') || name.startsWith('.') || /[ .]$/.test(name) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name) || !name.endsWith(`.${format}`)) throw new AppError('INVALID_EXPORT_FILENAME');
  return name;
}
export async function assertOwnedFile(path: string, root: string): Promise<void> {
  if (!samePath(dirname(resolve(path)), await ownedRoot(root))) throw new AppError('UNSAFE_OUTPUT_PATH');
  try { if ((await lstat(path)).isSymbolicLink() || !samePath(await realpath(path), resolve(path))) throw new AppError('UNSAFE_OUTPUT_PATH'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
