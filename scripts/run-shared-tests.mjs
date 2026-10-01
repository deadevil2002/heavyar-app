import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['lib', 'scripts'];
const tests = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) tests.push(path);
  }
}

for (const root of roots) collect(root);

if (tests.length) {
  console.error(`Shared/root tests need a configured runner: ${tests.join(', ')}`);
  process.exit(1);
}

console.log('Shared/root tests: 0 files');
