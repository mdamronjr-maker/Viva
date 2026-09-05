# Viva Wellness Co.

[![CI](https://github.com/mdamronjr-maker/Viva/actions/workflows/ci.yml/badge.svg)](https://github.com/mdamronjr-maker/Viva/actions/workflows/ci.yml)

Production website for [Viva Wellness Co.](https://vivawellnessco.com/), an Austin-based concierge telehealth practice serving eligible patients in Texas, Colorado, Florida, and Iowa.

This is a healthcare marketing site. Do not add patient information, clinical messages, unverified medical claims, or unapproved changes to protected pricing, testimonials, credentials, and disclosures. Read [AGENTS.md](./AGENTS.md) before changing anything.

## Technology

- Astro 7 static site generation
- Cloudflare Pages and Pages Functions
- Cloudflare KV for rate limiting, suppression, and minimal email-delivery status records
- Resend for non-clinical marketing email
- Cloudflare Turnstile for public-form abuse protection
- Plausible for optional aggregate analytics
- Playwright and axe-core for functional, responsive, and accessibility regression checks

Clinical communication belongs in Viva's EHR, never in this repository or its email pipeline.

## Local development

Prerequisites: Node.js 22.12 or newer and npm.

```bash
npm ci
npm run dev
```

Astro serves the site at `http://localhost:4321` by default. Cloudflare Pages Functions require the Cloudflare development environment for end-to-end API testing; do not submit live forms as a routine test.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Astro development server |
| `npm run build` | Build the production site into `dist/` |
| `npm run preview` | Preview the completed Astro build |
| `npm run guard` | Verify protected content and funnel contracts |
| `npm test` | Run the Playwright regression suite against the built site |
| `npm run verify` | Run the guard, build, and complete test suite |

Run `npm run verify` before requesting review or promotion.

## Repository map

```text
src/pages/          Public pages, blog routes, and generated social cards
src/components/     Shared navigation, footer, calls to action, and notices
src/layouts/        Site shell, metadata, structured data, and analytics
src/lib/            Care-path data, partner data, and Turnstile configuration
src/styles/         Design tokens, typography, and global styles
functions/api/      Cloudflare Pages Functions for non-clinical lead email
public/             Static assets, fonts, redirects, headers, and robots rules
scripts/            Protected-content guard and approved snapshot
tests/              Functional, accessibility, SEO, performance, and UI checks
docs/               Architecture, deployment, and compliance runbooks
asset-drop/         Gitignored intake area for unprocessed imagery
```

## Branches and deployment

`main` is the production branch and deploys automatically. `feat/lights-on` is the integration branch.

1. Branch from the latest `feat/lights-on`.
2. Make one coherent change and run `npm run verify`.
3. Open or review the diff against `feat/lights-on`.
4. Merge the verified work into `feat/lights-on`.
5. Promote the exact reviewed integration commit to `main` only with Michael's explicit approval.
6. Confirm the production deployment and critical public routes.

Never force-push or rewrite `main`. See [deployment.md](./docs/deployment.md) and [rollback.md](./docs/runbooks/rollback.md).

## Configuration

Copy `.env.example` to `.env` for local placeholders. Never commit real secrets. Production values and the `LEADS_KV` binding are managed in Cloudflare, not GitHub.

The environment-variable names and their purposes are documented in [deployment.md](./docs/deployment.md). The example file deliberately contains no usable credentials.

## Contributing and security

- [Contributing guide](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)
- [Architecture](./docs/architecture.md)
- [GitHub administration](./docs/github-administration.md)
- [Content and compliance](./docs/content-and-compliance.md)

Use GitHub Issues only for technical work. Never place patient names, contact details, symptoms, medications, appointment information, or other health information in an issue, pull request, commit, log, screenshot, or test fixture.

## Ownership

Copyright © Viva Wellness Co. All rights reserved. Source availability on GitHub does not grant permission to copy, redistribute, or reuse the site, content, branding, or assets.
