import { expect, type APIRequestContext } from '@playwright/test';
import type { CustomerContext } from './customer';

/** Mutates only the owned synthetic demo. Caller must authorize the selected environment. */
export async function prepareGuestContext(
  request: APIRequestContext,
  baseUrl: string,
  customer: CustomerContext,
) {
  const response = await request.post(new URL('/api/demo/contexts', baseUrl).href, {
    data: customer,
  });
  expect(response.status()).toBe(201);
  const prepared = await response.json();
  expect(prepared).toEqual({ ...customer, id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  return { ...customer, contextId: prepared.id as string };
}
