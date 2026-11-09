import { test, expect } from '@playwright/test';
import { LocalizedMenuPage, menuLabels, type MenuLanguage } from './fixtures/LocalizedMenuPage.ts';
const content = (language: MenuLanguage, duplicates = false) =>
  `<!doctype html><html lang="${language}-XX"><body><button onclick="document.querySelector('nav').hidden=false">${menuLabels[language].menu}</button><nav hidden><a href="#promotions">${menuLabels[language].promotions}</a>${duplicates ? `<a href="#other">${menuLabels[language].promotions}</a>` : ''}</nav></body></html>`;

test('One Page instance resolves observed Spanish and Portuguese labels after language switches', async ({
  page,
}) => {
  const menu = new LocalizedMenuPage(page);
  for (const language of ['es', 'pt'] as const) {
    await page.goto('about:blank');
    await page.setContent(content(language));
    await expect(
      page.getByRole('button', { name: menuLabels[language].promotions, exact: true }),
    ).toHaveCount(0);
    await menu.openPromotions(language);
    expect(new URL(page.url()).hash).toBe('#promotions');
    const other = language === 'es' ? 'pt' : 'es';
    await expect(menu.promotionsFor(other)).toHaveCount(0);
  }
  await page.setContent('<html lang="en"><body><a href="#wrong">Promoción</a></body></html>');
  await expect(menu.activeLanguage()).rejects.toThrow('Unsupported or missing page language');
  await page.setContent('<html><body></body></html>');
  await expect(menu.activeLanguage()).rejects.toThrow('Unsupported or missing page language');
});

test('Ambiguous localized links fail real uniqueness validation; no first/force/retries select a substitute', async ({
  page,
}) => {
  await page.setContent(content('pt', true));
  const menu = new LocalizedMenuPage(page);
  await expect(menu.openPromotions('pt')).rejects.toThrow(/toHaveCount/);
  expect(new URL(page.url()).hash).not.toBe('#promotions');
});

test('A locale mismatch never falls back to a matching label from another language', async ({
  page,
}) => {
  await page.setContent(content('es').replace('lang="es-XX"', 'lang="pt-XX"'));
  const menu = new LocalizedMenuPage(page);
  await expect(menu.openPromotions('pt')).rejects.toThrow(/toHaveCount/);
  expect(new URL(page.url()).hash).not.toBe('#promotions');
});
