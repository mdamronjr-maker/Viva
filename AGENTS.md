# AGENTS.md · instructions for every AI assistant working on this repo

This file is the single source of truth for AI collaborators (ChatGPT/Codex,
Claude, or anything else). CLAUDE.md points here. Read all of it before
touching anything.

## What this is

Marketing site for **Viva Wellness Co.** (https://vivawellnessco.com), a
concierge telehealth clinic in Austin run by Liliana Damron, APRN, FNP-BC.
**Astro 6** static site + **Cloudflare Pages Functions** (lead/email pipeline),
hosted on Cloudflare Pages. Owner and technical lead: Michael Damron
(mdamronjr-maker on GitHub). The bar: this must read as the site of the top
company in Austin for this business, judged against Function Health, Maven,
Parsley-class execution.

## THE RULE THAT OUTRANKS EVERYTHING

**Anything pushed or merged to `main` deploys to the live site automatically.**
Never commit to, merge into, rebase, or push `main` for any reason. All work
happens on branches off the integration branch **`feat/lights-on`** and is
promoted only by Michael, explicitly, after review.

## Current state (2026-09-02)

The site just completed the **"Lights On" redesign**: the old dark theme was
replaced by a light editorial system (cream/sky/butter palette, single-color
Fraunces headlines) and a deliberate de-AI pass removed the machine-writing
tells (negation scaffolds, dual-color headline accents, marquees, numbering
systems, interpunct overuse, AI-generated imagery). Twelve work pieces
(p1-p12) are merged into `feat/lights-on`; every piece was implemented by one
AI and adversarially reviewed by another before merging. Git history on the
piece branches carries the full record with receipts.

**Queued work** (full specs inline; the workshop board mirrors them):

- **p13 · type system.** Add scale tokens to `:root`:
  `--fs-hero: clamp(2.6rem, 6.8vw, 5.4rem)`, `--fs-hero-sm: clamp(2.4rem,
  6vw, 4.5rem)` (utility/legal pages), `--fs-h2: clamp(2rem, 4.5vw, 3.4rem)`,
  `--fs-h2-lg: clamp(2.2rem, 5vw, 4rem)` (closing CTA bands only),
  `--fs-h3: clamp(1.6rem, 3vw, 2.4rem)`, `--fs-h4: clamp(1.2rem, 1.8vw,
  1.5rem)`. Sweep the ~20 page-local heading clamps onto them (grep
  `font-size: clamp` in src/pages). Normalize display tracking to two values
  (-0.02em headings, -0.028em heroes). Loosen display leading at <=720px
  (h1 to 1.08, h2 to 1.12). Cap eyebrows at 3-4 per page by deleting the
  redundant ones. Move italic display OUT of interactive controls: quiz
  option labels and blog TOC to var(--font-body) 500, FAQ question rows to
  roman Fraunces weight 460. Floor sentence-form micro-copy (disclaimers,
  terms, PHI notice body) at 0.8rem/1.55. ACCEPT: build green; grep shows
  zero page-local heading clamps left; every page renders correctly at 375
  and 1280 wide; no protected content changed.
- **p14 · substance.** Butter feature band: replace generic blurbs with
  concrete facts already present elsewhere on the site (no new claims) and
  match icons literally to their labels. Quiz: surviving a failed POST to
  /api/lead (show a retry state, never lose answers), a visible exit besides
  the X, label fixes. Voice sweep: one narrator per page, retire reused
  sentence molds across pages (grep near-duplicate sentence stems). Austin
  proof band on home built ONLY from verifiable existing facts (address,
  partner count, review count). About: wire the state-selector form it
  promises, fill the empty grid cell. ACCEPT: build green; /api contracts
  and quiz ids byte-identical; no invented facts.

**Open owner items** (only Michael/Liliana can supply; NEVER invent these):
license numbers for the footer (marked SHIP BLOCKER), the GlossGenius
New Patient Consult deep link, a ruling on the two conflicting $99 tier
descriptions, menu stack-name ruling, CV facts for the about page,
replacement pullquote reviews, and the real hero photo (see Imagery).

## Layout

```
src/pages/          index, about, services, menopause, menu, start, partners,
                    contact, blog/, legal pages, og/ (build-time share cards)
src/components/     Header, Footer, MobileStickyCta, NoPhiNotice
src/layouts/        Layout.astro (meta, schema graph, font preloads)
src/lib/            quiz.ts (match logic), partners.ts (directory + perks),
                    turnstile.ts
src/styles/         global.css (design tokens + type system), fonts.css
functions/api/      Cloudflare Pages Functions: lead.js, unsubscribe.js,
                    resend-webhook.js, email-status.js + helpers
public/             assets; fonts/ are self-hosted variable fonts
asset-drop/         intake folder for new imagery (gitignored except README)
```

Commands: `npm run dev` (port 4321) · `npm run build` (must pass before any
commit is considered done) · Node >= 22.12. Repo files have MIXED line
endings (CRLF and LF); anchor any scripted multi-line edit byte-exactly, and
never use a replacement whose output contains its own search anchor.

## Protected content · byte-identical, never edit

- **Prices and payment terms.** GlossGenius is the source of truth
  ($99 / $199 / $249 / $349 tiers; $199 first visit, $50 deposit). Never
  invent, move, or reword a price or term.
- **Testimonial quotes.** Real Google reviews, legally sensitive. Wording is
  untouchable; presentation may change.
- **Compliance copy**: 503A compounded-medication disclosures, NoPhiNotice,
  /privacy, /notice, /terms, /accessibility, membership terms, disclaimers.
- **JSON-LD sources**: the faqs arrays on home and /menopause feed FAQPage
  schema; MedicalBusiness/WebSite graph, Person, BlogPosting. Do not alter
  the source strings (a render-only aHtml field exists for links).
- **Funnel contracts**: form field names, the `source` values posted to
  /api/lead, the #quiz element id (public/_redirects 301s /quiz there),
  GlossGenius URLs and UTM params, everything under functions/api/.
- **The brand line** "You bring the goals. / I'll build the protocol."
  exists exactly once, in the home hero. Do not reuse or vary it.

## Voice and style rules (violations are regressions)

- No em dashes, no en dashes, anywhere. Interpunct (·) is allowed ONLY as a
  separator in mono metadata (eyebrows, captions).
- First-person Liliana voice; no fabricated stories, credentials, or claims.
  Facts or her own words only. No PHI implications ever.
- Negation budget: at most one "X, not Y" construction per page (the home
  provider band holds the sanctioned "not a chatbot" line). The trust-strip
  claims and schema-locked FAQ text are standing exemptions.
- "actually" budget: 3 site-wide (all allocated). Headlines: single color,
  `.italic-display` only on each page hero's accent line, one per page.
  No counting-headline formula except the real-numbers Google review one.
- CTAs are plain sentence-case verbs (Book a visit, Take the quiz); the word
  "protocol" is reserved for clinical body copy.

## Design system

Tokens in `src/styles/global.css` `:root`. WARNING: token NAMES predate the
light flip; roles are stable but hues are inverted (--ink* = light grounds,
--paper* = dark type, --bronze = honey accent, plus --sky/--butter bands).
Do not rename tokens. Fonts are self-hosted variable fonts, verified correct:
Fraunces carries full wght/opsz/SOFT/WONK axes; Geist and Geist Mono are wght
variables. Weight requests must stay inside declared ranges (Fraunces
350-600, Geist 300-900, Mono 400-600). Every text pairing must hold WCAG
4.5:1; meaningful strokes 3:1 (use --rule-form for input borders). Butter is
a FILL, never a text color on light grounds.

## Imagery policy

People must be real photographs. The current hero runs an owner-directed
poster ILLUSTRATION (honestly captioned) as a stand-in until the real
Capitol-runner photo lands; a real photo drops into that slot. Never generate
photoreal humans, never fabricate images that claim to be real places
(partner facilities stay photo-free until real shots exist), never present
generated art as photography. New imagery arrives via `asset-drop/` named by
asset id; every image gets a caption, correct width/height attributes, webp
responsive pairs, and if it is the LCP asset, a matching preload in
Layout.astro in the same commit.

## Working protocol (the tandem)

Two AI assistants work this repo in tandem: one implements, the other
adversarially reviews, then roles verify each other's findings against the
actual code (false positives get dismissed with receipts, not silently).
For any piece of work:

1. Branch off `feat/lights-on` (never main).
2. Implement within the rules above. `npm run build` must pass.
3. Request adversarial review from the other assistant: attack the diff,
   name concrete failures. Verify every finding both ways before acting.
   Mechanics: when Claude drives, it pipes the diff to GPT through a local
   bridge; when ChatGPT/Codex drives, Michael relays the diff to Claude (or
   runs `claude -p` with it). If the other assistant is unavailable, Michael
   is the reviewer of record; say so in the merge commit.
4. Merge to `feat/lights-on` with a commit message that records what was
   reviewed and verified. **Push rights: assistants MAY push feature
   branches and `feat/lights-on` after a reviewed merge. Only Michael ever
   touches `main`.**
5. If your assigned scope reaches an owner item or protected content, STOP
   at that boundary and ask; ship the rest. Never fill an owner gap with
   invented content.

Michael's word is final on scope, taste, and promotion to main. When his
direction conflicts with a rule in this file, follow his direction and note
the override in the commit message.
