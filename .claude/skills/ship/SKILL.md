---
name: ship
description: Use when finishing a change in this repo and getting it merged to the integration branch with receipts.
---

# Ship

The AGENTS.md working protocol as a checklist. Follow it exactly, in order. AGENTS.md at the repo root is the source of truth; when in doubt, re-read it before acting.

1. Confirm the current branch is a work branch off feat/lights-on, never main. If you are not on one, create a new branch off feat/lights-on before doing anything else.

2. Implement the change. Obey the protected-content rules (prices and payment terms, testimonial quotes, compliance copy, JSON-LD source strings, funnel contracts, the brand line) and the voice and style rules in AGENTS.md. If your scope reaches an owner item or protected content, STOP at that boundary and ask; ship the rest. Never invent owner content.

3. Run npm run verify (guard, voice lint, build, Playwright suite). Fix failures and re-run until it is fully green.

4. Independent review. Pipe the full diff to the GPT tandem bridge if the /gpt skill is available in this session. If it is not, use a second Claude subagent as an adversarial reviewer. If neither is possible, Michael is the reviewer of record and the merge commit must say so. Apply the fixes the review surfaces, then re-run npm run verify until green.

5. Merge to feat/lights-on with a commit message recording what was reviewed and what was verified. Push the feature branch and feat/lights-on only. NEVER touch main; only Michael promotes to main.

6. Ask Michael whether to refresh the owner's local preview and the workshop board (operator notes live outside this repo).

7. Report: a summary of the diff, the verify results, the review findings applied, and any open owner items your work touched.
