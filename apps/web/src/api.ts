import type { Run, Source, Target } from '../../../packages/domain/model.ts';
export interface State {
  csrf: string;
  sources: Source[];
  targets: Target[];
  runs: Run[];
  settings: { baseUrl: string; retentionDays: number };
  versions: { node: string; sqlite: string };
}
let csrf = '';
export const setCsrf = (value: string) => {
  csrf = value;
};
export async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch('/api' + path, {
    method: body === undefined ? 'GET' : method,
    headers: {
      'Content-Type': 'application/json',
      'X-QA-CSRF': csrf,
      'X-QA-Session': sessionStorage.getItem('qa-session-proof') || '',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result as T;
}
