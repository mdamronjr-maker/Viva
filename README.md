# Viva Wellness · build drop

Mike · these files drop into your `C:\dev\viva-wellness` repo. Backup first.

## What's in here

```
public/
  viva-logo-paper.png       · cream logo, transparent bg (header/footer)
  viva-logo-red.png         · maroon logo, transparent bg (for paper sections)
  matt-johnson.jpg          · 1600x2400, 306KB
  matt-johnson-sm.jpg       · 800x1200, 87KB (mobile srcset)
  viva-ebook.pdf            · 1.1MB lead magnet
  viva-brochure.pdf         · 2.9MB optional download

src/
  styles/global.css         · Anton added, h1/h2 in Anton, h3 + italic stays Fraunces
  components/Header.astro   · logo replaces V mark, "Start Your Protocol"
  components/Footer.astro   · same logo treatment, "Start Your Protocol"
  pages/index.astro         · Matt Johnson section, Viva Concierge program, em dashes stripped
  pages/contact.astro       · NEW · name/email/phone form → POST /api/lead
  pages/quiz.astro          · NEW · 5 questions + gate form → POST /api/lead

functions/api/lead.js       · NEW · CF Pages Function, Resend integration
```

## Deploy steps

### 1. Drop files into repo

```powershell
cd C:\dev\viva-wellness
# Backup first
git checkout -b homepage-refresh
# Copy public/ contents into ./public/
# Copy src/ contents over your existing src/
# Copy functions/api/lead.js into ./functions/api/lead.js  (create the dir if needed)
```

### 2. Verify quiz and contact don't clash

If you already have `src/pages/contact.astro` or `src/pages/quiz.astro` in the repo, this overwrites them. Diff before merging.

### 3. Set Resend env vars

In Cloudflare Pages → your project → Settings → Environment variables (Production):

| Variable | Required | Value |
|---|---|---|
| `RESEND_API_KEY` | yes | your Resend API key |
| `RESEND_FROM_EMAIL` | yes | `Viva Wellness Co. <hello@vivawellnessco.com>` · domain must be verified in Resend |
| `RESEND_NOTIFY_EMAIL` | yes | `info@vivawellnessco.com` |
| `RESEND_AUDIENCE_ID` | optional | Resend Audience UUID if you want leads added to a list |
| `SITE_ORIGIN` | optional | `https://vivawellnessco.com` (default if unset) |
| `CAN_SPAM_ADDRESS` | recommended | physical postal address printed in every nurture email footer (CAN-SPAM). Unset = obvious placeholder ships |
| `UNSUB_SECRET` | recommended | random string · HMAC key for one-click unsubscribe links. Unset = drip falls back to reply-"stop" only |
| `RESEND_WEBHOOK_SECRET` | recommended | the `whsec_…` signing secret from the Resend webhook. Unset = `/api/resend-webhook` fails closed (401) |
| `EMAIL_STATUS_TOKEN` | recommended | random string · `Authorization: Bearer` token for the `/api/email-status` API (automation/curl). Unset = Bearer path off. There is no `?token=` query param (query strings leak) |
| `ACCESS_TEAM_DOMAIN` | recommended | `yourteam.cloudflareaccess.com` · enables the verified Cloudflare Access path for the browser dashboard. Unset = Access path off |
| `ACCESS_AUD` | recommended | Application Audience (AUD) tag of the Access app guarding `/api/email-status`. Required with `ACCESS_TEAM_DOMAIN` |

Per memory: Resend is NOT BAA-eligible. This pipeline only handles marketing leads (name/email/phone, no PHI). Keep all clinical comms in Charm Health.

**Suppression / unsubscribe (auto-cancel of the nurture drip).** The Day 1/3/7/14
follow-ups are queued in Resend at submit time. To honor unsubscribes, spam
complaints, and hard bounces by *cancelling the still-queued sends*, two pieces
of infra are needed beyond the env vars above:

1. **KV namespace binding `LEADS_KV`** · Cloudflare Pages → Settings → Functions →
   KV namespace bindings → bind a namespace as `LEADS_KV`. Stores the suppression
   list (`supp:<email>`), the queued Resend IDs per lead (`sched:<email>`,
   31-day TTL), and the delivery audit log (`elog:<rev>:<rand>`, 90-day TTL · see
   below). Without it, the drip still sends but auto-cancel **and the delivery
   dashboard** are disabled.
2. **Resend webhook** → point it at `https://vivawellnessco.com/api/resend-webhook`
   and copy its signing secret into `RESEND_WEBHOOK_SECRET`. Subscribe to
   `email.bounced` and `email.complained` (drive auto-suppression) plus
   `email.sent`, `email.delivered`, and `email.delivery_delayed` (feed the
   delivery dashboard). `email.opened` / `email.clicked` are optional and also
   logged if enabled.

Unsubscribe links resolve at `/api/unsubscribe` (GET = confirmation page, POST =
RFC 8058 one-click). Every link is HMAC-signed with `UNSUB_SECRET`. All of this
degrades gracefully: missing binding/secret reverts to the prior reply-"stop"
behavior without breaking lead capture.

