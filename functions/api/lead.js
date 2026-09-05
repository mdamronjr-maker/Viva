/**
 * /api/lead · Cloudflare Pages Function
 *
 * Handles non-clinical contact submissions from /contact.
 * Sends:
 *   1. Transactional confirmation, plus an email-preference confirmation when opted in
 *   2. Notification email to Viva (info@vivawellnessco.com) with form data
 *   3. Adds contact to Resend Audience (if RESEND_AUDIENCE_ID is set)
 *
 * Env vars (set in Cloudflare Pages dashboard → Settings → Environment variables):
 *   RESEND_API_KEY         · required. Your Resend API key.
 *   RESEND_FROM_EMAIL      · required. Format: "Display Name <email@verified-domain.com>"
 *                            Default fallback: "Viva Wellness Co. <hello@vivawellnessco.com>"
 *                            The from-domain must be verified in Resend.
 *   RESEND_NOTIFY_EMAIL    · required. Where lead notifications go. Default: info@vivawellnessco.com
 *   RESEND_AUDIENCE_ID     · optional. Audience UUID for newsletter list. Skipped if absent.
 *   SITE_ORIGIN            · optional. Used to build the education-hub link.
 *                            Default: https://vivawellnessco.com
 *   UNSUB_SECRET           · optional. HMAC secret for one-click unsubscribe
 *                            links. Without it the drip falls back to a
 *                            mailto/reply-"stop" unsubscribe only.
 *   LEADS_KV (binding)     · optional. KV namespace that backs the
 *                            suppression list + scheduled-send bookkeeping +
 *                            the email delivery audit log (see _log.js).
 *                            Without it, auto-suppression and the delivery
 *                            dashboard are disabled (the drip still sends).
 */

import {
  isSuppressed,
  recordScheduled,
  makeUnsubscribeUrl,
} from './_suppress.js';
import { logEmailEvent } from './_log.js';
import { rateLimit } from './_ratelimit.js';

const RESEND_API = 'https://api.resend.com';

// --- helpers ---
const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(init.headers || {}),
    },
  });

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));

const CONTACT_TOPICS = new Set([
  'Scheduling or first-visit question',
  'Pricing or membership question',
  'Partnership or media question',
  'Website or email question',
  'Other non-clinical question',
]);

const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Cloudflare Turnstile server-side verification. Returns true to allow the
// submission. Failure semantics are scoped on purpose:
//   - missing token            -> fail CLOSED (bots that skip the widget)
//   - network error / timeout  -> fail OPEN  (a Cloudflare-side hiccup we don't
//                                 control must never drop a real lead)
//   - HTTP non-2xx / bad body  -> fail CLOSED (a forged or malformed request,
//                                 not an outage)
async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  let r;
  try {
    const body = new URLSearchParams({ secret, response: String(token) });
    if (ip) body.set('remoteip', ip);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Could not reach siteverify (network/abort) — fail OPEN.
    return true;
  }
  // We got a response. Treat anything but a clean, parseable 2xx success as a
  // failed challenge (fail CLOSED) — this is a bad request, not an outage.
  if (!r.ok) return false;
  try {
    const d = await r.json();
    return !!(d && d.success);
  } catch {
    return false;
  }
}

