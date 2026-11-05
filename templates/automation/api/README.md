# API project

Use Java 21.0.13+9 and the supplied checksum-verified Gradle 9.2.1 wrapper:

```sh
./gradlew test --no-daemon
```

Karate 2.1.4 runs the two promotion datasets in parallel through a JUnit test. `QA_BASE_URL` defaults to the local demo. `QA_REPORT_DIR` redirects native output; `QA_TAG` selects a literal tag and `QA_FEATURE` selects a classpath feature when called by the platform adapter. Normal direct execution needs no platform process.

Dependencies are locked and SHA-256 verified. Initial execution downloads them; use `--offline` after setup. Native Cucumber JSON, JUnit XML, HTML summary and step evidence remain available. The API contract asserts protocol and business fields independently of visible UI assertions.

The guest demo needs no authentication helper or mutable setup cache. Add native reusable helpers only for real repeated needs, keep test data independent, and scope `callonce`/`karate.callSingle()` carefully when introducing auth/setup. Never cache shared mutable scenario data.
