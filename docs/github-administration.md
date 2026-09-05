# GitHub administration baseline

This is the intended repository configuration for `mdamronjr-maker/Viva`. Repository administrators should review these settings after material workflow changes and at least periodically.

## Repository identity

- Visibility: public, proprietary source
- Default branch: `main`
- Description: `Production website for Viva Wellness Co., an Austin-based concierge telehealth practice.`
- Website: `https://vivawellnessco.com/`
- Topics: `astro`, `cloudflare-pages`, `telehealth`, `healthcare`, `austin`, `accessibility`, `playwright`, `seo`
- Issues: enabled for technical work, using the privacy-safe issue forms
- Wiki and Projects: disabled unless Viva actively adopts them
- Automatically delete head branches after pull requests are merged: enabled

The repository is public for transparency and workflow access; it is not open source. Do not add an open-source license without an explicit owner decision.

## Branch model

Only two branches are long-lived:

- `main`: production; every update deploys live
- `feat/lights-on`: integration; verified changes collect here before promotion

Feature, fix, Dependabot, and release branches are temporary. Delete them after their commits are fully reachable from `main`. Never delete a branch with unique commits until those commits have been reviewed and deliberately retained, merged, or archived.

## Rules for `main`

Use a branch ruleset targeting `main` with:

- pull requests required;
- the `ci` status check required and required to be current;
- conversations resolved before merge;
- non-fast-forward updates blocked;
- branch deletion and force pushes blocked; and
- administrators included, with bypass limited to a documented production emergency.

A required approving review is valuable when a second regular maintainer exists. Do not configure an impossible self-approval requirement for a solo-owner repository.

## Rules for `feat/lights-on`

Use a branch ruleset targeting `feat/lights-on` with:

- pull requests required for ordinary feature and dependency work;
- the `ci` status check required;
- conversations resolved before merge; and
- deletion and force pushes blocked.

Document any emergency owner bypass in the resulting commit or pull request.

## Merge policy

Preserve merge commits for promotion into `main` so each production release records its reviewed integration parent and approval. Feature pull requests may use the repository's chosen merge method consistently. Avoid rebase-merging production promotions because it obscures the exact integration commit that was released.

## Security settings

Enable and periodically verify:

- dependency graph and Dependabot alerts;
- Dependabot security updates;
- secret scanning and push protection;
- private vulnerability reporting;
- GitHub Actions workflow permissions set to read-only by default; and
- CodeQL default setup for JavaScript/TypeScript when available.

CI actions stay pinned to immutable commit SHAs. Dependabot targets `feat/lights-on` and proposes updates through pull requests.

## Access and privacy

Grant repository access by least privilege and remove inactive collaborators. Require two-factor authentication on accounts with write or administration access.

GitHub is never a patient-support or clinical channel. Issues, pull requests, discussions, Actions logs, commit messages, and screenshots must contain no patient or health information, credentials, or secrets.

## Periodic review

Each quarter, or after a large release:

1. verify the default and production branches;
2. inspect active rulesets and required checks;
3. delete only branches fully merged into `main`;
4. review open dependency and security alerts;
5. confirm repository description, website, topics, and security contact;
6. review collaborator access; and
7. confirm a testable rollback path still exists.
