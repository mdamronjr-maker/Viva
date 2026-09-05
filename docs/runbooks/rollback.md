# Production rollback

Use this runbook when the current production deployment is materially broken, unsafe, or inaccurate. Prefer a traceable revert over history rewriting.

## Immediate triage

1. Record the failing production URL, UTC time, device/browser, visible symptom, and current `main` commit SHA.
2. Do not submit forms or include visitor data in the incident record.
3. Identify the last known-good production commit from GitHub and Cloudflare deployment history.
4. Decide whether an immediate Cloudflare deployment rollback is needed while the Git fix is prepared.

## Git rollback

1. Branch from the current `main` without resetting or force-pushing it.
2. Revert the smallest offending commit or merge commit with `git revert`.
3. Run `npm run verify` on the revert branch.
4. Review the diff to ensure the revert does not remove later unrelated fixes.
5. With Michael's explicit production approval, merge or fast-forward the verified revert through the normal release path.
6. Confirm the new production SHA and repeat critical-route smoke checks.

If multiple changes are entangled, prepare an explicit corrective commit instead of reverting unrelated work.

## Cloudflare emergency rollback

When the live site is unusable or presents a serious trust, privacy, or compliance risk, an authorized owner may temporarily roll production back to a previously successful Cloudflare Pages deployment. This is an operational stopgap, not a replacement for correcting `main`: reconcile Git immediately so the next deployment cannot reintroduce the incident.

## Closeout

- Document root cause without personal or patient information.
- Add or strengthen a regression test that would have caught the failure.
- Confirm the integration branch contains the production correction.
- Review whether the release checklist or ownership rules need improvement.
