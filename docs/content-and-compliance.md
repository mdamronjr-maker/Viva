# Content and compliance guardrails

This document supports editorial and engineering review; it is not legal or clinical advice. Questions about advertising law, prescribing rules, scope of practice, privacy obligations, or clinical accuracy require qualified counsel or clinician review.

## Protected content

The binding rules are in [AGENTS.md](../AGENTS.md), and machine-checked literals are in `scripts/protected.snapshot.json`. Do not casually change:

- testimonials or attribution;
- prices, deposits, billing terms, or inclusions;
- provider credentials or supported service areas;
- medication status, compounding, eligibility, or safety disclosures;
- privacy, telehealth, accessibility, terms, and no-PHI notices; or
- booking URLs and lead-form contracts.

When an approved real-world fact changes, update the page, tests, and protected snapshot together and explain the source of truth in the commit or pull request.

## Healthcare content review

Every material clinical page should make it easy to identify:

- who provides care and the credentials Viva has verified;
- where a patient must be located and that eligibility varies;
- what a service includes and excludes;
- that evaluation does not guarantee a prescription or outcome;
- when compounded products are not FDA-approved; and
- how to move from general education to an appropriate clinical conversation.

Avoid absolutes such as “safe,” “risk-free,” “guaranteed,” “best,” or “works for everyone.” Describe potential benefits and limitations in proportion to available evidence. Claims involving medications, peptides, hormones, body composition, or longevity require clinical review and reliable supporting sources.

Educational articles should name an author or reviewer when supported, display a meaningful updated date, link to primary or authoritative medical sources, and distinguish general education from individualized advice.

## Testimonials and endorsements

Do not edit a review for tone, grammar, emphasis, or length unless the approved source and the nature of the edit are documented. Do not imply that a review describes a typical or guaranteed result. Never create a composite review.

## Partners, perks, and external links

Directory businesses are independent and must not be presented as Viva employees, clinical affiliates, or universally appropriate recommendations without substantiation.

Each discount, referral, affiliate, or financial relationship must be disclosed clearly on the same card as the relevant code or link. The disclosure should be visible before or beside the action, not buried in the footer. Sponsored outbound links use `rel="sponsored noopener"`.

For products and supplements:

- state current terms only when directly verified;
- tell visitors to confirm vendor pricing and availability;
- avoid disease-treatment or outcome claims;
- avoid implying that a general storefront item is an individualized recommendation; and
- provide a reviewed date so expiring codes and links can be rechecked.

## Privacy and analytics

Never send care-path selections, form values, email addresses, phone numbers, appointment details, or URL parameters that reveal health interests to analytics or advertising platforms. Analytics events should describe generic interface actions, not inferred conditions.

No patient or prospective-patient information may appear in GitHub, deployment logs, test fixtures, screenshots, Resend subjects, or unapproved stores. Redact before sharing.

## Accessibility and readability

Healthcare content must remain readable under zoom and text resizing. Use semantic headings, descriptive links, explicit form labels, visible focus, sufficient contrast, and plain-language explanations. Do not rely on color, animation, hover, or visual position alone to communicate meaning.

## Review cadence

Review time-sensitive service, medication, market, partner, and pricing information when it changes and at least periodically. Update a displayed review date only after the underlying content and outbound destinations were actually checked.
