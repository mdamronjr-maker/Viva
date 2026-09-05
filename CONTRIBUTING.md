# Contributing

Thank you for helping maintain Viva Wellness Co.'s website. This is a public healthcare-marketing repository, so accuracy, privacy, accessibility, and a reversible release history matter as much as the visual result.

## Before you begin

Read [AGENTS.md](./AGENTS.md). It is the binding project rulebook. In particular:

- Never add patient information or clinical correspondence.
- Never invent credentials, outcomes, claims, prices, testimonials, or service areas.
- Do not weaken medication, privacy, telehealth, or no-PHI disclosures.
- Treat `main` as production.

If a requested change depends on a real-world clinical or business fact that is not documented, obtain owner or clinician confirmation before editing it.

## Workflow

1. Update local references to `feat/lights-on`.
2. Create a narrowly named branch such as `fix/mobile-header` or `feat/partner-perks`.
3. Keep the diff focused. Do not bundle unrelated cleanup with a production fix.
4. Add or update regression coverage for behavior changes.
5. Run `npm run verify`.
6. Review the rendered change at representative mobile and desktop widths.
7. Open a pull request into `feat/lights-on` using the repository template.

Promotion from `feat/lights-on` to `main` requires explicit approval from Michael because it deploys to production.

## Commit guidance

Use short, imperative commits with a conventional prefix where useful:

- `feat:` visible capability
- `fix:` defect correction
- `docs:` documentation only
- `test:` regression coverage only
- `chore:` maintenance with no product behavior change

Commits must explain intentional changes to protected content, deployment controls, or compliance language.

## Quality bar

A change is ready for review when:

- `npm run verify` passes locally.
- The page has no horizontal overflow at supported widths.
- Keyboard focus is visible and all interactions work without a pointer.
- Text and controls meet WCAG 2.2 AA contrast and target-size expectations.
- Images are sharp at their rendered size and have appropriate alternative text.
- Metadata, structured data, canonical URLs, and internal links still match the page purpose.
- No real form was submitted merely to test presentation.

## Issues and pull requests

GitHub is for technical work only. Redact screenshots and logs. Never post names, email addresses, phone numbers, symptoms, diagnoses, medications, appointments, lab results, or other patient-related information.

Report security concerns using [SECURITY.md](./SECURITY.md), not a public issue.
