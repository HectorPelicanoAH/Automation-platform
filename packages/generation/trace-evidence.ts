import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { hash } from '../domain/gherkin.ts';
import type { Run } from '../domain/model.ts';
import { safeText } from '../recording/privacy.ts';
import { redact } from '../execution/reports.ts';

// Read only bounded trace event members in memory: never extract files, resources or network bodies.
export function traceEvents(zip: Buffer) {
  if (zip.length > 32_000_000) throw new Error('Trace exceeds 32 MB');
  let end = -1;
  for (let n = zip.length - 22; n >= Math.max(0, zip.length - 65557); n--)
    if (zip.readUInt32LE(n) === 0x06054b50 && n + 22 + zip.readUInt16LE(n + 20) === zip.length) {
      end = n;
      break;
    }
  if (end < 0) throw new Error('Invalid ZIP directory');
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16),
    total = 0;
  if (count > 2000 || zip.readUInt16LE(end + 4) || zip.readUInt16LE(end + 6))
    throw new Error('Unsupported ZIP directory');
  const records: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || zip.readUInt32LE(cursor) !== 0x02014b50)
      throw new Error('Invalid ZIP entry');
    const flags = zip.readUInt16LE(cursor + 8),
      method = zip.readUInt16LE(cursor + 10);
    const size = zip.readUInt32LE(cursor + 24),
      packed = zip.readUInt32LE(cursor + 20);
    const offset = zip.readUInt32LE(cursor + 42),
      length = zip.readUInt16LE(cursor + 28);
    const name = zip.subarray(cursor + 46, cursor + 46 + length).toString('utf8');
    cursor += 46 + length + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
    if (!/^(?:[A-Za-z0-9_-]+[.-])?trace\.trace$/.test(name)) continue;
    if (flags & 1 || ![0, 8].includes(method) || size > 4_000_000 || (total += size) > 8_000_000)
      throw new Error('Trace event budget or encoding unsupported');
    if (offset + 30 > zip.length || zip.readUInt32LE(offset) !== 0x04034b50)
      throw new Error('Invalid local entry');
    const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    if (start + packed > zip.length) throw new Error('Truncated entry');
    const bytes = zip.subarray(start, start + packed);
    const raw = method === 8 ? inflateRawSync(bytes, { maxOutputLength: 4_000_000 }) : bytes;
    if (raw.length !== size) throw new Error('Trace length mismatch');
    for (const line of raw.toString('utf8').split('\n')) {
      if (!line || line.length > 64000) continue;
      const e = JSON.parse(line);
      if (!['before', 'after', 'log'].includes(e.type)) continue;
      // Explicit field allowlist. No request/response, form values, source, DOM or screenshots.
      const clip = (v: unknown) =>
        typeof v === 'string' ? safeText(redact(v)).slice(0, 1500) : undefined;
      records.push({
        member: name,
        type: e.type,
        callId: clip(e.callId),
        apiName: clip(e.apiName),
        method: clip(e.method),
        selector: clip(e.params?.selector),
        expression: clip(e.params?.expression),
        expectedNumber:
          typeof e.params?.expectedNumber === 'number' ? e.params.expectedNumber : undefined,
        isNot: typeof e.params?.isNot === 'boolean' ? e.params.isNot : undefined,
        message: clip(e.message),
        error: clip(typeof e.error === 'string' ? e.error : e.error?.message),
        stack: Array.isArray(e.stack)
          ? e.stack.slice(0, 4).map((s: Record<string, unknown>) => ({
              function: clip(s.function),
              line: typeof s.line === 'number' ? s.line : undefined,
            }))
          : undefined,
      });
      if (records.length > 10000) throw new Error('Trace event count exceeded');
    }
  }
  const identity = (record: Record<string, unknown>) => record.member + ':' + record.callId;
  const failedIds = new Set(records.filter((r) => r.error).map(identity));
  const focused = records.filter((r) => failedIds.has(identity(r)));
  return [
    ...focused.filter((r) => r.type !== 'log').slice(-12),
    ...focused.filter((r) => r.type === 'log').slice(-8),
    ...records.filter((r) => !failedIds.has(identity(r))).slice(-4),
  ];
}
export function runTraceEvidence(run: Run, directory: string) {
  const traces = run.artifacts.filter((a) => /(?:^|\/)trace\.zip$/.test(a.name)).slice(0, 2);
  return traces.map((artifact) => {
    const provenance = { runId: run.id, artifact: artifact.name, hash: artifact.hash };
    try {
      const path = resolve(join(directory, artifact.name));
      if (
        realpathSync(directory) !== directory ||
        !path.startsWith(directory + sep) ||
        realpathSync(path) !== path ||
        statSync(path).size > 32_000_000
      )
        throw new Error('Trace path or budget denied');
      const bytes = readFileSync(path);
      if (hash(bytes) !== artifact.hash) throw new Error('Trace integrity changed');
      const events = traceEvents(bytes);
      if (!events.length) throw new Error('No supported trace events');
      // Keep transport context bounded as well as archive decompression.
      let budget = 0;
      return {
        ...provenance,
        status: 'AVAILABLE',
        events: events.filter((e) => (budget += Buffer.byteLength(JSON.stringify(e))) <= 16000),
      };
    } catch {
      return {
        ...provenance,
        status: 'UNAVAILABLE',
        reason: 'Trace missing, expired, changed, unsupported or exceeds safe extraction limits',
      };
    }
  });
}
