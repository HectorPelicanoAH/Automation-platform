import { expect, type Locator, type Page } from '@playwright/test';

export type MenuLanguage = 'es' | 'pt';
// Explicit synthetic application labels, not translations inferred from country or UI settings.
export const menuLabels = {
  es: { menu: 'Mujer', promotions: 'Promoción' },
  pt: { menu: 'Mulher', promotions: 'Promoções' },
} as const;

export class LocalizedMenuPage {
  readonly documentRoot: Locator;
  readonly menuFor: (language: MenuLanguage) => Locator;
  readonly promotionsFor: (language: MenuLanguage) => Locator;

  constructor(private readonly page: Page) {
    this.documentRoot = page.locator('html');
    this.menuFor = (language) =>
      page.getByRole('button', { name: menuLabels[language].menu, exact: true });
    this.promotionsFor = (language) =>
      page.getByRole('link', { name: menuLabels[language].promotions, exact: true });
  }

  async activeLanguage(): Promise<MenuLanguage> {
    const raw = await this.documentRoot.getAttribute('lang');
    const language = raw?.toLowerCase().split('-')[0];
    if (language !== 'es' && language !== 'pt')
      throw new Error('Unsupported or missing page language: ' + raw);
    return language;
  }

  async openPromotions(expectedLanguage?: MenuLanguage) {
    if (expectedLanguage)
      await expect(this.documentRoot).toHaveAttribute(
        'lang',
        new RegExp('^' + expectedLanguage + '(?:-[a-z0-9-]+)?$', 'i'),
      );
    const language = await this.activeLanguage();
    const menu = this.menuFor(language);
    await expect(menu).toHaveCount(1);
    await menu.click();
    const promotions = this.promotionsFor(language);
    await expect(promotions).toHaveCount(1);
    await promotions.click();
  }
}
