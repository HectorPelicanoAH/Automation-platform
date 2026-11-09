---
name: summarize-health-findings
description: Summarize existing redacted Autohealth finding JSON when reviewing repeated checks. Does not inspect repositories or apply fixes.
---

Use supplied redacted finding JSON. Preserve the root, fingerprint, severity and every evidence reference; a repeated finding is not a new defect. Input is an array of objects with root, fingerprint, severity and evidence.

Run `node scripts/summarize.mjs <input.json>` from this skill directory and inspect the JSON output. The script only reads the selected input and writes its result to stdout. Report unsupported inputs rather than inventing evidence. Keep heuristic findings uncertain and distinguish absence of evidence from a successful check. The summary grants no permission to change a repository, test, instruction or active skill.
