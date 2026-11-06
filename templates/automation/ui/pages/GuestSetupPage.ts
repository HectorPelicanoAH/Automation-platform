import { expect, type Page } from '@playwright/test';
import type { CustomerContext } from '../builders/customer';

/** Serial UI setup equivalent to the explicit API preparation helper. */
export class GuestSetupPage {
  constructor(private readonly page: Page) {}
  async prepare(baseUrl: string, customer: CustomerContext) {
    await this.page.goto(new URL('/demo/setup', baseUrl).href);
    const country = this.page.getByRole('combobox', { name: 'Country', exact: true });
    const language = this.page.getByRole('combobox', { name: 'Language', exact: true });
    const brand = this.page.getByRole('textbox', { name: 'Brand', exact: true });
    const submit = this.page.getByRole('button', { name: 'Create context', exact: true });
    for (const locator of [country, language, brand, submit]) await expect(locator).toHaveCount(1);
    await country.selectOption(customer.countryIso);
    await language.selectOption(customer.languageIso);
    await brand.fill(customer.brand);
    await submit.click();
    await expect(this.page).toHaveURL(/\/promotions\?contextId=[0-9a-f-]+$/);
    const contextId = new URL(this.page.url()).searchParams.get('contextId');
    expect(contextId).toMatch(/^[0-9a-f-]{36}$/);
    return { ...customer, contextId: contextId! };
  }
}
