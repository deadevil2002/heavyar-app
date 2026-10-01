import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpmCli = process.env.npm_execpath;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!pnpmCli) throw new Error('Run this command through pnpm');
run(process.execPath, [pnpmCli, '--dir', 'artifacts/heavyar-admin', 'run', 'test:vitest']);
run(process.execPath, [
  '--import', 'tsx', '--test',
  'artifacts/heavyar-admin/src/lib/admin-ux.test.ts',
  'artifacts/heavyar-admin/src/lib/app-feedback-contract.test.ts',
  'artifacts/heavyar-admin/src/lib/commercial-contract.test.ts',
  'artifacts/heavyar-admin/src/lib/early-access-hooks.test.ts',
  'artifacts/heavyar-admin/src/lib/operations-contract.test.ts',
  'artifacts/heavyar-admin/src/lib/query-policy.test.ts',
  'artifacts/heavyar-admin/src/lib/seo-permissions.test.ts',
  'artifacts/heavyar-admin/src/lib/seo-quality-labels.test.ts',
]);
