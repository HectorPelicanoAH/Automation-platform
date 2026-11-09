import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateNewPageLocators } from '../packages/generation/ui-locators.ts';
import {
  preserveExistingCapabilities,
  validateGeneratedFile,
} from '../packages/generation/staging.ts';

const path = 'ui/pages/MenuPage.ts';
const valid = readFileSync('tests/fixtures/LocalizedMenuPage.ts', 'utf8');
test('Readonly constructor locators/factories have exact per-element checks; unsupported layouts fail closed', () => {
  validateGeneratedFile(path, valid);
  validateNewPageLocators(path, null, valid);
  validateNewPageLocators(
    'ui/pages/PromotionsPage.ts',
    null,
    readFileSync('templates/automation/ui/pages/PromotionsPage.ts', 'utf8'),
  );
  assert.throws(
    () =>
      validateNewPageLocators(
        path,
        null,
        valid.replace(
          'await expect(promotions).toHaveCount(1);',
          'await expect(menu).toHaveCount(1);',
        ),
      ),
    /Each new locator/,
  );
  assert.throws(
    () =>
      validateNewPageLocators(
        path,
        null,
        valid.replace('readonly promotionsFor:', 'promotionsFor:'),
      ),
    /readonly/,
  );
  assert.throws(
    () => validateNewPageLocators(path, null, valid.replaceAll('exact: true', 'exact: false')),
    /exact/,
  );
  assert.throws(
    () =>
      validateNewPageLocators(
        path,
        null,
        valid.replace('name: menuLabels[language].promotions', 'name: /Promo/'),
      ),
    /regex/,
  );
  assert.throws(
    () =>
      validateNewPageLocators(
        path,
        null,
        'class MenuPage { async open() { const menu = this.page.getByRole("button", {name:"Menu",exact:true}); await expect(menu).toHaveCount(1); await menu.click(); } }',
      ),
    /constructor/,
  );
});

test('Constructor extension preserves existing parameters, initializers and business assertions', () => {
  const before =
    'class MenuPage { constructor(private readonly page: Page) {} async check() { await expect(this.page).toHaveTitle("Product"); } }';
  const after = before
    .replace('constructor(', 'readonly menu: Locator; constructor(')
    .replace(
      'Page) {}',
      'Page) { this.menu = page.getByRole("button", { name: "Menu", exact: true }); }',
    )
    .replace(
      'async check()',
      'async open() { await expect(this.menu).toHaveCount(1); await this.menu.click(); } async check()',
    );
  validateNewPageLocators(path, before, after);
  preserveExistingCapabilities(before, after, path);
  assert.throws(
    () => preserveExistingCapabilities(before, after.replace('"Product"', '"Other product"'), path),
    /preserved/,
  );
  assert.throws(
    () =>
      preserveExistingCapabilities(
        before,
        after.replace('private readonly page: Page', 'page: Page'),
        path,
      ),
    /preserved/,
  );
  const prior =
    'class MenuPage { readonly menu: Locator; constructor(private readonly page: Page) { this.menu = page.getByTestId("old"); } }';
  assert.throws(
    () => preserveExistingCapabilities(prior, prior.replace('"old"', '"new"'), path),
    /preserved/,
  );
  assert.throws(
    () =>
      preserveExistingCapabilities(
        prior,
        prior.replace(' } }', ' this.menu = page.getByTestId("other"); } }'),
        path,
      ),
    /preserved/,
  );
  // Reusing an untouched legacy method does not silently migrate an imported repository.
  const legacy =
    'class MenuPage { async old() { const menu = this.page.getByRole("button"); await menu.click(); } }';
  validateNewPageLocators(path, legacy, legacy);
});

test('An unawaited/nested check or overwritten field cannot certify a new locator', () => {
  assert.throws(
    () =>
      validateNewPageLocators(
        path,
        null,
        valid.replace(
          'await expect(promotions).toHaveCount(1);',
          'expect(promotions).toHaveCount(1);',
        ),
      ),
    /Each new locator/,
  );
  assert.throws(
    () =>
      validateNewPageLocators(
        path,
        null,
        valid.replace(
          'await expect(promotions).toHaveCount(1);',
          'const unused = async () => { await expect(promotions).toHaveCount(1); };',
        ),
      ),
    /Each new locator/,
  );
  const before =
    'class MenuPage { readonly checkEnabled = true; constructor(private readonly page: Page) {} async check() { if (this.checkEnabled) await expect(this.page).toHaveTitle("Product"); } }';
  assert.throws(
    () =>
      preserveExistingCapabilities(
        before,
        before.replace('checkEnabled = true', 'checkEnabled = false'),
        path,
      ),
    /preserved/,
  );
  const prior =
    'class MenuPage { readonly menu: Locator = originalMenu; constructor(private readonly page: Page) {} }';
  const after = prior.replace(
    'Page) {}',
    'Page) { this.menu = page.getByRole("button", {name:"Other",exact:true}); }',
  );
  assert.throws(() => preserveExistingCapabilities(prior, after, path), /preserved/);
});

test('Preserved business assertions retain significant whitespace inside expected values', () => {
  const before =
    'class MenuPage { async check() { await expect(this.title).toHaveText("Envío gratis"); } }';
  assert.throws(
    () => preserveExistingCapabilities(before, before.replace('Envío gratis', 'Envíogratis'), path),
    /preserved/,
  );
});

test('The generation workflow rejects an imprecise inline Page before staging or target writes', async () => {
  const { generationFixture, fixtureProvider, finished, featurePath } =
    await import('./helpers/generation.ts');
  const p = generationFixture({
    async run(request) {
      const result = await fixtureProvider.run(request);
      if (!JSON.parse(request.prompt).task.startsWith('Discover')) {
        const output = result.output as {
          files: { path: string; content: string }[];
          plan: { files: string[] };
        };
        output.files.push({
          path: 'ui/pages/ImprecisePage.ts',
          content:
            'export class ImprecisePage { async open() { const menu = this.page.getByRole("button", {name:"Promoción"}); await expect(menu).toHaveCount(1); await menu.click(); } }',
        });
        output.plan.files.push('ui/pages/ImprecisePage.ts');
      }
      return result;
    },
  });
  try {
    const analysis = await finished(
      p,
      (
        await p.generation.analyze({
          targetId: p.target.id,
          recordingId: p.recordingId,
          featurePath,
          sourceIds: [],
        })
      ).id,
    );
    const contract = p.generation.repository.get('contracts', analysis.contractId!);
    const approved = p.generation.review(contract.id, {
      expectedHash: contract.hash,
      gherkin: contract.gherkin,
      approve: true,
      answers: contract.questions.map((q) => ({
        id: q.id,
        text: 'Confirmed synthetic demonstration intent',
      })),
    });
    const implementation = await finished(
      p,
      (await p.generation.implement(contract.id, approved.hash)).id,
    );
    assert.equal(implementation.status, 'FAILED');
    assert.match(implementation.error!, /constructor/);
    assert.equal(p.generation.repository.list('changes').length, 0);
    assert.equal(p.store.list('runs').length, 0);
  } finally {
    await p.app.close();
  }
});
