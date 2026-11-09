import { expect, type Locator, type Page } from '@playwright/test';
import type { CustomerContext } from '../builders/customer';

export class PromotionsPage {
  readonly documentRoot: Locator;
  readonly card: Locator;
  readonly heading: Locator;
  readonly amount: Locator;
  readonly subtitle: Locator;

  constructor(private readonly page: Page) {
    // Lazy definitions only: constructing a Page must not validate unrelated elements.
    this.documentRoot = page.locator('html');
    // The demo deliberately uses this invariant accessible region name in both languages.
    this.card = page.getByRole('region', { name: 'Free shipping promotion', exact: true });
    this.heading = this.card.getByRole('heading');
    this.amount = this.card.getByTestId('promotion-amount');
    this.subtitle = this.card.getByTestId('promotion-subtitle');
  }

  async visit(context: CustomerContext) {
    await this.page.goto(`/promotions?${new URLSearchParams({ ...context })}`);
    await expect(this.documentRoot).toHaveAttribute('lang', context.languageIso);
  }

  async expectPromotion(title: string, amount: string, subtitle: string) {
    // Only the three observable fields explicitly required by the canonical Then step.
    await expect(this.card).toHaveCount(1);
    await expect(this.heading).toHaveCount(1);
    await expect(this.heading).toBeVisible();
    await expect(this.heading).toHaveText(title);
    await expect(this.amount).toHaveCount(1);
    await expect(this.amount).toBeVisible();
    await expect(this.amount).toHaveText(amount);
    await expect(this.subtitle).toHaveCount(1);
    await expect(this.subtitle).toBeVisible();
    await expect(this.subtitle).toHaveText(subtitle);
  }
}