// --- main handler ---
export async function onRequestPost(context) {
  const { request, env } = context;

  // Parse JSON enhanced submissions and ordinary HTML form submissions.
  // The latter keeps contact details out of query strings when JavaScript is
  // unavailable and provides a safe progressive-enhancement fallback.
  let payload;
  let isNativeForm = false;
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await request.json();
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      isNativeForm = true;
      const data = await request.formData();
      payload = Object.fromEntries(data.entries());
      payload.marketingConsent = data.get('marketing_consent') === 'yes';
      payload.turnstileToken = String(data.get('cf-turnstile-response') || '');
    } else {
      return json({ ok: false, error: 'Unsupported form format.' }, { status: 415 });
    }
  } catch {
    return json({ ok: false, error: 'Invalid form submission.' }, { status: 400 });
  }

  const {
    source = 'contact',
    name = '',
    email = '',
    phone = '',
    message = '',
    company = '',   // honeypot
    marketingConsent = false,
  } = payload || {};

  // Only the public non-clinical contact form is supported. The previous
  // referral experiment accepted a third party's identity and an open note
  // before its terms were approved; that route is retired and the endpoint
  // fails closed for old or crafted source values.
  if (source !== 'contact') {
    return json({ ok: false, error: 'Unsupported form source.' }, { status: 400 });
  }

  // The public care-path guide is intentionally anonymous. Reject legacy or
  // crafted payloads that try to combine identity with quiz answers or a match.
  if (payload?.quiz || payload?.match) {
    return json({ ok: false, error: 'The care-path guide does not collect or submit answers.' }, { status: 400 });
  }

  // Honeypot: if filled, silently succeed without sending.
  if (company && String(company).trim().length > 0) {
    return json({ ok: true, skipped: 'honeypot' });
  }

  // Turnstile bot mitigation. Enforced only when TURNSTILE_SECRET_KEY is set,
  // so the form keeps working if the secret is ever unset/rotated mid-deploy.
  if (env.TURNSTILE_SECRET_KEY) {
    const turnstileOk = await verifyTurnstile(
      env.TURNSTILE_SECRET_KEY,
      payload && payload.turnstileToken,
      request.headers.get('CF-Connecting-IP')
    );
    if (!turnstileOk) {
      return json({ ok: false, error: 'Verification failed. Please refresh the page and try again.' }, { status: 403 });
    }
  }

  // Per-IP rate limit (fail-open) — caps the Resend fan-out from a lead flood.
  // Generous: a real person submits once or twice. Skips silently if no KV/IP.
  {
    const rl = await rateLimit(env, {
      bucket: 'lead',
      ip: request.headers.get('CF-Connecting-IP'),
      limit: 6,
      windowSec: 600,
    });
    if (!rl.ok) {
      return json({ ok: false, error: 'Too many submissions. Please try again in a few minutes.' }, { status: 429 });
    }
  }

  // Validation · keep payloads small so a paste of PHI or any long-form
  // content gets rejected at the edge before it reaches Resend (NOT
  // BAA-eligible). These caps mirror the contact form's max-length attrs.
  const MAX_NAME_LEN = 200;
  const MAX_EMAIL_LEN = 254;
  const MAX_PHONE_LEN = 40;

  if (!name || !String(name).trim()) {
    return json({ ok: false, error: 'Name is required.' }, { status: 400 });
  }
  if (String(name).length > MAX_NAME_LEN) {
    return json({ ok: false, error: 'Name too long.' }, { status: 400 });
  }
  if (!isEmail(email) || String(email).length > MAX_EMAIL_LEN) {
    return json({ ok: false, error: 'A valid email is required.' }, { status: 400 });
  }
  if (phone && String(phone).length > MAX_PHONE_LEN) {
    return json({ ok: false, error: 'Phone field too long.' }, { status: 400 });
  }
  if (!CONTACT_TOPICS.has(String(message))) {
    return json({ ok: false, error: 'Choose one of the non-clinical contact topics.' }, { status: 400 });
  }


  // Env
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: 'Server is not configured. Please email info@vivawellnessco.com.' }, { status: 500 });
  }
  const fromEmail = env.RESEND_FROM_EMAIL || 'Viva Wellness Co. <hello@vivawellnessco.com>';
  const notifyEmail = env.RESEND_NOTIFY_EMAIL || 'info@vivawellnessco.com';
  const audienceId = env.RESEND_AUDIENCE_ID || null;
  const origin = env.SITE_ORIGIN || 'https://vivawellnessco.com';
  // Where the Day 14 nurture CTA points. Falls back to /start (intake page)
  // when no Calendly/booking URL is configured. Same pattern as the page
  // constants in src/pages/start.astro and src/pages/contact.astro.
  const discoveryUrl = env.DISCOVERY_CALL_URL || `${origin}/start/`;
  // Commercial emails include a valid physical postal address. The fallback
  // matches the address already published on the site's legal pages; the env
  // value can override it if Viva's registered mailing address changes.
  const canSpamAddress =
    env.CAN_SPAM_ADDRESS ||
    '5900 Balcones Dr #19640, Austin, TX 78731';
  const educationUrl = `${origin}/blog/`;

  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPhone = String(phone || '').trim();
  const cleanMsg = String(message || '').trim();
  const wantsMarketing = marketingConsent === true || marketingConsent === 'yes';
  // Attribution supplied by a visitor is deliberately discarded. An allowlist
  // of UTM keys or a character limit cannot make health-related values safe.
  // Only the validated, fixed form source belongs in this non-clinical flow.

  // --- Build emails ---
  const leadEmail = wantsMarketing
      ? buildLeadEmail({ name: cleanName, educationUrl, canSpamAddress })
      : buildContactConfirmEmail({ name: cleanName, canSpamAddress });
  const notifyEmailBody = buildNotifyEmail({
    source,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    message: cleanMsg,
  });

  const notifySubject = 'New non-clinical contact request';

  const notifyTo = [notifyEmail];

  // Confirm receipt only after the practice notification is accepted. A
  // visitor acknowledgment alone must never create a false success state.
  let notification;
  try {
    notification = await sendEmail(apiKey, {
      from: fromEmail,
      to: notifyTo,
      subject: notifySubject,
      html: notifyEmailBody.html,
      text: notifyEmailBody.text,
      reply_to: cleanEmail,
    });
  } catch {
    await logEmailEvent(env, {
      to: notifyEmail,
      status: 'send_failed',
      kind: 'notify',
    });
    return json(
      { ok: false, error: 'Email send failed. Please email info@vivawellnessco.com directly.' },
      { status: 502 }
    );
  }

  const [leadResult] = await Promise.allSettled([
    sendEmail(apiKey, {
      from: fromEmail,
      to: [cleanEmail],
      bcc: [notifyEmail],
      subject: wantsMarketing
          ? 'Your Viva email preference is confirmed'
          : 'Viva received your contact request',
      html: leadEmail.html,
      text: leadEmail.text,
      reply_to: notifyEmail,
    }),
  ]);

  // --- Audit log: record the Day-0 sends (best-effort) ---
  // Once the practice has the request, a failed acknowledgment must not ask
  // the visitor to submit it again and create duplicate practice requests.
  await Promise.allSettled([
    logEmailEvent(env, {
      id: leadResult.status === 'fulfilled' ? leadResult.value?.id : null,
      to: cleanEmail,
      status: leadResult.status === 'fulfilled' ? 'sent' : 'send_failed',
      kind: 'lead',
    }),
    logEmailEvent(env, {
      id: notification?.id,
      to: notifyEmail,
      status: 'sent',
      kind: 'notify',
    }),
  ]);

  // Suppression is relevant only to optional marketing. If its store is
  // unavailable, skip all marketing work while preserving receipt of the
  // contact request already accepted above. Unknown does not mean subscribed.
  let suppressionKnown = false;
  let suppressed = true;
  if (wantsMarketing) {
    try {
      suppressed = await isSuppressed(env, cleanEmail);
      suppressionKnown = true;
    } catch {
      // Fail closed for marketing; do not turn a received request into a 500.
    }
  }

  // --- Add to Audience (best-effort, non-blocking failure) ---
  if (audienceId && wantsMarketing && suppressionKnown) {
    try {
      const [firstName, ...rest] = cleanName.split(/\s+/);
      const lastName = rest.join(' ');
      await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          email: cleanEmail,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          unsubscribed: suppressed,
        }),
      });
    } catch {
      // Swallow · audience add is non-critical
    }
  }

  // --- Schedule nurture sequence (best-effort) ---
  // Resend `scheduled_at` holds the email server-side until the target time
  // (supports up to 30 days). All four sends fire at 8 AM America/Chicago.
  // The educational sequence is sent only after explicit opt-in and never
  // incorporates contact-topic or health-intent data. Suppressed contacts
  // are skipped entirely.
  if (wantsMarketing && suppressionKnown && !suppressed) {
    // One-click unsubscribe link (RFC 8058). Null when UNSUB_SECRET is unset,
    // in which case the drip falls back to a mailto/reply-"stop" unsubscribe.
    const unsubscribeUrl = await makeUnsubscribeUrl(origin, env.UNSUB_SECRET, cleanEmail);
    await scheduleNurture(apiKey, {
      env,
      from: fromEmail,
      to: cleanEmail,
      name: cleanName,
      notifyEmail,
      discoveryUrl,
      unsubscribeUrl,
      canSpamAddress,
    });
  }

  if (isNativeForm) {
    return Response.redirect(new URL('/contact/received/', request.url), 303);
  }
  return json({ ok: true });
}

