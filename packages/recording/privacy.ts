import { AppError } from '../domain/model.ts';
import type { CapturePolicy } from './model.ts';

export function recordingUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, 'Choose an absolute HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new AppError(400, 'Recording requires HTTP(S), without URL credentials');
  return url;
}
export function controlOrigin(candidate: string, control: string) {
  const a = new URL(candidate);
  const b = new URL(control);
  const local = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
  return a.origin === b.origin || (local(a.hostname) && local(b.hostname) && a.port === b.port);
}
export function policyFor(input: CapturePolicy, control: string): CapturePolicy {
  const url = recordingUrl(input.url);
  const origins = [
    ...new Set([url.origin, ...input.allowedOrigins.map((value) => recordingUrl(value).origin)]),
  ];
  if (origins.length > 16 || origins.some((origin) => controlOrigin(origin, control)))
    throw new AppError(
      403,
      'Recorder cannot access the platform control origin; maximum 16 application origins',
    );
  if (
    input.maskSelectors.some((s) => s.length > 256 || !s.trim()) ||
    input.maskSelectors.length > 16
  )
    throw new AppError(400, 'Use at most 16 bounded masking selectors');
  return { ...input, url: url.href, allowedOrigins: origins };
}
export function safeUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '[non-http URL omitted]';
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, '[REDACTED]');
    // Long path components may be access tokens. Query values are always suppressed.
    url.pathname = url.pathname
      .split('/')
      .map((part) => (part.length > 48 ? '[REDACTED]' : part))
      .join('/');
    return url.href.slice(0, 2048);
  } catch {
    return '[URL omitted]';
  }
}
export function safeText(value: string, secrets: string[] = []) {
  let text = value.slice(0, 8000);
  for (const secret of secrets.filter((v) => v.length >= 2).slice(0, 256))
    text = text.split(secret).join('[REDACTED]');
  text = text
    .replace(/https?:\/\/[^\s"<>]+/g, (value) => safeUrl(value))
    .replace(/([?&][^\s=&]+)=([^\s&"<>]+)/g, '$1=[REDACTED]');
  return text
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(
      /((?:password|secret|token|api[-_]?key|authorization|cookie)\s*[:=]\s*)[^\s,;"<>]+/gi,
      '$1[REDACTED]',
    )
    .replace(/[A-Za-z0-9_+/=-]{48,}/g, '[REDACTED]');
}
