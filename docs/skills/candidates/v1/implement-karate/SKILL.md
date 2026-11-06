---
name: implement-karate
description: Translate a reviewed business scenario into repository-aware native Karate API automation with explicit endpoint evidence, helper reuse and independent UI/API coverage.
---

Use this when implementing approved API behavior, not when diagnosing a product regression or changing the functional contract.

Inspect the selected endpoint's source revision and explicit request, response and authentication contract. A literal source route alone does not establish inherited authentication or its response schema. Leave missing facts as questions; do not fill them with plausible defaults.

Read the canonical scenario identity and existing automation binding before selecting a destination. Reuse the bound Karate feature rather than adding another feature for the same scenario. Look up native authentication, response-schema and data-preparation features; read only the relevant helpers and preserve their original assertions. Keep business Gherkin separate from Karate DSL.

Propose exact reviewed files, endpoint references and observable API assertions. Preserve canonical example values and scenario tags. API results establish protocol/business state, not the visible title, amount or subtitle. UI assertions must remain independently executable. For hybrid work, identify API preparation and UI assertions as distinct stages; authorize the concrete setup environment and avoid sharing mutable prepared data between scenarios.

Use isolated native `call read()` composition for per-scenario setup. Introduce `callonce` or `karate.callSingle()` only when identity, environment, expiry and caching lifecycle are justified; never cache mutable scenario data just to speed execution.

Run the selected native feature and retain genuine step/report evidence. Report unsupported row selection rather than running a larger suite silently. Require exact diff review, stale-base checks and separate execution trust before target application. Generated tests and helper code still execute with host privileges.

In this platform's bounded generator, OpenAPI 3.0/3.1 inline JSON GET operations without authentication are the supported automatic path. Other operations remain manually implementable and independently executable; do not bypass its questions or static guards. Skill use grants no additional permission.
