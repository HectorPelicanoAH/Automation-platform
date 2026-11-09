import process from 'node:process';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import { readFileSync } from 'node:fs';
const text = readFileSync(process.argv[2], 'utf8');
if (Buffer.byteLength(text) > 64000) throw new Error('Input exceeds summary budget');
const input = JSON.parse(text);
if (!Array.isArray(input) || input.length > 100)
  throw new Error('Expected at most 100 redacted findings');
for (const item of input) {
  if (
    !item ||
    typeof item !== 'object' ||
    typeof item.root !== 'string' ||
    typeof item.fingerprint !== 'string' ||
    !['INFO', 'WARNING', 'ERROR'].includes(item.severity) ||
    !Array.isArray(item.evidence) ||
    item.evidence.some((s) => typeof s !== 'string')
  )
    throw new Error('Unsupported finding input');
}
const groups = new Map();
for (const item of input) {
  const key = JSON.stringify([item.root, item.fingerprint, item.severity]);
  const prior = groups.get(key);
  if (prior) {
    prior.occurrences++;
    prior.evidence = [...new Set([...prior.evidence, ...item.evidence])];
  } else
    groups.set(key, {
      root: item.root,
      fingerprint: item.fingerprint,
      severity: item.severity,
      evidence: [...new Set(item.evidence)],
      occurrences: 1,
    });
}
log(JSON.stringify({ findings: [...groups.values()] }));