// --- CORS preflight (in case forms are ever cross-origin) ---
// Locked to the production origin. Same-origin requests (the actual forms
// on vivawellnessco.com and on CF Pages preview URLs) don't trigger CORS,
// so this only matters for cross-origin abuse attempts.
export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://vivawellnessco.com',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    },
  });
}

// --- Resend send helper ---
async function sendEmail(apiKey, body) {
  const res = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${text}`);
  }
  return res.json();
}

// --- Email body builders ---
function buildLeadEmail({ name, educationUrl, canSpamAddress }) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const text = [
    `Hi ${first},`,
    ``,
    `Thanks for reaching out to Viva Wellness Co.`,
    ``,
    `Your optional email preference is confirmed.`,
    ``,
    `Viva will send occasional practice updates and new educational articles.`,
    `You can browse the current education hub here:`,
    educationUrl,
    ``,
    `This email list is not a clinical channel. Current patients should use`,
    `the secure patient portal for symptoms, labs, diagnoses, or medications.`,
    ``,
    `Talk soon,`,
    `Liliana Damron, APRN, FNP-BC`,
    `Founder, Viva Wellness Co.`,
    `vivawellnessco.com · (737) 210-7283 · @vivawellnessatx`,
  ].join('\n');

  const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0c0a09;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr><td style="background:#0c0a09;padding:28px 32px;">
          <div style="font-family:'Anton','Impact',Arial Narrow,sans-serif;font-size:28px;color:#f5f1ea;letter-spacing:0.02em;text-transform:uppercase;">
            Viva Wellness Co.
          </div>
          <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9783a;margin-top:6px;">
            Provider-led telehealth &nbsp;·&nbsp; Clear education
          </div>
        </td></tr>

        <tr><td style="padding:36px 32px 8px 32px;">
          <h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;line-height:1.15;letter-spacing:-0.01em;color:#0c0a09;margin:0 0 12px 0;">
            Hi ${esc(first)}, you are opted in.
          </h1>
          <p style="font-size:16px;line-height:1.6;color:#2a2420;margin:0 0 20px 0;">
            Your optional email preference is confirmed. Viva will send occasional
            practice updates and new educational articles. You can unsubscribe at any time.
          </p>
        </td></tr>

        <tr><td style="padding:8px 32px 28px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td style="background:#c9783a;border-radius:2px;">
              <a href="${esc(educationUrl)}"
                 style="display:inline-block;padding:14px 26px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#0c0a09;text-decoration:none;">
                Browse patient education &nbsp;→
              </a>
            </td></tr>
          </table>
          <p style="font-size:13px;color:#8a7d72;margin:14px 0 0 0;">
            Or copy and paste: <a href="${esc(educationUrl)}" style="color:#8a4d22;">${esc(educationUrl)}</a>
          </p>
        </td></tr>

        <tr><td style="padding:0 32px 28px 32px;border-top:1px solid #ebe5db;padding-top:24px;">
          <p style="font-size:15px;line-height:1.6;color:#2a2420;margin:0 0 12px 0;">
            This email list is not a clinical channel. Please do not reply with
            symptoms, lab results, diagnoses, or medication details. Current
            patients should use the secure patient portal.
          </p>
          <p style="font-size:15px;line-height:1.6;color:#2a2420;margin:18px 0 4px 0;">Talk soon,</p>
          <p style="font-family:Georgia,serif;font-style:italic;font-size:18px;color:#0c0a09;margin:0 0 2px 0;">Liliana Damron, APRN, FNP-BC</p>
          <p style="font-size:13px;color:#8a7d72;margin:0;">Founder &amp; Provider, Viva Wellness Co.</p>
        </td></tr>

        <tr><td style="background:#f5f1ea;padding:20px 32px;font-size:11px;color:#8a7d72;line-height:1.6;border-top:1px solid #ebe5db;">
          <strong>Viva Wellness Co.</strong> &nbsp;·&nbsp; 100% Telehealth &nbsp;·&nbsp; TX, CO, FL, IA<br/>
          ${esc(canSpamAddress)}<br/>
          <a href="https://vivawellnessco.com" style="color:#8a4d22;text-decoration:none;">vivawellnessco.com</a> &nbsp;·&nbsp;
          <a href="tel:+17372107283" style="color:#8a4d22;text-decoration:none;">(737) 210-7283</a> &nbsp;·&nbsp;
          <a href="https://instagram.com/vivawellnessatx" style="color:#8a4d22;text-decoration:none;">@vivawellnessatx</a>
          <br/><br/>
          This message was sent because you submitted a form on vivawellnessco.com.
          Not medical advice. All therapies require provider review and approval.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  return { html, text };
}

function buildContactConfirmEmail({ name, canSpamAddress }) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const text = [
    `Hi ${first},`,
    ``,
    `Viva Wellness Co. received your non-clinical contact request.`,
    `A member of the practice will follow up about scheduling, pricing, partnerships, or your other selected topic.`,
    ``,
    `Please do not reply with symptoms, lab results, diagnoses, or medication details. Clinical communication belongs in the secure patient portal.`,
    ``,
    `Viva Wellness Co.`,
    `(737) 210-7283 · vivawellnessco.com`,
    canSpamAddress,
  ].join('\n');

  const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f8f6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#14251b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fffdf8;border-top:6px solid #f1a88d;padding:32px;">
        <tr><td>
          <h1 style="font-family:Georgia,serif;font-weight:400;font-size:30px;line-height:1.2;margin:0 0 16px;">We received your request.</h1>
          <p style="font-size:16px;line-height:1.65;margin:0 0 16px;">Hi ${esc(first)}, a member of Viva Wellness Co. will follow up about the non-clinical topic you selected.</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 22px;color:#526158;"><strong>This is not a clinical channel.</strong> Please do not reply with symptoms, lab results, diagnoses, or medication details. Clinical communication belongs in the secure patient portal.</p>
          <p style="font-size:14px;line-height:1.6;margin:0;color:#526158;">Viva Wellness Co. · (737) 210-7283<br/>${esc(canSpamAddress)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  return { html, text };
}

// --- Opted-in educational sequence ---
// Four general emails are scheduled at 8 AM America/Chicago. The sequence
// never uses a visitor's guide answers, selected contact topic, or inferred
// health interests to personalize medical messaging.
async function scheduleNurture(apiKey, { env, from, to, name, notifyEmail, discoveryUrl, unsubscribeUrl, canSpamAddress }) {
  const now = Date.now();

  const sends = [
    { day: 1, at: central8amAfterDays(now, 1), build: () => buildNurtureDay1({ name, discoveryUrl, unsubscribeUrl, canSpamAddress }) },
    { day: 3, at: central8amAfterDays(now, 3), build: () => buildNurtureDay3({ name, unsubscribeUrl, canSpamAddress }) },
    { day: 7, at: central8amAfterDays(now, 7), build: () => buildNurtureDay7({ name, unsubscribeUrl, canSpamAddress }) },
    { day: 14, at: central8amAfterDays(now, 14), build: () => buildNurtureDay14({ name, discoveryUrl, unsubscribeUrl, canSpamAddress }) },
  ];

  // List-Unsubscribe: prefer the one-click HTTPS endpoint when we have a
  // signed URL, and always keep the mailto as a fallback. The One-Click POST
  // header only makes sense alongside the HTTPS variant.
  const unsubHeader = unsubscribeUrl
    ? `<${unsubscribeUrl}>, <mailto:${notifyEmail}?subject=Unsubscribe>`
    : `<mailto:${notifyEmail}?subject=Unsubscribe>`;
  const unsubHeaders = unsubscribeUrl
    ? { 'List-Unsubscribe': unsubHeader, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : { 'List-Unsubscribe': unsubHeader };

  // Build first so we keep each send's subject/day for the audit log; the
  // send response only carries the id.
  const built = sends.map(({ day, at }, i) => ({ day, at, ...sends[i].build() }));

  // Failures here don't fail the request · the Day 0 email already went
  // through. Worst case is one or more followups didn't get queued.
  const results = await Promise.allSettled(
    built.map(({ at, subject, html, text }) =>
      sendEmail(apiKey, {
        from,
        to: [to],
        subject,
        html,
        text,
        reply_to: notifyEmail,
        scheduled_at: new Date(at).toISOString(),
        headers: unsubHeaders,
      })
    )
  );

  // Persist the Resend IDs of the queued sends so we can cancel them if the
  // lead unsubscribes, complains, or bounces before the sequence finishes.
  const ids = results
    .filter((r) => r.status === 'fulfilled' && r.value && r.value.id)
    .map((r) => r.value.id);
  await recordScheduled(env, to, ids);

  // Audit log: one `scheduled` event per queued nurture send (best-effort).
  await Promise.allSettled(
    results.map((r, i) =>
      logEmailEvent(env, {
        id: r.status === 'fulfilled' && r.value ? r.value.id : null,
        to,
        status: r.status === 'fulfilled' ? 'scheduled' : 'send_failed',
        kind: `nurture-day${built[i].day}`,
      })
    )
  );
}

// Epoch-ms for 8:00 AM America/Chicago, `addDays` after the Chicago calendar
// date of `fromMs`. Keeps the whole drip on a steady 8 AM Central cadence and
// stays correct across daylight-saving shifts (the offset is resolved per
// target date rather than assumed). Day 1 from a 9 PM submission lands ~11
// hours out; from a 7 AM submission it lands the next morning · always the
// "following day at 8 AM" the copy promises.
function central8amAfterDays(fromMs, addDays) {
  const tz = 'America/Chicago';
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const map = {};
  for (const p of dtf.formatToParts(new Date(fromMs))) map[p.type] = p.value;
  // Chicago calendar date of submission, shifted forward by addDays.
  const base = new Date(Date.UTC(+map.year, +map.month - 1, +map.day + addDays));
  return zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), 8, 0, tz);
}

// Convert a wall-clock time in `tz` to its UTC epoch-ms.
function zonedTimeToUtc(year, month, day, hour, minute, tz) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  return guess - tzOffsetMs(guess, tz);
}

// How far `tz` runs ahead of UTC (ms) at a given instant. Negative for the
// Americas. Derived by formatting the instant into `tz` and diffing.
function tzOffsetMs(utcMs, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) map[p.type] = p.value;
  const hour = map.hour === '24' ? 0 : +map.hour; // some engines emit '24' for midnight
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, hour, +map.minute, +map.second);
  return asUTC - utcMs;
}

// Day 1 · a practical overview of the first-visit decision.
function buildNurtureDay1({ name, discoveryUrl, unsubscribeUrl, canSpamAddress }) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const subject = 'What to expect from a first Viva visit';

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Hi ${esc(first)},</p>

    <p style="margin:0 0 16px 0;">Thank you for asking to receive Viva's practice updates and new educational articles.</p>

    <p style="margin:0 0 16px 0;">A first visit is a 45-minute clinical evaluation with Liliana. It costs $199, with a $50 deposit due at booking. The visit is separate from any membership.</p>

    <p style="margin:0 0 24px 0;">Bring your medication and supplement list and any recent labs you have. Liliana reviews your history, goals, available information, options, risks, costs, and next steps. Booking a visit does not guarantee a prescription or eligibility for a particular treatment.</p>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr><td style="background:#c9783a;border-radius:2px;">
        <a href="${esc(discoveryUrl)}"
           style="display:inline-block;padding:14px 26px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#0c0a09;text-decoration:none;">
          Review and book a first visit &nbsp;→
        </a>
      </td></tr>
    </table>

    <p style="font-size:13px;color:#8a7d72;margin:14px 0 20px 0;">
      Or copy and paste: <a href="${esc(discoveryUrl)}" style="color:#8a4d22;">${esc(discoveryUrl)}</a>
    </p>

    <p style="margin:0;">Please do not reply with symptoms, lab results, diagnoses, or medication details. Current patients should use the secure patient portal for clinical communication.</p>
  `;

  const text = [
    `Hi ${first},`,
    ``,
    `Thank you for asking to receive Viva's practice updates and new educational articles.`,
    ``,
    `A first visit is a 45-minute clinical evaluation with Liliana. It costs $199, with a $50 deposit due at booking. The visit is separate from any membership.`,
    ``,
    `Bring your medication and supplement list and any recent labs you have. Liliana reviews your history, goals, available information, options, risks, costs, and next steps. Booking a visit does not guarantee a prescription or eligibility for a particular treatment.`,
    ``,
    `Review the first-visit details and book when you are ready:`,
    ``,
    `  ${discoveryUrl}`,
    ``,
    `Please do not reply with symptoms, lab results, diagnoses, or medication details. Current patients should use the secure patient portal for clinical communication.`,
    ``,
    `Talk soon,`,
    `Liliana Damron, APRN, FNP-BC`,
    `Founder, Viva Wellness Co.`,
  ].join('\n');

  const html = nurtureWrap({ eyebrow: 'Follow-up · Day 1', title: subject, bodyHtml, canSpamAddress, unsubscribeUrl });
  return { subject, html, text };
}

