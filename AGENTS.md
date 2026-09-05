# AGENTS.md · instructions for every AI assistant working on this repo

This file is the single source of truth for AI collaborators (ChatGPT/Codex,
Claude, or anything else). CLAUDE.md points here.

By owner directive (Michael, 2026-09-03) the previous rulebook is retired:
every voice, style, design, imagery, and process rule is gone. Two rules
remain, and only two.

## What this is

Marketing site for **Viva Wellness Co.** (https://vivawellnessco.com), a
concierge telehealth clinic in Austin run by Liliana Damron, APRN, FNP-BC.
**Astro 7** static site + **Cloudflare Pages Functions** (lead/email
pipeline), hosted on Cloudflare Pages. Owner and technical lead: Michael
Damron (mdamronjr-maker on GitHub). The bar: the best site in Austin for
this business. How to get there is judgment, not rules; decide and ship.

## RULE 0 · the deploy rule

**Anything pushed or merged to `main` deploys to the live site
automatically.** Never commit to, merge into, rebase, check out, or push
`main` for any reason. All work happens on branches off the integration
branch **`feat/lights-on`**; assistants may push feature branches and
`feat/lights-on` after a verified merge. Promotion to `main` is done only by
Michael, explicitly. A PreToolUse hook in `.claude/` enforces this for
Claude sessions; the rule binds every assistant regardless.

## RULE 1 · legal and compliant

The only content rule. Concretely, never:

- **Alter or invent testimonials.** The quotes are real Google reviews;
  changing their wording, attribution, or truncation is deceptive practice
  (FTC endorsement rules). Presentation may change; text may not.
- **Show a price or term that differs from what GlossGenius actually
  bills.** Today: $99 / $199 / $249 / $349 / $499 tiers, $199 first visit,
  $50 deposit. `scripts/protected.snapshot.json` pins the live figures;
  when a price genuinely changes, update the snapshot deliberately in the
  same change and say so.
- **Invent credentials, license numbers, clinical claims, outcome
  guarantees, or facts** about Liliana, the practice, or the medications.
  Medical claims (peptides, GLP-1, TRT/HRT, compounded 503A products) stay
  within what the site already asserts unless the owner supplies new
  substantiation. Do not blur compounded (503A) products with FDA-approved
  drugs.
- **Weaken or remove compliance copy**: 503A compounded-medication
  disclosures, the NoPhiNotice component, /privacy, /notice, /terms,
  /accessibility, membership terms, disclaimers.
- **Touch PHI.** No patient-identifying information in the repo, logs, or
  the email pipeline (Resend is not BAA-eligible; clinical communication
  lives in the EHR, never here).
- **Put personal-infrastructure details in this repo** (home-lab hostnames,
  LAN IPs). This is a business entity's repository.

When a change needs a real-world fact only the owner can supply (a license
number, a credential, substantiation for a new claim), stop and ask for
that fact. Everything else, including wording, tone, design, imagery,
structure, and SEO, is the assistant's judgment.

## Layout

```
src/pages/          index, about, services, weight management, menopause,
                    testosterone, recovery, start, partners, contact, blog/,
                    legal pages, og/ (build-time share cards)
src/components/     Header, Footer, MobileStickyCta, NoPhiNotice
src/layouts/        Layout.astro (meta, schema graph, font preloads)
src/lib/            quiz.ts (care-path matching), partners.ts (directory +
                    disclosed perks), turnstile.ts
src/styles/         global.css (design tokens + type system), fonts.css
functions/api/      Cloudflare Pages Functions: lead.js, unsubscribe.js,
                    resend-webhook.js, email-status.js + helpers
public/             assets; fonts/ are self-hosted variable fonts
asset-drop/         intake folder for new imagery (gitignored except README)
```

Commands: `npm run dev` (port 4321) · `npm run build` · `npm run verify`
(protected-content guard + build + Playwright regression suite; must be
green before a merge to feat/lights-on) · Node >= 22.12. Repo files have
MIXED line endings (CRLF and LF); anchor scripted multi-line edits
byte-exactly.

## The harness (regression checks, not style rules)

- `npm run guard` verifies `scripts/protected.snapshot.json`: rule 1
  literals (prices, testimonial quotes) plus functional contracts that keep
  revenue flowing (form field names and `source` values matching
  functions/api/lead.js, the `#quiz` id, GlossGenius booking URLs).
- `npm test` runs the Playwright suite against the built site: pages
  respond, forms carry the fields lead.js reads, booking links point at
  vivawellnessco.glossgenius.com, JSON-LD parses, only the 404 page is
  noindexed, price surfaces render.
- CI (.github/workflows/ci.yml) runs guard + build + tests on PRs to main
  and feat/lights-on and on pushes to both.

These exist so an agent cannot silently break the funnel or a rule 1 item.
They are updated deliberately when behavior genuinely changes.

## Working protocol

1. Branch off `feat/lights-on` (never main).
2. Implement. `npm run verify` must be green.
3. Merge to `feat/lights-on` with a commit message recording what was
   verified; push the feature branch and `feat/lights-on` only.
4. Adversarial review is encouraged for risky or large changes, at the
   driver's judgment; if one happened, say so in the merge commit.

Michael's word is final on everything. When his direction conflicts with
this file, follow his direction and note the override in the commit.
