import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import { resolve } from 'node:path';

const testDir = defineBddConfig({
  featuresRoot: '../contracts/features',
  features: '../contracts/features/**/*.feature',
  steps: ['steps/**/*.ts', 'fixtures.ts'],
});

export default defineConfig({
  testDir,
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30_000,
  outputDir: resolve(process.env.QA_REPORT_DIR || 'test-results', 'artifacts'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(process.env.QA_REPORT_DIR || 'test-results', 'results.json') }],
    [
      'html',
      { outputFolder: resolve(process.env.QA_REPORT_DIR || 'test-results', 'html'), open: 'never' },
    ],
  ],
  use: {
    baseURL: process.env.QA_BASE_URL || 'http://127.0.0.1:4311',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
