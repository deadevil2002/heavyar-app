import { rmSync } from 'node:fs';

if (!process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  console.error('Use pnpm instead');
  process.exit(1);
}

rmSync('package-lock.json', { force: true });
rmSync('yarn.lock', { force: true });
