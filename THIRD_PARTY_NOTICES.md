# Third-party notices

Original platform and starter source is MIT licensed; dependency licenses remain their own. Exact JavaScript dependencies and integrity hashes are recorded in `pnpm-lock.yaml` and the independent UI lockfile. Java dependencies and checksums are recorded in the API starter's Gradle lock and verification metadata.

- Gradle 9.2.1 wrapper scripts/JAR are unmodified upstream distribution files under Apache-2.0. Its original license is retained in `templates/automation/api/gradle/LICENSE`; wrapper source headers retain their notices. Wrapper JAR SHA-256: `423cb469ccc0ecc31f0e4e1c309976198ccb734cdcbb7029d4bda0f18f57e8d9`.
- Playwright is Apache-2.0; Playwright-BDD, React, Fastify, Vite, TypeScript tooling and better-sqlite3 carry their upstream licenses in installed packages. Browser/runtime downloads retain their own licenses and are not committed here.
- Karate and JUnit dependencies retain their distribution licenses. This project uses the open-source Karate core; no commercial Karate service is required.

Do not replace third-party notices with the platform's MIT notice. This inventory describes direct components; audit the resolved dependency distribution before packaging or redistribution. The repository does not vendor the dependency trees or JDK/browser installations.