// Shared HTML shell for nurture emails. Mirrors buildLeadEmail's visual
// language so the sequence reads as one voice across all four sends.
function nurtureWrap({ eyebrow, title, bodyHtml, canSpamAddress, unsubscribeUrl }) {
  // One-click link when we have a signed URL; otherwise the reply-"stop"
  // fallback (which Liliana / info@ monitors manually).
  const unsubHtml = unsubscribeUrl
    ? `Not in the mood for follow-ups? <a href="${esc(unsubscribeUrl)}" style="color:#8a4d22;text-decoration:underline;">Unsubscribe in one click</a> or reply with "stop".`
    : `Not in the mood for follow-ups? Just reply with "stop" and I will take you off the sequence.`;
  return `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0c0a09;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr><td style="background:#0c0a09;padding:28px 32px;">
          <div style="font-family:'Anton','Impact',Arial Narrow,sans-serif;font-size:28px;color:#f5f1ea;letter-spacing:0.02em;text-transform:uppercase;">
            Viva Wellness Co.
          </div>
          <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9783a;margin-top:6px;">
            ${esc(eyebrow)}
          </div>
        </td></tr>

        <tr><td style="padding:36px 32px 8px 32px;">
          <h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;line-height:1.2;letter-spacing:-0.01em;color:#0c0a09;margin:0 0 16px 0;">
            ${esc(title)}
          </h1>
        </td></tr>

        <tr><td style="padding:0 32px 24px 32px;font-size:16px;line-height:1.65;color:#2a2420;">
          ${bodyHtml}
        </td></tr>

        <tr><td style="padding:8px 32px 28px 32px;border-top:1px solid #ebe5db;padding-top:24px;">
          <p style="font-size:15px;line-height:1.6;color:#2a2420;margin:0 0 4px 0;">Talk soon,</p>
          <p style="font-family:Georgia,serif;font-style:italic;font-size:18px;color:#0c0a09;margin:0 0 2px 0;">Liliana Damron, APRN, FNP-BC</p>
          <p style="font-size:13px;color:#8a7d72;margin:0;">Founder &amp; Provider, Viva Wellness Co.</p>
        </td></tr>

        <tr><td style="background:#f5f1ea;padding:20px 32px;font-size:11px;color:#8a7d72;line-height:1.6;border-top:1px solid #ebe5db;">
          <strong>Viva Wellness Co.</strong> &nbsp;·&nbsp; 100% Telehealth &nbsp;·&nbsp; TX, CO, FL, IA<br/>
          ${esc(canSpamAddress)}<br/>
          <a href="https://vivawellnessco.com" style="color:#8a4d22;text-decoration:none;">vivawellnessco.com</a> &nbsp;·&nbsp;
          <a href="tel:+17372107283" style="color:#8a4d22;text-decoration:none;">(737) 210-7283</a>
          <br/><br/>
          ${unsubHtml}
          <br/>Not medical advice. All therapies require provider review and approval.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

// Day 3 · general questions that improve an informed first-visit decision.
function buildNurtureDay3({ name, unsubscribeUrl, canSpamAddress }) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const subject = 'Three questions to ask before choosing telehealth care';
  const intro = `A convenient visit still needs enough information, clear boundaries, and transparent costs. These questions can help you compare any telehealth practice.`;
  const items = [
    ['Who evaluates and follows me?', `Confirm the provider's name, credentials, licensed service area, and whether the same person remains involved after the first visit.`],
    ['What is included in the published price?', `Ask which visits, labs, medications, supplies, shipping, and follow-up are included and which may be billed separately.`],
    ['What happens if my preferred option is not appropriate?', `A credible practice should explain alternatives, when in-person or specialty care is needed, and that a visit does not guarantee a prescription.`],
  ];

  const itemsHtml = items
    .map(
      ([h, body], i) =>
        `<div style="margin:0 0 18px 0;">
          <div style="font-weight:600;color:#0c0a09;margin-bottom:4px;">${i + 1}. ${esc(h)}</div>
          <div style="color:#2a2420;">${esc(body)}</div>
        </div>`
    )
    .join('');

  const itemsText = items
    .map(([h, body], i) => `${i + 1}. ${h}\n   ${body}\n`)
    .join('\n');

  const closing = `Viva publishes provider, service-area, price, and first-visit details so you can compare before booking. Please keep replies non-clinical; current patients should use the secure portal.`;

  const bodyHtml = `
    <p style="margin:0 0 18px 0;">Hi ${esc(first)},</p>
    <p style="margin:0 0 20px 0;">${esc(intro)}</p>
    ${itemsHtml}
    <p style="margin:18px 0 0 0;">${esc(closing)}</p>
  `;

  const text = [
    `Hi ${first},`,
    ``,
    intro,
    ``,
    itemsText,
    closing,
    ``,
    `Talk soon,`,
    `Liliana Damron, APRN, FNP-BC`,
    `Founder, Viva Wellness Co.`,
  ].join('\n');

  const html = nurtureWrap({ eyebrow: 'Follow-up · Day 3', title: subject, bodyHtml, canSpamAddress, unsubscribeUrl });
  return { subject, html, text };
}

