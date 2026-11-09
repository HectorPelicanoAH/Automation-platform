export interface CustomerContext {
  countryIso: string;
  languageIso: string;
  brand: string;
}

/** Synthetic guest data. Each call returns independent per-scenario state. */
export function guestCustomer(overrides: Partial<CustomerContext> = {}): CustomerContext {
  return { countryIso: 'es', languageIso: 'es', brand: 'demo', ...overrides };
}
