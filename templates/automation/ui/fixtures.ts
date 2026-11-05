import { test as base } from 'playwright-bdd';
import { PromotionsPage } from './pages/PromotionsPage';
import { guestCustomer, type CustomerContext } from './builders/customer';

export const test = base.extend<{
  promotions: PromotionsPage;
  customer: CustomerContext;
}>({
  promotions: async ({ page }, use) => {
    await use(new PromotionsPage(page));
  },
  customer: async ({}, use) => {
    await use(guestCustomer());
  },
});