// Day 7 · how Viva handles safety questions without making blanket claims.
function buildNurtureDay7({ name, unsubscribeUrl, canSpamAddress }) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const subject = 'How to have a useful safety conversation';

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Hi ${esc(first)},</p>

    <p style="margin:0 0 16px 0;">A useful answer to “is this safe for me?” depends on the exact treatment, your history, other medications, monitoring needs, and the quality of the available evidence.</p>

    <p style="margin:0 0 16px 0;"><strong>Ask about product status.</strong> FDA-approved and compounded medications are not interchangeable labels. Compounded drugs are not FDA-approved, and FDA does not review them for safety, effectiveness, or quality before dispensing.</p>

    <p style="margin:0 0 16px 0;"><strong>Ask what information changes the decision.</strong> History, examination, labs when appropriate, contraindications, alternatives, and follow-up can matter differently for each person and treatment.</p>

    <p style="margin:0 0 16px 0;"><strong>Ask what remains uncertain.</strong> A clinician should be able to explain both what evidence supports and what it does not establish, without promising an outcome.</p>

    <p style="margin:18px 0 0 0;">Please keep email replies non-clinical. Current patients should use the secure portal for individual questions.</p>
  `;

  const text = [
    `Hi ${first},`,
    ``,
    `A useful answer to “is this safe for me?” depends on the exact treatment, your history, other medications, monitoring needs, and the quality of the available evidence.`,
    ``,
    `Ask about product status. FDA-approved and compounded medications are not interchangeable labels. Compounded drugs are not FDA-approved, and FDA does not review them for safety, effectiveness, or quality before dispensing.`,
    ``,
    `Ask what information changes the decision. History, examination, labs when appropriate, contraindications, alternatives, and follow-up can matter differently for each person and treatment.`,
    ``,
    `Ask what remains uncertain. A clinician should be able to explain both what evidence supports and what it does not establish, without promising an outcome.`,
    ``,
    `Please keep email replies non-clinical. Current patients should use the secure portal for individual questions.`,
    ``,
    `Talk soon,`,
    `Liliana Damron, APRN, FNP-BC`,
    `Founder, Viva Wellness Co.`,
  ].join('\n');

  const html = nurtureWrap({ eyebrow: 'Follow-up · Day 7', title: subject, bodyHtml, canSpamAddress, unsubscribeUrl });
  return { subject, html, text };
}

// Day 14 · soft close + discovery CTA. Explicitly the last automated
// touch: "I will get out of your inbox" makes the gracefully-ending
// nature of the sequence the point, not an apology.
function buildNurtureDay14({ name, discoveryUrl, unsubscribeUrl, canSpamAddress }) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const subject = 'Still here if you want to talk';

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Hi ${esc(first)},</p>

    <p style="margin:0 0 16px 0;">It has been a couple of weeks since you reached out, so I figured I would check in once more. Then I will get out of your inbox.</p>

    <p style="margin:0 0 16px 0;">If Viva may fit what you are looking for, the next step is the published 45-minute, $199 first visit. Review the process, price, service area, and what to bring before choosing a time.</p>

    <p style="margin:0 0 24px 0;">If it is not the right time, that is fine too. No action is required.</p>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr><td style="background:#c9783a;border-radius:2px;">
        <a href="${esc(discoveryUrl)}"
           style="display:inline-block;padding:14px 26px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#0c0a09;text-decoration:none;">
          Review the first visit &nbsp;→
        </a>
      </td></tr>
    </table>

    <p style="font-size:13px;color:#8a7d72;margin:14px 0 20px 0;">
      Or copy and paste: <a href="${esc(discoveryUrl)}" style="color:#8a4d22;">${esc(discoveryUrl)}</a>
    </p>

    <p style="margin:0;">For non-clinical questions, use Viva's contact page. Current patients should use the secure portal. Either way · thank you for letting me into your inbox.</p>
  `;

  const text = [
    `Hi ${first},`,
    ``,
    `It has been a couple of weeks since you reached out, so I figured I would check in once more. Then I will get out of your inbox.`,
    ``,
    `If Viva may fit what you are looking for, the next step is the published 45-minute, $199 first visit. Review the process, price, service area, and what to bring before choosing a time.`,
    ``,
    `If it is not the right time, that is fine too. No action is required. When you are ready, here is the link to review the first visit:`,
    ``,
    `  ${discoveryUrl}`,
    ``,
    `For non-clinical questions, use Viva's contact page. Current patients should use the secure portal.`,
    ``,
    `Either way, thank you for letting me into your inbox.`,
    ``,
    `Talk soon,`,
    `Liliana Damron, APRN, FNP-BC`,
    `Founder, Viva Wellness Co.`,
  ].join('\n');

  const html = nurtureWrap({ eyebrow: 'Follow-up · Day 14', title: subject, bodyHtml, canSpamAddress, unsubscribeUrl });
  return { subject, html, text };
}

