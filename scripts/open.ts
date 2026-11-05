import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
const { url } = JSON.parse(
  readFileSync(
    join(process.env.QA_DATA_DIR || join(homedir(), '.local/share/ai-native-qa'), 'launch.json'),
    'utf8',
  ),
) as { url: string };
const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
spawn(command, [url], { shell: false, stdio: 'ignore' }).on('error', () => {
  console.error('No local browser launcher available; use the private launch.json URL.');
  process.exitCode = 1;
});
