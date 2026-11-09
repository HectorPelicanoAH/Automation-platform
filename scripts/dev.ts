import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const build = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--config', 'apps/web/vite.config.ts'],
  { stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status || 1);
const demo = spawn(process.execPath, ['--import', 'tsx', 'apps/demo/main.ts'], {
  stdio: 'inherit',
});
const server = spawn(process.execPath, ['--import', 'tsx', 'apps/server/main.ts'], {
  stdio: 'inherit',
});
const stop = () => {
  demo.kill('SIGTERM');
  server.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
demo.on('exit', stop);
server.on('exit', stop);
console.log(`Workspace: ${resolve('.')}. Open a private session using pnpm open.`);
