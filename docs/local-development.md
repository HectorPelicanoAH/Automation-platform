# Local development and execution

## Pinned toolchain

| Component                        | Version / evidence                                                              |
| -------------------------------- | ------------------------------------------------------------------------------- |
| Node                             | 24.22.2, `.node-version`; local download verified against official SHA-256      |
| pnpm                             | 11.25.0, packageManager and independent starter                                 |
| TypeScript                       | 5.9.3; selected to satisfy the pinned typescript-eslint peer range              |
| React / React DOM                | 19.3.1                                                                          |
| Fastify / static plugin          | 5.12.8 / 10.1.10                                                                |
| Vite                             | 8.3.6                                                                           |
| better-sqlite3 / embedded SQLite | 13.0.3 / 3.53.4 in local executed probe; backend checks engine floor before WAL |
| Gherkin / messages               | 42.0.1 / 34.2.1 for canonical parsing                                           |
| Playwright / Playwright-BDD      | 1.65.0 / 9.2.1                                                                  |
| Chromium                         | Chrome for Testing 158.0.8127.18, Playwright revision 1254                      |
| Java                             | Temurin 21.0.13+9; local archive checksum verified                              |
| Karate                           | 2.1.4, Java core with JUnit 5.13.4                                              |
| Gradle                           | 9.2.1 wrapper, distribution and wrapper JAR checksums verified                  |

pnpm 11 uses `allowBuilds`; only better-sqlite3 and esbuild may run dependency build scripts. Removed legacy `onlyBuiltDependencies` settings must not be used. Exact integrity/resolution lives in committed lockfiles. Do not copy a future upstream `latest` into these files without compatibility checks.

## Commands and data locations

README documents ordinary installation/start/check commands. `pnpm dev` builds the web assets, starts the demo and control server, and shuts both down on Ctrl+C. `pnpm build` followed by `pnpm start` runs the built platform alone; `pnpm demo` can start the application under test separately. `pnpm open` reads the private one-time launch URL and uses the OS browser launcher without printing the token.

Defaults are loopback ports 4310 (platform) and 4311 (demo). Override `PORT`, `DEMO_PORT`, `QA_DATA_DIR`. Changing `DEMO_PORT` does not silently rewrite the saved execution environment; update Workspace explicitly. No wildcard host setting is provided.

Private state contains SQLite, a private launch file, a bounded save-intent record and per-run snapshots/logs/native files. Sessions use an HttpOnly SameSite cookie and a separate origin-scoped proof in sessionStorage: cookies alone are insufficient because localhost cookies are shared across ports. Mutations also need CSRF. A session expires after 12 hours; restart issues a new launch link.

To use the app without an OS browser launcher, read `launch.json` locally and open its URL in your chosen browser. Treat that file and session storage as private. A disconnected stream surfaces an error; reload within the session or reopen a fresh launch link after restart.

## Target support and isolation

Initialize only a chosen empty external directory, or import the documented `contracts/`, `ui/`, `api/` layout with manifest version 1. Existing arbitrary build/layout conventions are diagnosed, not rewritten. Registration alone executes no code and creates no Git repository. Initialize Git yourself only after checking ancestor roots.

Install dependencies explicitly in the target before trusting/running it. The platform invokes installed Playwright CLI modules and a Gradle wrapper with fixed typed argument construction, no shell interpolation and a small environment. API runs use `--offline --no-daemon --rerun-tasks`. Builds/reports live in the private run directory. A single global worker drains a persisted queue; native frameworks use their own two-worker starter configuration.

Sources, target and data roots cannot overlap. Source registration detects manifests and read-only Git metadata, stores enable/index/include/exclude/ref preferences and never checks out a branch. Context indexing is not implemented in P1. Source preview/write APIs are not exposed; repository browsing is target-only and excludes secrets/dependencies/generated output/symlinks.

Trust is tied to the current project fingerprint. Queued runs preserve that fingerprint and exact canonical contract; changed files fail safely. Feature edits use a persisted draft, official parser, base-hash check, private intent record and atomic single-file rename. Pending save intents are not replayed automatically; inspect the target after an abrupt shutdown and reload before saving again. No multi-file generated change engine exists yet.

## Honest runner/report limits

Suite, feature, unique scenario-tag and literal tag selection are supported for both starters. No implicit row-to-suite fallback. Playwright example locations in JSON refer to generated files; Karate Cucumber output does not directly expose stable example-row IDs. Row attribution is therefore nullable, with actual expanded step data retained. Full stable external-edit reconciliation is not claimed by this adapter.

Native attempts/steps and infrastructure failures remain visible. A missing/malformed/empty report never passes. Retry attempts remain separate; the first starter uses no retries. The current conservative aggregation keeps any failed attempt visible as a failed run rather than reporting a clean pass.

Artifacts download as attachments under a sandbox/no-script policy and require both session credentials. Collected checksums are verified before download. Retention defaults to 14 days and is applied at platform startup only; metadata remains, expired payload references are marked. Run collection is capped at 256 MB/1000 files, and starts require 256 MB free space. Do not treat this as an OS disk quota or sandbox for malicious trusted code.

## Acceptance harness and troubleshooting

`pnpm test:smoke` starts fresh local apps and temporary sources/target, installs target dependencies explicitly, executes independent CLIs and drives the real UI. Run with Java 21. On a special environment whose pnpm launcher forces a different Node version, `QA_PNPM_CLI` may point to that launcher's JS entry for the fixture installer and `QA_PNPM_STORE` to an existing store. Ordinary users/CI do not need either override. The platform executor does not depend on these test-only variables.

The harness strips parent Playwright worker variables before independent CLI setup; otherwise nested BDD configuration may be misidentified. Public starter CLI execution outside a worker needs no such filtering.

If Java is absent/incorrect, browser is missing, target dependencies are absent or a report fails, read readiness/logs rather than retrying blindly. If API binding is stale, review the API assertions and manifest source hash. If trust changed while queued, review and start a fresh run. Never change expected assertions simply to produce green results.

## Executed operating-system matrix

Fresh CI setup and all checks passed on Ubuntu 24.04 x86_64, macOS 15 ARM64 (`macos-15`) and macOS 15 x86_64 (`macos-15-intel`). [Run 42125238265](https://github.com/HectorPelicanoAH/Automation-platform/actions/runs/42125238265) validates code commit `f8e500608ffcfa9e485412db1ba808735999807a`. This establishes the tested OS/architecture families and pinned runtime, not all historical/future OS versions. WSL2 is unvalidated and native Windows is deferred.
