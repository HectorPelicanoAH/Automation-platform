# UI project

Run `pnpm install --frozen-lockfile`, install Chromium with `pnpm exec playwright install chromium`, then `pnpm test`. Set `QA_BASE_URL` if not using the local demo. The project reads `../contracts/features` using Playwright-BDD's explicit `featuresRoot` and includes the custom shared fixture in its step discovery.

Business steps delegate to `PromotionsPage`. Fixtures isolate customer context per test; scenarios run with two workers and zero retries. The accessible region and title use semantic roles; the displayed amount uses an intentional stable test identifier. Assertions validate uniqueness and visibility.

Generated `.features-gen` files are disposable. Native JSON, HTML, screenshot and failure trace output is under `test-results` or `QA_REPORT_DIR`. Do not commit captured secrets or weaken assertions to hide failures.
