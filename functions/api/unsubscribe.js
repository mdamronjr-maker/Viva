/**
 * /api/unsubscribe · Cloudflare Pages Function
 *
 * Two entry points, both authenticated by the HMAC token in the URL:
 *
 *   POST  · RFC 8058 one-click unsubscribe. Mail clients (Gmail, Apple Mail)
 *           POST here when the user taps the native "Unsubscribe" affordance,
 *           driven by the `List-Unsubscribe` + `List-Unsubscribe-Post`
 *           headers we set on every nurture email. Returns 200, no body.
 *
 *   GET   · The human-clickable link in the email footer. Same effect, but
 *           returns a small branded confirmation page.
 *
 * Either way we (1) write a permanent suppression record and (2) cancel every
 * still-queued nurture email for that lead via Resend's cancel endpoint.
 *
 * Env vars:
 *   UNSUB_SECRET     · required for tokens to verify. If unset, every request
 *                      fails closed (400) since no token can be valid.
 *   RESEND_API_KEY   · required to cancel queued sends.
 *   LEADS_KV binding · required to persist suppression / look up queued IDs.
 */

import { verifyUnsubscribe, suppressAndCancel } from './_suppress.js';

function page(title, body) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Viva Wellness Co.</title>
<style>
  body{margin:0;background:#110e0b;color:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;}
  .card{max-width:460px;padding:40px 32px;text-align:center;}
  h1{font-size:24px;font-weight:600;margin:0 0 12px;letter-spacing:-0.01em;}
  p{font-size:15px;line-height:1.6;color:#b8aea1;margin:0 0 8px;}
  a{color:#d6864a;text-decoration:none;}
</style></head>
<body><div class="card">${body}</div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function handle(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const email = await verifyUnsubscribe(env.UNSUB_SECRET, url.searchParams.get('e'), url.searchParams.get('t'));

  if (!email) {
    return { ok: false, email: null };
  }
  await suppressAndCancel(env, env.RESEND_API_KEY, email, 'unsubscribe');
  return { ok: true, email };
}

// RFC 8058 one-click · no UI, just acknowledge.
export async function onRequestPost(context) {
  const { ok } = await handle(context);
  return new Response(null, { status: ok ? 200 : 400 });
}

// Footer link click · show a confirmation page.
export async function onRequestGet(context) {
  const { ok, email } = await handle(context);
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
     <p>${email} won't receive any more follow-up emails from Viva Wellness Co.
     Any scheduled notes have been cancelled.</p>
     <p>Changed your mind? Just reach out at
     <a href="mailto:info@vivawellnessco.com">info@vivawellnessco.com</a>.</p>`
  );
}
