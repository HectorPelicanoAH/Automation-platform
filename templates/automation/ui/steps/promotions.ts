import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures';
import { guestCustomer } from '../builders/customer';

const { Given, When, Then } = createBdd(test);

Given(
  'a guest customer from {string} using language {string} and brand {string}',
  async ({ customer }, countryIso: string, languageIso: string, brand: string) => {
    Object.assign(customer, guestCustomer({ countryIso, languageIso, brand }));
  },
);
When('the customer visits the promotions page', async ({ promotions, customer }) => {
  await promotions.visit(customer);
});
Then(
  'the free shipping promotion shows title {string}, discount {string} and subtitle {string}',
  async ({ promotions }, title: string, amount: string, subtitle: string) => {
    await promotions.expectPromotion(title, amount, subtitle);
  },
);
