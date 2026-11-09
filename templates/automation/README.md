# Independent functional automation

This directory is a separate automation project. No platform application or source repository is needed to run it. It contains business Gherkin under `contracts/`, a Playwright-BDD UI project under `ui/`, and a Karate/Gradle API project under `api/`.

Prerequisites: Node 24.22.2, pnpm 11.25.0, Java 21.0.13+9, and an available Chromium. Run the promotion demo (or a reviewed compatible implementation) at `http://127.0.0.1:4311`, or set `QA_BASE_URL` to an authorized environment.

```sh
pnpm --dir ui install --frozen-lockfile
pnpm --dir ui exec playwright install chromium
pnpm --dir ui test
cd api
./gradlew test --no-daemon
```

Initial setup downloads dependencies. Subsequent API runs can use `--offline`; the platform uses this flag so it never silently installs imported projects. `QA_REPORT_DIR` selects native output outside the default runner folders. Keep logs/reports/authentication state out of Git.

The canonical business feature drives the UI compiler. Karate has separate technical features and assertions, linked by the portable manifest. UI checks prove visible text and region; API checks prove HTTP/schema/business state. A passing API never proves rendering. `discount` is an illustrative displayed amount; `thresholdMinor` represents the minimum order value in minor units.

Every canonical scenario intended for individual selection has a unique `@scenario:<id>` tag. Do not duplicate it. Example-row filtering is not supported by the platform adapter yet. Outline datasets are still genuinely executed by both native runners.

When canonical Gherkin changes, review the corresponding API assertions separately. Only after that review update the feature's `canonicalHash` in `contracts/manifest.json` to the SHA-256 of the exact feature bytes. The platform rejects stale API bindings instead of pretending they validate a new contract. The manifest's illustrative row IDs are portable metadata; native report row attribution remains unknown when not directly exposed.

Only trust reviewed execution configurations. npm/Playwright configs, Gradle scripts and Karate helpers run code with your OS permissions. Use an explicitly authorized test environment. The platform does not sandbox arbitrary test code.
