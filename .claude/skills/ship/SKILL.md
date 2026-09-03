---
name: ship
description: Use when finishing a change in this repo and getting it merged to the integration branch with receipts.
---

# Ship

The AGENTS.md working protocol as a checklist. AGENTS.md at the repo root is the source of truth; when in doubt, re-read it before acting. Two rules exist: never touch main (rule 0), stay legal and compliant (rule 1). Everything else is judgment.

1. Confirm the current branch is a work branch off feat/lights-on, never main. If not, create one off feat/lights-on before doing anything else.

2. Implement the change. Rule 1 boundaries: testimonial wording, true prices, compliance copy, no invented credentials or clinical claims, no PHI. If the change needs a real-world fact only the owner can supply, ask for that fact and ship the rest.

3. Run npm run verify (protected-content guard, build, Playwright suite). Fix failures and re-run until fully green. If you intentionally changed a guarded item (a genuine price change, a funnel contract update), update scripts/protected.snapshot.json in the same change and say why.

4. For risky or large changes, get an adversarial review at your judgment (a second subagent, or the GPT bridge if available) and note it in the merge commit. Small mechanical changes can skip this.

5. Merge to feat/lights-on with a commit message recording what was verified. Push the feature branch and feat/lights-on only. NEVER touch main; only Michael promotes to main.

6. Report: a summary of the diff, the verify results, and anything rule 1 your work touched.
