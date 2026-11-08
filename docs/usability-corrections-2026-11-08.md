# Optional context and recorder resource compatibility

Owner authorization: explicit request on 2026-11-08 to make context sources optional and stop missing page content at `https://shop.mango.com`. This is a correction of existing workflows, not approval of a new phase. Phases 3–6 retain their VALIDATION status and outstanding CI obligations.

## Result

- Workspace presents application source registration as optional, with a collapsed form and a clear empty state. Generate explains that recordings and the automation target suffice for UI generation; external application sources provide additional context when selected. Required fields apply only when registering a source. The backend already accepted an empty source list; no dummy repository is created and no retrieval boundary is widened.
- The recorder separates resource loading from observation grants. Images, styles, scripts, fetch/API requests and embedded frames can load from other HTTP(S) origins without adding those origins to the capture allowlist. Top-level navigation and recorded evidence still require approved origins. Popup requests whose frame is not yet available use the stricter navigation rule.
- WebSockets use native forwarding without message capture. The platform control origin and its known loopback aliases remain blocked across HTTP/frame/navigation and WS/WSS paths. The server supplies this protected origin; clients cannot override it in a recording request.
- Network headers/bodies and unapproved-origin response metadata are still omitted; unapproved frame interactions are not observed. Service workers remain disabled because they can bypass interception. Browser CORS/CSP, TLS, authentication and website anti-automation restrictions are not bypassed. A normal page can communicate with its third-party services; loading them is not permission to export their content to AI.

## Validation

Pinned dependencies, Node 24.22.2 and installed Chromium on macOS Intel; Java 21 and existing pnpm/Gradle caches for native execution. Commands ran from the platform repository:

| Command                                                                                                                                                                | Evidence                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `node --import tsx --test tests/recording.test.ts tests/generation.test.ts`                                                                                            | 17 passed; zero failed, skipped or cancelled             |
| `node --import tsx --test tests/recording.test.ts`                                                                                                                     | Final control-field override/schema assertions: 4 passed |
| `node node_modules/@playwright/test/cli.js test --config tests/playwright.config.ts tests/recording-resources.spec.ts tests/recorder.spec.ts tests/acceptance.spec.ts` | 7 passed in 5.8 minutes; zero failures/skips/flaky cases |
| `node node_modules/typescript/bin/tsc --noEmit`                                                                                                                        | Passed                                                   |
| `node node_modules/eslint/bin/eslint.js .`                                                                                                                             | Passed                                                   |
| `node node_modules/prettier/bin/prettier.cjs --check .`                                                                                                                | Passed                                                   |
| `node node_modules/vite/bin/vite.js build --config apps/web/vite.config.ts`                                                                                            | Passed                                                   |

The new browser fixtures use three real loopback HTTP servers and an actual WebSocket handshake/message, with no third-party dependency or simulated success. They assert loaded CSS, image pixels/dimensions, script, API value, embedded frame and WebSocket message; unchanged origin grants; omitted third-party payloads/interactions; denial of control HTTP/WebSocket connections and unapproved top-level navigation. The web analysis flow uses the labelled deterministic provider fixture, not live inference, with zero registered application sources and only target context reads.

The original real headed recording/privacy/popups checks remain intact. An initial run exposed an early-popup request without a Playwright frame; classification now defaults to top-level navigation until the frame exists. Initial type checking also caught a fixture stream type mismatch, corrected to Node Duplex. These development failures are not hidden as passing evidence.

A separate exploratory fresh headless load of `https://shop.mango.com` reached the Spanish Mango title with no recorder resource blocks, one discovered/loaded image and nonempty page text. This checks initial loading only: no consent/login/shopping interaction, complete catalog rendering or anti-automation bypass was attempted. It is not a full-site compatibility claim. The local fixtures are the reproducible regression gate.

No dependency changes, live AI calls, credential reuse, source-repository writes, user skill activation or CI/billing changes were made. Raw test artifacts remain ignored/private. Five-minute audio and the entire unrelated suite were not rerun for this scoped correction; required three-system CI remains pending.

The local application was restarted after checking that no recording was active. Both local services are running, the platform returned HTTP 200 and its private launch link was reopened without printing the token. Use a new recording to pick up the updated policy. Safe check metadata is in [the evidence record](evaluations/recording-resource-compatibility-2026-11-08.json).
