/**
 * /api/unsubscribe · Cloudflare Pages Function
 *
 * Three entry points:
 *
 *   POST  · RFC 8058 one-click unsubscribe. Mail clients (Gmail, Apple Mail)
 *           POST here when the user taps the native "Unsubscribe" affordance,
 *           driven by the `List-Unsubscribe` + `List-Unsubscribe-Post`
 *           headers we set on every nurture email. Returns 200, no body.
 *
 *   GET   · The human-clickable link in the email footer. Same effect, but
 *           returns a small branded confirmation page.
 *
 *   POST  · The public /unsubscribe form sends JSON with an email address and
 *           Turnstile token. It is rate-limited, writes the same permanent
 *           suppression, and never reveals whether the address was on a list.
 *
 * Each path (1) writes a permanent suppression record, (2) cancels every
 * still-queued nurture email, and (3) marks the Resend contact unsubscribed.
 *
 * Env vars:
 *   UNSUB_SECRET     · required for tokens to verify. If unset, every request
 *                      fails closed (400) since no token can be valid.
 *   RESEND_API_KEY   · required to cancel queued sends.
 *   LEADS_KV binding · required to persist suppression / look up queued IDs.
 */

import { verifyUnsubscribe, suppressAndCancel } from './_suppress.js';
import { rateLimit } from './_ratelimit.js';

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

// Local HTML-escape (esc is a private const in lead.js / email-status.js, not
// exported). Guards the one interpolated value below — the HMAC-verified email,
// which the lead-side validator still permits angle brackets in.
const esc = (s) =>
  String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  let res;
  try {
    const body = new URLSearchParams({ secret, response: String(token) });
    if (ip) body.set('remoteip', ip);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Match the lead form: do not block a real person during a verification outage.
    return true;
  }
  if (!res.ok) return false;
  try {
    const data = await res.json();
    return !!(data && data.success);
  } catch {
    return false;
  }
}

function page(title, body) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Viva Wellness Co.</title>
<style>
  body{margin:0;background:#b8d0de;color:#2e3438;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;}
  .card{max-width:520px;margin:24px;padding:42px 34px;text-align:center;background:#fff8df;border-radius:18px;}
  h1{font-size:28px;font-weight:600;margin:0 0 12px;letter-spacing:-0.02em;}
  p{font-size:16px;line-height:1.6;color:#465057;margin:0 0 10px;}
  a{color:#2e3438;text-decoration:underline;text-underline-offset:3px;}
</style></head>
<body><div class="card">${body}</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function handleSignedRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const email = await verifyUnsubscribe(env.UNSUB_SECRET, url.searchParams.get('e'), url.searchParams.get('t'));

  if (!email) {
    return { ok: false, email: null };
  }
  await suppressAndCancel(env, env.RESEND_API_KEY, email, 'unsubscribe');
  return { ok: true, email };
}

// RFC 8058 one-click or public website form.
export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.searchParams.has('e') || url.searchParams.has('t')) {
    const { ok } = await handleSignedRequest(context);
    return new Response(null, { status: ok ? 200 : 400 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }

  const company = String(payload && payload.company || '').trim();
  if (company) return json({ ok: true });

  const email = String(payload && payload.email || '').trim().toLowerCase();
  if (!isEmail(email)) {
    return json({ ok: false, error: 'Enter a valid email address.' }, { status: 400 });
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const verified = await verifyTurnstile(
      env.TURNSTILE_SECRET_KEY,
      payload && payload.turnstileToken,
      request.headers.get('CF-Connecting-IP')
    );
    if (!verified) {
      return json({ ok: false, error: 'Verification failed. Refresh the page and try again.' }, { status: 403 });
    }
  }

  const limit = await rateLimit(env, {
    bucket: 'unsubscribe',
    ip: request.headers.get('CF-Connecting-IP'),
    limit: 6,
    windowSec: 600,
  });
  if (!limit.ok) {
    return json({ ok: false, error: 'Too many requests. Try again in a few minutes.' }, { status: 429 });
  }

  if (!env.LEADS_KV) {
    return json({ ok: false, error: 'Email preferences are temporarily unavailable. Please email info@vivawellnessco.com.' }, { status: 503 });
  }

  await suppressAndCancel(env, env.RESEND_API_KEY, email, 'website-unsubscribe');
  return json({ ok: true });
}

// Footer link click · show a confirmation page.
export async function onRequestGet(context) {
  const { ok, email } = await handleSignedRequest(context);
  if (!ok) {
    return page(
      'Link not recognized',
      `<h1>That link didn't work.</h1>
       <p>The unsubscribe link wasn't recognized. Reply with "stop" to any email
       and we'll remove you, or email
       <a href="mailto:info@vivawellnessco.com">info@vivawellnessco.com</a>.</p>`
    );
  }
  return page(
    'Unsubscribed',
    `<h1>You're unsubscribed.</h1>
     <p>${esc(email)} won't receive any more follow-up emails from Viva Wellness Co.
     Any scheduled notes have been cancelled.</p>
     <p>Changed your mind? Just reach out at
     <a href="mailto:info@vivawellnessco.com">info@vivawellnessco.com</a>.</p>`
  );
}
