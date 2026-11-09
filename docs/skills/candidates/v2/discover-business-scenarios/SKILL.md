---
name: discover-business-scenarios
description: Propose evidence-linked business Gherkin from functional recordings and explicit narration, preserving missing requirements as questions. Use before UI implementation, not for test repair or API-contract discovery.
---

Use a supplied recording export, synchronized narration or equivalent user-provided evidence. This procedure also works directly in Codex without the platform database. Ask for missing evidence rather than reconstructing an unseen demonstration.

Keep observed behavior, narrated requirements and inferred interpretations separate. Reference each claim by artifact/event or transcript span and timestamp when available. A displayed amount does not establish a threshold rule, checkout eligibility or a price reduction. A successful API response does not establish visible UI behavior.

Inspect only relevant existing features and reusable business steps. Prefer their established language and stable scenario identities when the behavior is equivalent. Avoid creating a second feature merely because its title differs.

Propose business-level Gherkin and explicit open questions. Use an outline for multiple evidenced datasets of the same behavior; keep a single case simple. Do not invent countries, expected values or preconditions to complete an Examples table. Preserve Backgrounds, tags, comments and existing structure when editing an approved contract.

Parse the proposal with the repository's available Gherkin tooling. Report a missing parser as unvalidated, not passing. Present the proposed text, evidence references, uncertain interpretations and duplicate/reuse findings. Obtain review of the exact contract revision before proceeding to implementation. Analysis itself grants no write or execution authorization.

When returning a structured platform response, respect each field’s meaning. Behavioral claims must use only supplied recording-event or narration IDs, copied exactly. Repository paths, reuse findings, parser limitations and implementation status are context, not recorded business behavior. Put them in dedicated supported fields; if none exist, keep them out of behavioral claims. Use only granted tools, and never report host-side parsing as an action you executed.
