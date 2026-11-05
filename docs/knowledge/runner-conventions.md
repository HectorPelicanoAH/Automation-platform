# Verified starter conventions

Scope: Phase 1 synthetic promotion target. These are engineering conventions backed by local execution, not discovered business rules for external applications.

- Playwright-BDD 9.2.1 with Playwright 1.65.0 accepts features outside `ui/` when `featuresRoot` is explicit and the custom fixture is included in step discovery. `importTestFrom` is unnecessary for this configuration.
- Playwright native JSON example lines refer to generated tests; do not mistake them for canonical Examples row lines. Retain native identity and nullable row mapping.
- Karate 2.1.4 executes under Java 21 through its core Runner API and JUnit/Gradle without preview flags in this starter. Cucumber JSON retains expanded step/request data and scenario tags, but stable example row identity is not directly available in the consumed report.
- Nested CLI validation inside a Playwright worker must strip that worker's identity/config environment. The platform's ordinary execution adapter already uses a small allowlist rather than inheriting provider/test environment wholesale.
- The UI-only wrong-amount fixture changes rendering, not API business state. It must fail visible UI assertions while correct API coverage stays separate.

Sources: [starter UI](../../templates/automation/ui/README.md), [starter API](../../templates/automation/api/README.md), [acceptance harness](../../tests/acceptance.spec.ts), [phase report](../phase-1-report.md). These conventions should be revalidated when locked versions or adapter/report schemas change. No active skill is installed by this record.