function buildNotifyEmail({ source, name, email, phone, message }) {
  const rows = [
    ['Source', source],
    ['Name', name],
    ['Email', email],
    ['Phone', phone || '(not provided)'],
  ];
  if (message) {
    rows.push(['Topic', message]);
  }
  rows.push(['Submitted', new Date().toISOString()]);

  const text =
    `New ${source} lead\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  const html = `
<!doctype html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0c0a09;background:#f5f1ea;margin:0;padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;padding:24px;border-radius:4px;">
        <tr><td>
          <h2 style="font-family:Georgia,serif;margin:0 0 16px 0;font-size:22px;">New ${esc(source)} lead</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${rows
              .map(
                ([k, v]) =>
                  `<tr>
                    <td style="padding:8px 12px 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#8a7d72;width:140px;vertical-align:top;border-bottom:1px solid #ebe5db;">${esc(k)}</td>
                    <td style="padding:8px 0;font-size:14px;color:#0c0a09;vertical-align:top;border-bottom:1px solid #ebe5db;">${esc(v).replace(/\n/g, '<br/>')}</td>
                  </tr>`
              )
              .join('')}
          </table>
          <p style="font-size:12px;color:#8a7d72;margin:20px 0 0 0;">Reply directly to this email to respond to the lead.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  return { html, text };
}
