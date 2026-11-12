import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
export async function terminateOwnedTree(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) throw new Error('INVALID_OWNED_PID');
  if (process.platform === 'win32') { await execute('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 2000 }); }
  else {
    const { stdout } = await execute('ps', ['-eo', 'pid=,ppid='], { timeout: 2000 });
    const pairs = stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number)); const owned = new Set([pid]);
    let changed = true; while (changed) { changed = false; for (const [child, parent] of pairs) if (child && parent && owned.has(parent) && !owned.has(child)) { owned.add(child); changed = true; } }
    for (const child of [...owned].reverse()) try { process.kill(child, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  }
}
