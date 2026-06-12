/**
 * /api/lead · Cloudflare Pages Function
 *
 * Handles lead submissions from /contact and /quiz.
 * Sends:
 *   1. eBook delivery email to the lead (with download link)
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
 *   SITE_ORIGIN            · optional. Used to build the eBook download link.
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

const RESEND_API = 'https://api.resend.com';

// --- helpers ---
const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));

const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Cloudflare Turnstile server-side verification. Returns true to allow the
// submission. A missing token is treated as a failed challenge (bots that skip
// the widget); a token present but an unreachable siteverify endpoint fails
// OPEN so a Cloudflare hiccup never drops a real lead.
async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: String(token) });
    if (ip) body.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    const d = await r.json();
    return !!(d && d.success);
  } catch {
    return true;
  }
}

// --- main handler ---
export async function onRequestPost(context) {
  const { request, env } = context;

  // Parse body
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const {
    source = 'contact',
    name = '',
    email = '',
    phone = '',
    message = '',
    company = '',   // honeypot
    quiz = null,
    match = null,
    utm = null,
    referrer = '',
    referee = null,        // for source=refer: { name, email }
    referrer_page = '',    // /refer form sends this in place of referrer for the page-referrer
  } = payload || {};

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

  // Validation · keep payloads small so a paste of PHI or any long-form
  // content gets rejected at the edge before it reaches Resend (NOT
  // BAA-eligible). These caps mirror the contact form's max-length attrs.
  const MAX_NAME_LEN = 200;
  const MAX_MSG_LEN = 5000;
  const MAX_PHONE_LEN = 40;

  if (!name || !String(name).trim()) {
    return json({ ok: false, error: 'Name is required.' }, { status: 400 });
  }
  if (String(name).length > MAX_NAME_LEN) {
    return json({ ok: false, error: 'Name too long.' }, { status: 400 });
  }
  if (!isEmail(email)) {
    return json({ ok: false, error: 'A valid email is required.' }, { status: 400 });
  }
  if (phone && String(phone).length > MAX_PHONE_LEN) {
    return json({ ok: false, error: 'Phone field too long.' }, { status: 400 });
  }
  if (message && String(message).length > MAX_MSG_LEN) {
    return json({ ok: false, error: 'Message too long. Please email info@vivawellnessco.com.' }, { status: 400 });
  }

  // Referrals · validate referee data
  if (source === 'refer') {
    if (!referee || !referee.email || !isEmail(referee.email)) {
      return json({ ok: false, error: 'Referee email is required.' }, { status: 400 });
    }
    if (!referee.name || !String(referee.name).trim()) {
      return json({ ok: false, error: 'Referee name is required.' }, { status: 400 });
    }
    if (String(referee.name).length > MAX_NAME_LEN) {
      return json({ ok: false, error: 'Referee name too long.' }, { status: 400 });
    }
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
  const discoveryUrl = env.DISCOVERY_CALL_URL || `${origin}/start`;
  // Federal CAN-SPAM Act requires a "valid physical postal address" in every
  // commercial email · $51,744 max civil penalty per violation. Set
  // CAN_SPAM_ADDRESS env var in Cloudflare Pages dashboard to the real
  // registered business mailing address (street or PO Box, city, state, zip).
  // The placeholder fallback is intentionally obvious so unset deployments
  // self-flag rather than silently shipping non-compliant emails.
  const canSpamAddress =
    env.CAN_SPAM_ADDRESS ||
    '[postal address not configured · set CAN_SPAM_ADDRESS env var]';
  // Per-vertical lead magnet: the quiz match can specify its own ebookPath
  // (see src/lib/quiz.ts). Defaults to the generic eBook. Path is validated
  // to start with a single leading slash to prevent open-redirect abuse.
  const requestedEbook = match && typeof match.ebookPath === 'string' ? match.ebookPath : '';
  const safeEbookPath = /^\/[A-Za-z0-9_\-./]+\.pdf$/.test(requestedEbook)
    ? requestedEbook
    : '/viva-ebook.pdf';
  const ebookUrl = `${origin}${safeEbookPath}`;

  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPhone = String(phone || '').trim();
  const cleanMsg = String(message || '').trim();

  // --- Build emails ---
  // Referral submissions are a different shape: the lead-side email goes to
  // the referrer (confirmation), the notify email captures both names, and
  // we skip the eBook attachment (it goes to the referee instead, see below).
  const isReferral = source === 'refer' && referee && referee.email;
  const cleanReferee = isReferral
    ? {
        name: String(referee.name || '').trim(),
        email: String(referee.email || '').trim().toLowerCase(),
      }
    : null;

  const leadEmail = isReferral
    ? buildReferrerConfirmEmail({ referrerName: cleanName, referee: cleanReferee, canSpamAddress })
    : buildLeadEmail({ name: cleanName, ebookUrl, canSpamAddress });
  const notifyEmailBody = buildNotifyEmail({
    source,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    message: cleanMsg,
    quiz,
    match,
    utm,
    referrer: String(referrer || referrer_page || '').trim(),
    referee: cleanReferee,
  });

  // Subject suffix from UTM content/source for fast triage in the inbox
  const utmTag =
    utm && (utm.utm_content || utm.utm_source)
      ? ` [${utm.utm_content || utm.utm_source}]`
      : '';

  const notifySubject = isReferral
    ? `New referral from ${cleanName}: ${cleanReferee.name}${utmTag}`
    : `New ${source === 'quiz' ? 'quiz match' : 'contact lead'}: ${cleanName}${utmTag}`;

  // --- Send emails in parallel ---
  // For non-referrals: eBook + notify.
  // For referrals: confirmation to referrer + notify. Outreach to referee is
  // intentionally provider-initiated (Liliana writes the intro personally,
  // not an automated email) so we don't email them from here.
  const results = await Promise.allSettled([
    sendEmail(apiKey, {
      from: fromEmail,
      to: [cleanEmail],
      bcc: [notifyEmail],
      subject: isReferral
        ? 'Thanks for the referral'
        : 'Your Viva Wellness eBook is here',
      html: leadEmail.html,
      text: leadEmail.text,
      reply_to: notifyEmail,
    }),
    sendEmail(apiKey, {
      from: fromEmail,
      to: [notifyEmail],
      subject: notifySubject,
      html: notifyEmailBody.html,
      text: notifyEmailBody.text,
      reply_to: cleanEmail,
    }),
  ]);

  // If the lead email failed outright, surface an error. Log the failure first
  // so it shows up on the delivery dashboard rather than vanishing.
  const leadResult = results[0];
  if (leadResult.status === 'rejected') {
    await logEmailEvent(env, {
      to: cleanEmail,
      status: 'send_failed',
      kind: isReferral ? 'referrer-confirm' : 'lead',
    });
    return json(
      { ok: false, error: 'Email send failed. Please email info@vivawellnessco.com directly.' },
      { status: 502 }
    );
  }

  // --- Audit log: record the Day-0 sends (best-effort) ---
  await Promise.allSettled([
    logEmailEvent(env, {
      id: leadResult.value && leadResult.value.id,
      to: cleanEmail,
      status: 'sent',
      kind: isReferral ? 'referrer-confirm' : 'lead',
    }),
    logEmailEvent(env, {
      id: results[1].status === 'fulfilled' && results[1].value ? results[1].value.id : null,
      to: notifyEmail,
      status: results[1].status === 'fulfilled' ? 'sent' : 'send_failed',
      kind: 'notify',
    }),
  ]);

  // Has this lead previously unsubscribed / been flagged for spam or bounce?
  // If so we honor that: no drip, and the Audience add is marked unsubscribed.
  // (The Day 0 email above still went · it's the transactional eBook they just
  // asked for, not marketing.)
  const suppressed = await isSuppressed(env, cleanEmail);

  // --- Add to Audience (best-effort, non-blocking failure) ---
  if (audienceId) {
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
  // Day 1 (thank-you + discovery-call offer) and Day 3 are match-tailored;
  // Days 7 and 14 are match-agnostic. Referrals are skipped: the referee gets
  // a personal intro from Liliana instead of an automated drip, and the
  // referrer already has the confirmation in hand. Suppressed leads are
  // skipped entirely.
  if (!isReferral && !suppressed) {
    // One-click unsubscribe link (RFC 8058). Null when UNSUB_SECRET is unset,
    // in which case the drip falls back to a mailto/reply-"stop" unsubscribe.
    const unsubscribeUrl = await makeUnsubscribeUrl(origin, env.UNSUB_SECRET, cleanEmail);
    await scheduleNurture(apiKey, {
      env,
      from: fromEmail,
      to: cleanEmail,
      name: cleanName,
      match,
      notifyEmail,
      discoveryUrl,
      unsubscribeUrl,
      canSpamAddress,
    });
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
function buildLeadEmail({ name, ebookUrl, canSpamAddress }) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const text = [
    `Hi ${first},`,
    ``,
    `Thanks for reaching out to Viva Wellness Co.`,
    ``,
    `Your copy of the Precision Hormone & Peptide Therapy eBook is ready:`,
    ebookUrl,
    ``,
    `Liliana will send a short note tomorrow morning with an easy way to talk`,
    `things through if you would like. No pressure either way · the eBook is`,
    `yours to keep.`,
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
            Peptides &nbsp;·&nbsp; Hormone Optimization &nbsp;·&nbsp; Weight Loss
          </div>
        </td></tr>

        <tr><td style="padding:36px 32px 8px 32px;">
          <h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;line-height:1.15;letter-spacing:-0.01em;color:#0c0a09;margin:0 0 12px 0;">
            Hi ${esc(first)}, your eBook is ready.
          </h1>
          <p style="font-size:16px;line-height:1.6;color:#2a2420;margin:0 0 20px 0;">
            Thanks for reaching out to Viva Wellness Co. The Precision Hormone &amp;
            Peptide Therapy guide is below. It is plain-language, honest, and built
            to make your consult faster.
          </p>
        </td></tr>

        <tr><td style="padding:8px 32px 28px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td style="background:#c9783a;border-radius:2px;">
              <a href="${esc(ebookUrl)}"
                 style="display:inline-block;padding:14px 26px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#0c0a09;text-decoration:none;">
                Download the eBook &nbsp;→
              </a>
            </td></tr>
          </table>
          <p style="font-size:13px;color:#8a7d72;margin:14px 0 0 0;">
            Or copy and paste: <a href="${esc(ebookUrl)}" style="color:#8a4d22;">${esc(ebookUrl)}</a>
          </p>
        </td></tr>

        <tr><td style="padding:0 32px 28px 32px;border-top:1px solid #ebe5db;padding-top:24px;">
          <p style="font-size:15px;line-height:1.6;color:#2a2420;margin:0 0 12px 0;">
            Liliana will send a short note tomorrow morning with an easy way to
            talk things through if you would like. No pressure either way · the
            eBook is yours to keep.
          </p>
          <p style="font-size:15px;line-height:1.6;color:#2a2420;margin:18px 0 4px 0;">Talk soon,</p>
          <p style="font-family:Georgia,serif;font-style:italic;font-size:18px;color:#0c0a09;margin:0 0 2px 0;">Liliana Damron, APRN, FNP-BC</p>
          <p style="font-size:13px;color:#8a7d72;margin:0;">Founder &amp; Provider, Viva Wellness Co.</p>
        </td></tr>

        <tr><td style="background:#f5f1ea;padding:20px 32px;font-size:11px;color:#8a7d72;line-height:1.6;border-top:1px solid #ebe5db;">
          <strong>Viva Wellness Co.</strong> &nbsp;·&nbsp; 100% Telehealth &nbsp;·&nbsp; TX, CO, FL<br/>
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

function buildReferrerConfirmEmail({ referrerName, referee, canSpamAddress }) {
  const first = (referrerName || '').split(/\s+/)[0] || 'there';
  const refereeName = (referee && referee.name) || 'your friend';
  const text = [
    `Hi ${first},`,
    ``,
    `Thanks for the introduction to ${refereeName}.`,
    ``,
    `Here is what happens next:`,
    `  1. Liliana reaches out to ${refereeName} personally with the eBook and a quick intro.`,
    `  2. If they enroll in any Viva membership tier, I credit your account automatically.`,
    `  3. You get an email when that happens so you know to expect it on your next invoice.`,
    ``,
    `There is no cap on referrals. Credits do not expire.`,
    ``,
    `Talk soon,`,
    `Liliana Damron, APRN, FNP-BC`,
    `Founder, Viva Wellness Co.`,
    `vivawellnessco.com · (737) 210-7283`,
  ].join('\n');

  const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0c0a09;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr><td style="background:#0c0a09;padding:28px 32px;">
          <div style="font-family:Georgia,serif;font-size:24px;color:#f5f1ea;letter-spacing:0.01em;">Viva Wellness Co.</div>
          <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9783a;margin-top:6px;">
            Member Referral &nbsp;·&nbsp; Confirmation
          </div>
        </td></tr>
        <tr><td style="padding:36px 32px 8px 32px;">
          <h1 style="font-family:Georgia,serif;font-weight:400;font-size:28px;line-height:1.2;letter-spacing:-0.01em;color:#0c0a09;margin:0 0 12px 0;">
            Thanks for the intro, ${esc(first)}.
          </h1>
          <p style="font-size:16px;line-height:1.6;color:#2a2420;margin:0 0 16px 0;">
            I received your referral for <strong>${esc(refereeName)}</strong>. Here is what happens next.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 24px 32px;">
          <ol style="font-size:15px;line-height:1.6;color:#2a2420;padding-left:18px;margin:0;">
            <li style="margin-bottom:10px;">Liliana reaches out to ${esc(refereeName)} personally with the eBook and a brief introduction.</li>
            <li style="margin-bottom:10px;">If they enroll in any Viva membership tier, I credit your account automatically.</li>
            <li>You get an email confirmation when the credit lands on your next invoice.</li>
          </ol>
          <p style="font-size:14px;color:#8a7d72;margin:20px 0 0 0;">No cap on referrals. Credits do not expire.</p>
        </td></tr>
        <tr><td style="padding:0 32px 28px 32px;border-top:1px solid #ebe5db;padding-top:24px;">
          <p style="font-size:15px;line-height:1.6;color:#2a2420;margin:18px 0 4px 0;">Thanks again,</p>
          <p style="font-family:Georgia,serif;font-style:italic;font-size:18px;color:#0c0a09;margin:0 0 2px 0;">Liliana Damron, APRN, FNP-BC</p>
          <p style="font-size:13px;color:#8a7d72;margin:0;">Founder &amp; Provider, Viva Wellness Co.</p>
        </td></tr>
        <tr><td style="background:#f5f1ea;padding:20px 32px;font-size:11px;color:#8a7d72;line-height:1.6;border-top:1px solid #ebe5db;">
          <strong>Viva Wellness Co.</strong> &nbsp;·&nbsp; 100% Telehealth &nbsp;·&nbsp; TX, CO, FL<br/>
          ${esc(canSpamAddress)}<br/>
          <a href="https://vivawellnessco.com" style="color:#8a4d22;text-decoration:none;">vivawellnessco.com</a> &nbsp;·&nbsp;
          <a href="tel:+17372107283" style="color:#8a4d22;text-decoration:none;">(737) 210-7283</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  return { html, text };
}

// --- Nurture sequence ---
// Four emails scheduled via Resend `scheduled_at` after the Day 0 send, each
// fired at 8 AM America/Chicago so the cadence is predictable no matter when
// the form was submitted:
//   Day 1  · personal thank-you + first discovery-call offer (match-aware)
//   Day 3  · match-tailored "three things people get wrong"
//   Day 7  · the long-term-safety objection
//   Day 14 · soft close + final discovery-call offer
// Each one stands on its own · they don't reference prior emails, in case
// any of them get filtered out or skimmed past.
async function scheduleNurture(apiKey, { env, from, to, name, match, notifyEmail, discoveryUrl, unsubscribeUrl, canSpamAddress }) {
  const now = Date.now();

  const sends = [
    { day: 1, at: central8amAfterDays(now, 1), build: () => buildNurtureDay1({ name, match, discoveryUrl, unsubscribeUrl, canSpamAddress }) },
    { day: 3, at: central8amAfterDays(now, 3), build: () => buildNurtureDay3({ name, match, unsubscribeUrl, canSpamAddress }) },
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

// Day 1 · 8 AM Central, the morning after submission. A warm personal
// thank-you and the first soft offer of a discovery call. Match-aware: when
// the quiz produced a match we name it as a starting point and frame the call
// as the way to confirm fit; raw contact leads get the generic "find the right
// fit" framing. This is the early discovery touch · Day 14 is the final one.
function buildNurtureDay1({ name, match, discoveryUrl, unsubscribeUrl, canSpamAddress }) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const subject = 'Thanks for your interest · let me help you find the right fit';

  const matchHtml =
    match && match.name
      ? `Based on what you shared, <strong>${esc(match.name)}</strong>${
          match.price ? ` (${esc(match.price)}/mo)` : ''
        } looks like a strong starting point. The quiz gets you to the right neighborhood · a short call is how we make sure it is actually the right fit for your goals and your budget.`
      : `The fastest way to find the right fit is a short call where I can hear your goals and point you to the protocol that actually matches them.`;

  const matchText =
    match && match.name
      ? `Based on what you shared, ${match.name}${match.price ? ` (${match.price}/mo)` : ''} looks like a strong starting point. The quiz gets you to the right neighborhood. A short call is how we make sure it is actually the right fit for your goals and your budget.`
      : `The fastest way to find the right fit is a short call where I can hear your goals and point you to the protocol that actually matches them.`;

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Hi ${esc(first)},</p>

    <p style="margin:0 0 16px 0;">Thank you for your interest in Viva Wellness Co. I wanted to follow up personally and offer to help you find the services that fit you best.</p>

    <p style="margin:0 0 16px 0;">${matchHtml}</p>

    <p style="margin:0 0 24px 0;">There is no prescription and no pressure on a first call. I ask about your goals, your history, and what you have already tried. You ask me anything. By the end we both know whether there is a real fit and which path makes sense.</p>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr><td style="background:#c9783a;border-radius:2px;">
        <a href="${esc(discoveryUrl)}"
           style="display:inline-block;padding:14px 26px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#0c0a09;text-decoration:none;">
          Schedule a 30-min discovery call &nbsp;→
        </a>
      </td></tr>
    </table>

    <p style="font-size:13px;color:#8a7d72;margin:14px 0 20px 0;">
      Or copy and paste: <a href="${esc(discoveryUrl)}" style="color:#8a4d22;">${esc(discoveryUrl)}</a>
    </p>

    <p style="margin:0;">If a call is not the right format, just reply to this email with what you are trying to solve and I will point you in the right direction personally.</p>
  `;

  const text = [
    `Hi ${first},`,
    ``,
    `Thank you for your interest in Viva Wellness Co. I wanted to follow up personally and offer to help you find the services that fit you best.`,
    ``,
    matchText,
    ``,
    `There is no prescription and no pressure on a first call. I ask about your goals, your history, and what you have already tried. You ask me anything. By the end we both know whether there is a real fit and which path makes sense.`,
    ``,
    `When you are ready, here is the link to schedule a 30-minute discovery call:`,
    ``,
    `  ${discoveryUrl}`,
    ``,
    `If a call is not the right format, just reply to this email with what you are trying to solve and I will point you in the right direction personally.`,
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
          <strong>Viva Wellness Co.</strong> &nbsp;·&nbsp; 100% Telehealth &nbsp;·&nbsp; TX, CO, FL<br/>
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

// Day 3 · match-tailored. Body switches on match.key (and sex for TRT/HRT
// to pick the male vs. female framing). Raw contact leads with no match
// fall through to the generic three-point opener.
function buildNurtureDay3({ name, match, unsubscribeUrl, canSpamAddress }) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const key = match && match.key;

  let subject;
  let intro;
  let items;

  if (key === 'metabolic') {
    subject = 'What most people get wrong about GLP-1';
    intro = `You looked at Metabolic Core, so a few things to know before starting or restarting GLP-1 therapy.`;
    items = [
      ['Starting too high.', `Most of the side effects · nausea, fatigue, hitting a wall · come from jumping doses too fast. Slow titration is not being cautious. It is how the protocol works.`],
      ['Treating GLP-1 like willpower in a vial.', `It quiets the food noise, which is real and measurable. It does not replace strength training or protein. Skip both and you lose muscle along with fat.`],
      ['Stopping cold turkey.', `The taper matters as much as the ramp. I plan the exit at the start, not at the end.`],
    ];
  } else if (key === 'trt') {
    subject = 'Three things I wish more people knew about hormone therapy';
    intro = `You looked at the TRT & HRT tier. A few things I wish more people heard before they start, whether the question is testosterone, estradiol, or both.`;
    items = [
      ['Chasing a number instead of how you feel.', `Lab ranges are population averages. A man feeling great at 700 ng/dL beats one at 1200 with sleep apnea and acne. A woman with controlled symptoms on a modest estradiol dose beats one chasing a higher serum number. I tune to symptoms first.`],
      ['Hormone therapy is more than one molecule.', `Most people picture TRT as testosterone alone, or HRT as estradiol alone. In practice there is a small toolkit · anastrozole, enclomiphene, progesterone, estradiol, HCG · that I add selectively based on labs and symptoms, not routinely. HCG sits in its own category · it shows up in aggressive fertility protocols and comes from a standard pharmacy rather than a compounder. The rest can be compounded through the pharmacies I work with. The right plan is the smallest protocol that gets you where you want to be, not the longest.`],
      ['Outdated risk framing.', `"TRT is steroids" and "estradiol causes cancer" are two of the most common things I hear, and both are decades behind the current data. Modern protocols, modern dosing, modern monitoring · the risk profile looks nothing like what most people read about online.`],
    ];
  } else if (key === 'concierge') {
    subject = 'How most people approach a provider · and what works better';
    intro = `You looked at Concierge Access, the tier built for people who want provider expertise without a bundled monthly protocol. Three things that help the relationship work.`;
    items = [
      ['Use the messaging.', `The point of $99 per month is access. People who message me regularly get more out of it than people who wait for problems.`],
      ['Tell me what is actually going on.', `Sleep, stress, what you tried last quarter, what your last doc said. The protocol decisions come from context, not from a label on a peptide vial.`],
      ['Treat it like a partnership, not a vending machine.', `Concierge works when we are solving something together. It is slower than a la carte clinics, and that is the point.`],
    ];
  } else {
    subject = 'Three things people get wrong when they start';
    intro = `You reached out a few days ago, so I wanted to share three things that trip most people up at the start. These apply regardless of which protocol you are considering.`;
    items = [
      ['Doing too much at once.', `Hormones, peptides, GLP-1, supplements. Stack everything at the same time and you cannot tell what is working. I sequence intentionally.`],
      ['Chasing numbers over symptoms.', `Lab ranges are population averages. Your numbers exist to inform how you feel, not to replace it.`],
      ['Skipping the conversation.', `Most of what makes a protocol succeed is the part before the first prescription. The questions, the history, the goals. That happens on the first call.`],
    ];
  }

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

  const closing = `If any of this lands for what you have been doing on your own, that is exactly what the first consult is for. Hit reply with a question · I read these personally.`;

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

// Day 7 · match-agnostic. The "is this safe long-term?" objection comes
// up on every first call, so we address it head-on with three concrete
// answers instead of generic reassurance.
function buildNurtureDay7({ name, unsubscribeUrl, canSpamAddress }) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const subject = 'The question I get on every first call';

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Hi ${esc(first)},</p>

    <p style="margin:0 0 16px 0;">Almost every first consult starts with the same question, in some form: "is this safe long-term?"</p>

    <p style="margin:0 0 16px 0;">The honest answer has three parts.</p>

    <p style="margin:0 0 16px 0;"><strong>First, I do not do anything you cannot stop.</strong> Every protocol has an off-ramp planned in. I do not trap people on therapy they do not want.</p>

    <p style="margin:0 0 16px 0;"><strong>Second, the data is encouraging but not infinite.</strong> Bioidentical hormone replacement has good long-term safety data when done right. GLP-1 medications have five-plus years of population data and growing. Peptides like BPC-157 have decades of research behind them but less human trial volume. I tell you which bucket your protocol falls in before you start, not after.</p>

    <p style="margin:0 0 16px 0;"><strong>Third, the labs are the safety net.</strong> Biannual blood work catches trends early. If something needs to change, I change it. The plan is a starting point, not a contract.</p>

    <p style="margin:0 0 16px 0;">The thing most people do not expect is how much of the first visit is spent listening, not prescribing. I want to know what you have tried, what did not work, and what you are hoping for. Before I have an opinion on what should change.</p>

    <p style="margin:18px 0 0 0;">If you have a specific question, hit reply. I answer these personally.</p>
  `;

  const text = [
    `Hi ${first},`,
    ``,
    `Almost every first consult starts with the same question, in some form: "is this safe long-term?"`,
    ``,
    `The honest answer has three parts.`,
    ``,
    `First, I do not do anything you cannot stop. Every protocol has an off-ramp planned in. I do not trap people on therapy they do not want.`,
    ``,
    `Second, the data is encouraging but not infinite. Bioidentical hormone replacement has good long-term safety data when done right. GLP-1 medications have five-plus years of population data and growing. Peptides like BPC-157 have decades of research behind them but less human trial volume. I tell you which bucket your protocol falls in before you start, not after.`,
    ``,
    `Third, the labs are the safety net. Biannual blood work catches trends early. If something needs to change, I change it. The plan is a starting point, not a contract.`,
    ``,
    `The thing most people do not expect is how much of the first visit is spent listening, not prescribing. I want to know what you have tried, what did not work, and what you are hoping for. Before I have an opinion on what should change.`,
    ``,
    `If you have a specific question, hit reply. I answer these personally.`,
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

    <p style="margin:0 0 16px 0;">If anything in the eBook or the notes I have sent since landed for you, the next step is a 30-minute consult. It is exactly what it sounds like. I ask questions, you ask questions, we figure out if there is a real fit. No prescription is written on the first call.</p>

    <p style="margin:0 0 24px 0;">If it is not the right time, that is fine too. The eBook is yours to keep.</p>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr><td style="background:#c9783a;border-radius:2px;">
        <a href="${esc(discoveryUrl)}"
           style="display:inline-block;padding:14px 26px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#0c0a09;text-decoration:none;">
          Schedule a 30-min consult &nbsp;→
        </a>
      </td></tr>
    </table>

    <p style="font-size:13px;color:#8a7d72;margin:14px 0 20px 0;">
      Or copy and paste: <a href="${esc(discoveryUrl)}" style="color:#8a4d22;">${esc(discoveryUrl)}</a>
    </p>

    <p style="margin:0;">If you have a specific question that does not fit on a call, reply to this email and I will answer personally. Either way · thank you for letting me into your inbox.</p>
  `;

  const text = [
    `Hi ${first},`,
    ``,
    `It has been a couple of weeks since you reached out, so I figured I would check in once more. Then I will get out of your inbox.`,
    ``,
    `If anything in the eBook or the notes I have sent since landed for you, the next step is a 30-minute consult. I ask questions, you ask questions, we figure out if there is a real fit. No prescription is written on the first call.`,
    ``,
    `If it is not the right time, that is fine too. The eBook is yours to keep. When you are ready, here is the link to schedule:`,
    ``,
    `  ${discoveryUrl}`,
    ``,
    `If you have a specific question that does not fit on a call, reply to this email and I will answer personally.`,
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

function buildNotifyEmail({ source, name, email, phone, message, quiz, match, utm, referrer, referee }) {
  const rows = [
    ['Source', source],
    ['Name', name],
    ['Email', email],
    ['Phone', phone || '(not provided)'],
  ];
  if (referee) {
    rows.push(['Referee name', referee.name]);
    rows.push(['Referee email', referee.email]);
  }
  if (match) {
    rows.push(['Matched protocol', `${match.name} · ${match.price}/mo`]);
  }
  if (quiz) {
    const labels = {
      goal: 'Primary goal',
      age: 'Age range',
      sex: 'Sex',
      activity: 'Activity level',
      budget: 'Budget',
    };
    for (const [k, v] of Object.entries(quiz)) {
      rows.push([labels[k] || k, String(v)]);
    }
  }
  if (message) {
    rows.push([source === 'refer' ? 'Note from referrer' : 'Message', message]);
  }
  if (utm && typeof utm === 'object') {
    const order = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    for (const k of order) {
      if (utm[k]) rows.push([k, String(utm[k])]);
    }
  }
  if (referrer) {
    rows.push(['Referrer', referrer]);
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
                    <td style="padding:8px 0;font-size:14px;color:#0c0a09;vertical-align:top;border-bottom:1px solid #ebe5db;">${esc(v)}</td>
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
