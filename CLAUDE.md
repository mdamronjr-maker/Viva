# CLAUDE.md — agent instruction set for the Viva Wellness site

Read this before touching anything. It describes the entire project space
(what this repo is, how it is laid out, how it deploys) and its capacity
(what the platform provides, what the constraints are).

## What this project is

Marketing site for **Viva Wellness Co.** (https://vivawellnessco.com), a
wellness clinic. Static **Astro 6** site plus **Cloudflare Pages Functions**
for the lead/email pipeline. Hosted on **Cloudflare Pages**, which
auto-builds and auto-deploys from the `main` branch of
https://github.com/mdamronjr-maker/Viva.

## The one rule that outranks everything

**Anything merged or pushed to `main` goes live on vivawellnessco.com
automatically.** Never push, merge, or rebase `main` without the owner's
explicit, in-the-moment approval. All work happens on feature branches and
is delivered as feedback/preview only. Promotion to production is done by
the owner (or with the owner's explicit go-ahead) via fast-forward/merge of
a reviewed branch into `main`, after diffing `origin/main..branch` and
confirming the scope of what will ship.

## Layout

```
src/pages/          Astro pages: index, about, services, menu, partners,
                    contact, start, blog/, privacy, terms, accessibility,
                    notice, 404, rss.xml.js, og/ (OG image routes),
                    _refer.astro (unpublished, pending reward confirmation)
src/components/     Header, Footer, MobileStickyCta, NoPhiNotice
src/layouts/        Shared page layouts
src/lib/            quiz.ts (program matching), partners.ts, turnstile.ts
src/content/        Content collections (see content.config.ts)
src/styles/         global.css — Geist typography system
functions/api/      Cloudflare Pages Functions:
                      lead.js           lead capture → Resend (eBook, notify,
                                        nurture drip Day 1/3/7/14)
                      unsubscribe.js    HMAC-signed one-click unsubscribe
                                        (RFC 8058)
                      resend-webhook.js Resend lifecycle events → suppression
                                        + delivery log
                      email-status.js   gated delivery dashboard/API
                      _log.js, _suppress.js, _ratelimit.js  shared helpers
scripts/            build-og-bg.mjs (runs before astro build)
public/             static assets, _redirects, _headers
```

## Commands

- `npm run dev` — dev server on port 4321 (`.claude/launch.json` defines the
  `viva-dev` launch config; use the browser-preview tooling, not raw shells)
- `npm run build` — builds OG background, then `astro build` into `dist/`
- `npm run preview` — serve the built site locally

Node >= 22.12 required.

## Platform capacity and configuration

Everything the deployed site can do beyond static HTML comes from Cloudflare
Pages project settings, not from this repo:

- **Environment variables** drive the Resend email pipeline (API key, from/
  notify addresses, unsubscribe HMAC secret, webhook signing secret,
  dashboard auth, Cloudflare Access team/AUD). The full variable table with
  required/optional status lives in `README.md`. Missing optional pieces
  degrade gracefully; the webhook and dashboard fail closed.
- **KV namespace binding `LEADS_KV`** stores the suppression list, queued
  Resend send IDs (31-day TTL), and the append-only delivery log (90-day
  TTL). Without the binding, lead capture still works but auto-cancel of the
  nurture drip and the delivery dashboard are disabled.
- **Resend** sends all mail; the domain is verified in Resend with DKIM/SPF
  records in Cloudflare DNS.
- `/api/email-status` is gated two ways: Cloudflare Access (browser) and a
  Bearer token (automation). Never weaken either path.

## Hard constraints

- **No PHI, ever.** Resend is not BAA-eligible. This pipeline handles
  marketing leads only (name/email/phone). The delivery log deliberately
  stores email + status + kind and **no message subjects**. All clinical
  communication stays in the clinic's EHR (Charm Health), not this site.
- **Copy rules:** no em dashes or en dashes anywhere in site copy (the repo
  has been audited clean; keep it that way). Never write fabricated
  first-person "story"/narrative copy in the owner's voice — verifiable
  facts or the owner's own words only.
- **Repo hygiene:** keep this repo free of references to the developer's
  personal infrastructure (hostnames, private IPs, home-lab details).
  Site-facing and platform-facing content only.
- **Typography:** single-family Geist system (see README "Typography
  system"). Legacy font variables all alias Geist; don't reintroduce
  per-role font families.

## Branch map (as of 2026-08-30)

- `main` — production, auto-deploys. Protected by the rule above.
- `feat/chat-assistant` — large site overhaul + chat assistant work.
  Feedback stage; not promoted.
- `feat/redesign-2026-06` — modern visual pass on top of production.
- `feat/email-delivery-audit` — email delivery audit log + gated status
  dashboard (merged to main; branch kept for history).
- `feat/services-peptide-links` — services/peptide link work + mobile
  booking popup tap fix.
- `audit-3am-2026-06-04` and `audit-3am-2026-06-04-devbox` — two divergent
  lines of the same security-audit session (DoS devaluation + em-dash sweep
  vs. Report-Only CSP in `_headers`). Reconcile before promoting either.

When starting new work: branch off `main`, keep the branch pushed to GitHub
as you go (the repo is the backup of record), and leave promotion decisions
to the owner.
