import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createPlatform } from './app.ts';

const dataDir = process.env.QA_DATA_DIR || join(homedir(), '.local/share/ai-native-qa');
const port = Number(process.env.PORT || 4310);
const { app, launchToken } = createPlatform({ dataDir });
const address = await app.listen({ host: '127.0.0.1', port });
writeFileSync(
  resolve(dataDir, 'launch.json'),
  JSON.stringify({ url: `${address}/#launch=${launchToken}` }),
  { mode: 0o600 },
);
console.log(`QA platform ready at ${address}; use pnpm open for the private launch link.`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