**Delivery dashboard (`/api/email-status`).** Every send (eBook, notify, the four
nurture sends, contact form) and every Resend lifecycle webhook is appended to an
append-only KV event log (`_log.js`). `/api/email-status` reads it back as a
status rollup + recent events, so you can confirm mail actually landed without
opening the Resend console.

The log is deliberately minimal — **email + status + kind only, no message
subjects** — because a subject can name a health vertical and pairing that with
an address in a non-BAA store edges toward PHI. `kind` (`lead` / `notify` /
`nurture-dayN` / `contact` / `webhook`) gives triage value without that.

It still exposes lead emails (PII), so it is **gated, fail-closed, with two
layers**:

- **Cloudflare Access (recommended)** for the browser dashboard. Create an
  Access application over `vivawellnessco.com/api/email-status`, policy =
  you + Liliana. Set `ACCESS_TEAM_DOMAIN` + `ACCESS_AUD` so the Function
  *verifies* the Access JWT — without that, someone could bypass Access by
  hitting the raw `*.pages.dev` URL. With it, the browser view just works after
  SSO and the origin is bypass-proof.
- **Bearer token** for automation (e.g. the CT219 runbook fetching JSON):

```
# JSON rollup (automation)
curl -H "Authorization: Bearer $EMAIL_STATUS_TOKEN" https://vivawellnessco.com/api/email-status
# browser table → just visit it (Cloudflare Access handles the login):
https://vivawellnessco.com/api/email-status?view=html
```

### 4. Verify vivawellnessco.com domain in Resend

Resend dashboard → Domains → Add `vivawellnessco.com` → add the DKIM/SPF DNS records to Cloudflare. Until that domain is verified, the FROM address has to be `onboarding@resend.dev` (sandbox sender) and emails will only deliver to your verified Resend account email.

### 5. Push and test

```powershell
git add .
git commit -m "homepage refresh: logo, Matt Johnson, Viva Concierge, Anton, contact + quiz with Resend"
git push
```

CF Pages auto-builds. Test the new endpoints on the staging URL first:

- `/` · check the Matt section renders, header logo loads, programs show "Viva Concierge"
- `/contact` · submit a test lead with your own email, verify the eBook email lands
- `/quiz` · complete the flow, verify the match logic feels right and the gate form lands the lead

### 6. Watch for

- **Logo size**: header logo is set to 32px tall. If it feels too tight or too big, tweak `.brand__logo { height: 32px }` in Header.astro.
- **Matt photo crop**: I set `object-position: center 20%` so his face/torso anchors. Adjust if you want more of the running motion in frame.
- **Typography system (Modern Sans)**: Geist (variable, 300–900) for everything · h1, h2, h3, body, labels, prices, marquee. Geist Mono is reserved for `var(--font-code)` if/when code blocks appear. Single family, single voice. Italic emphasis is opt-in via `.italic-display` — which switches to italic + weight 400 (vs surrounding 700) + bronze color, no family swap. h1 weight is 700, h2/h3 weight 600. Negative tracking everywhere (-0.025 to -0.035em on display). The legacy `--font-display`, `--font-display-italic`, `--font-mono`, `--font-body` variables all point at Geist for backward compat with ~100 call sites.

## Quiz matching logic

Five questions → one of four programs. Rules in priority order:

1. `goal=performance` OR `activity=competitive` + budget ≥ $349/mo → **Peak Performance ($699)**
2. `goal=weight` → **Metabolic Core ($349)**
3. `goal=hormones` + `sex=male` + budget ≠ $99 → **TRT All Inclusive ($199)**
4. `goal=recovery` + budget ≥ $349/mo → **Metabolic Core ($349)** with recovery-emphasis copy
5. default → **Viva Concierge ($99)**

Adjust in `src/pages/quiz.astro` → `match()` function. Each branch has its own bullets array, easy to retune.

## What you might want next

- Snippet to track quiz-source vs contact-source leads in the notify email subject (already there: `New quiz match: ...` vs `New contact lead: ...`)
- UTM passthrough into the notify email (currently not captured)
- Brochure as a footer-level "Download brochure" link if you want both eBook and brochure
- Astro Image component for `matt-johnson.jpg` (currently using a raw `<img>` with srcset · works, but Astro's component would auto-optimize on build)

## Em dash audit · CLEAN

All generated files pass: no em dashes, no en dashes, anywhere.

The originals had three em dashes I stripped:
- `index.astro` line 52: `"— Founded by Liliana"` → `"· Founded by Liliana"`
- `index.astro` line 79: `"— Not sure where to start?"` → `"Not sure where to start?"`
- `index.astro` line 241: `"...cover — pairs perfectly..."` → `"...cover. Pairs perfectly..."`
- `Header.astro` aria-label: `"Viva Wellness Co. — home"` → `"Viva Wellness Co. · home"`

## Quick contact for the Resend cert dance

If Resend gives you grief on domain verification, the DKIM records go in Cloudflare DNS as CNAMEs. Typical pattern:
- `resend._domainkey` → `<resend-provided>.resend.email`
- TXT for SPF: `v=spf1 include:amazonses.com ~all` (or whatever Resend gives you)

Once verified, the `from:` line in `lead.js` will send cleanly.
