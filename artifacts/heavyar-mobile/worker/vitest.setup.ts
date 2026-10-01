import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { expect } from 'vitest';

expect.extend({
  toBeString(received: unknown) {
    const pass = typeof received === 'string';
    return {
      pass,
      message: () => `expected ${String(received)} ${pass ? 'not ' : ''}to be a string`,
    };
  },
});

const portablePath = (path: string) => path.startsWith('/tmp/')
  ? join(tmpdir(), basename(path))
  : path;

(globalThis as unknown as { Bun: {
  write(path: string, data: Uint8Array): Promise<number>;
  spawnSync(command: string[]): { exitCode: number; stdout: Uint8Array; stderr: Uint8Array };
} }).Bun = {
  async write(path: string, data: Uint8Array) {
    await writeFile(portablePath(path), data);
    return data.byteLength;
  },
  spawnSync(command: string[]) {
    const [executable, ...rawArgs] = command;
    const args = rawArgs.map(portablePath);
    const portableExecutable = executable === 'unzip' ? 'tar' : executable;
    const portableArgs = executable === 'unzip' && args[0] === '-t'
      ? ['-tf', ...args.slice(1)]
      : args;
    const result = spawnSync(portableExecutable, portableArgs);
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? new Uint8Array(),
      stderr: result.stderr ?? new Uint8Array(),
    };
  },
};
