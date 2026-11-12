import { test, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
test('real competing processes have one owner and a killed owner releases its OS lock', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'research-owner-')); const children: ChildProcess[] = [];
  const start = () => { const child = spawn(process.execPath, [resolve('tests/fixtures/lock-holder.mjs'), directory], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); children.push(child); child.stderr!.resume(); const lines = createInterface({ input: child.stdout! }); return { child, result: once(lines, 'line').then(([line]) => String(line)) }; };
  const stop = async (child: ChildProcess) => { if (child.exitCode !== null || child.signalCode !== null) return; const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; };
  try {
    const one = start(); const two = start(); const results = await Promise.all([one.result, two.result]);
    expect(results.filter(value => value === 'LOCKED')).toHaveLength(1); expect(results.filter(value => value === 'PROFILE_IN_USE')).toHaveLength(1);
    await stop(results[0] === 'LOCKED' ? one.child : two.child);
    const afterCrash = start(); expect(await afterCrash.result).toBe('LOCKED'); await stop(afterCrash.child);
  } finally { for (const child of children) await stop(child); rmSync(directory, { recursive: true, force: true }); }
});
