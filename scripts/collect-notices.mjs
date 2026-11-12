import { readFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
const root = process.cwd();
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
let count = 0;
for (const [entry, metadata] of Object.entries(lock.packages)) {
  if (!entry || metadata.dev === true) continue;
  const source = resolve(root, entry);
  if (!source.startsWith(join(root, 'node_modules') + sep) || !existsSync(source)) continue;
  const files = readdirSync(source, { withFileTypes: true }).filter(file => file.isFile() && /LICENSE|LICENCE|NOTICE|COPYING/i.test(file.name));
  if (!files.length) continue;
  const slug = entry.replaceAll('node_modules/', '').replaceAll('/', '__').replaceAll('@', '');
  const target = join(root, 'third-party-licenses', slug); mkdirSync(target, { recursive: true });
  for (const file of files) { copyFileSync(join(source, file.name), join(target, file.name)); count++; }
}
console.log(`Preserved ${count} installed runtime license/notice files.`);
