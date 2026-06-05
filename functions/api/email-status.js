/**
 * /api/email-status · Cloudflare Pages Function
 *
 * Read-only delivery dashboard over the KV email audit log (see _log.js).
 * Answers "did our emails actually go out / land?" without opening the Resend
 * console: a status rollup plus the most recent events (email + status + kind,
 * no message subjects · see _log.js for why).
 *
 * The log holds lead email addresses (PII), so this endpoint is GATED and
 * fails closed. Two layers, defence in depth:
 *
 *   1. Cloudflare Access (recommended) · put an Access application in front of
 *      `/api/email-status` so only your Zero Trust identities (Mike/Liliana)
 *      ever reach it. We VERIFY the Access JWT (`Cf-Access-Jwt-Assertion`)
 *      against your team's public certs + Application Audience, so the gate
 *      can't be bypassed by hitting the *.pages.dev origin URL directly. This
 *      is what makes the browser dashboard work (Access handles the SSO login).
 *
 *   2. Bearer token · `Authorization: Bearer <EMAIL_STATUS_TOKEN>` for
 *      automation/curl (and as the gate before Access is configured). There is
 *      deliberately NO `?token=` query param · query strings leak into browser
 *      history and intermediary logs.
 *
 * If neither an Access identity nor a matching Bearer token is present, the
 * endpoint returns 401 and reveals nothing.
 *
 * Env vars:
 *   ACCESS_TEAM_DOMAIN · e.g. `yourteam.cloudflareaccess.com`. Enables Access
 *                        JWT verification (the browser path). Unset = Access
 *                        path off, Bearer token only.
 *   ACCESS_AUD         · the Application Audience (AUD) tag of the Access app.
 *                        Required alongside ACCESS_TEAM_DOMAIN.
 *   EMAIL_STATUS_TOKEN · long random string for the Bearer fallback. Unset =
 *                        Bearer path off.
 *   LEADS_KV binding   · the audit-log store. Unset = empty results.
 */

import { listEmailEvents } from './_log.js';

// --- base64url ---
function b64urlToBytes(s) {
  let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = t.length % 4;
  if (pad) t += '='.repeat(4 - pad);
  const bin = atob(t);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

// Constant-time string compare · avoids leaking the Bearer token via timing.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Verify a Cloudflare Access JWT against the team's published certs. Returns
 * the authenticated email on success, null on any failure. Checks signature
 * (RS256), audience, issuer, and expiry · the full set, so a token minted for a
 * different Access app or an expired session is rejected.
 */
async function verifyAccessJwt(env, token) {
  const team = env && env.ACCESS_TEAM_DOMAIN;
  const aud = env && env.ACCESS_AUD;
  if (!team || !aud || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = b64urlToJson(headerB64);
    payload = b64urlToJson(payloadB64);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  // Claims first (cheap) before the crypto.
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) return null;
  if (payload.iss !== `https://${team}`) return null;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;

  // Fetch the signing keys and find the one this token was signed with.
  let jwks;
  try {
    const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
    if (!res.ok) return null;
    jwks = await res.json();
  } catch {
    return null;
  }
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) return null;

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(sigB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
    if (!ok) return null;
  } catch {
    return null;
  }

  return payload.email || payload.sub || 'access-user';
}

// Returns { via, who } when authorized, null otherwise.
async function authorize(request, env) {
  // (1) Access JWT · header set by Access, or the CF_Authorization cookie.
  const headerJwt = request.headers.get('Cf-Access-Jwt-Assertion');
  let jwt = headerJwt;
  if (!jwt) {
    const cookie = request.headers.get('Cookie') || '';
    const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
    if (m) jwt = m[1];
  }
  if (jwt) {
    const who = await verifyAccessJwt(env, jwt);
    if (who) return { via: 'access', who };
  }

  // (2) Bearer token fallback (automation / pre-Access).
  const expected = env && env.EMAIL_STATUS_TOKEN;
  if (expected) {
    const header = request.headers.get('Authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (bearer && safeEqual(bearer, expected)) return { via: 'token', who: 'token' };
  }

  return null;
}

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function summarize(events) {
  const summary = {};
  const messages = new Set();
  for (const e of events) {
    const s = e.status || 'unknown';
    summary[s] = (summary[s] || 0) + 1;
    if (e.id) messages.add(e.id);
  }
  return { by_status: summary, events: events.length, distinct_messages: messages.size };
}

function htmlPage(payload) {
  const { summary, events, generated_at } = payload;
  const chips = Object.entries(summary.by_status)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<span class="chip chip-${esc(k)}">${esc(k)} <b>${v}</b></span>`)
    .join('');

  const rows = events
    .map(
      (e) => `<tr>
        <td class="t">${esc(e.at)}</td>
        <td><span class="chip chip-${esc(e.status)}">${esc(e.status)}</span></td>
        <td>${esc(e.kind)}</td>
        <td>${esc(e.to)}</td>
        <td class="id">${esc(e.id || '')}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Email delivery · Viva Wellness Co.</title>
<style>
  body{margin:0;background:#110e0b;color:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:28px;}
  h1{font-size:20px;font-weight:600;margin:0 0 4px;letter-spacing:-0.01em;}
  .sub{color:#8a7d72;font-size:13px;margin:0 0 20px;}
  .chips{margin:0 0 20px;display:flex;flex-wrap:wrap;gap:8px;}
  .chip{display:inline-block;font-size:12px;padding:4px 10px;border-radius:999px;background:#2a2420;color:#d8ccbf;letter-spacing:.02em;}
  .chip b{color:#fff;}
  .chip-delivered{background:#16361f;color:#9fe6b4;}
  .chip-sent{background:#1d2c3a;color:#9fcbe6;}
  .chip-scheduled{background:#322a14;color:#e6cf8a;}
  .chip-bounced,.chip-send_failed{background:#3a1717;color:#e69f9f;}
  .chip-complained{background:#3a1730;color:#e69fd4;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #2a2420;vertical-align:top;}
  th{color:#8a7d72;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:600;}
  td.t{color:#8a7d72;white-space:nowrap;font-variant-numeric:tabular-nums;}
  td.id{color:#6b6055;font-family:ui-monospace,Menlo,monospace;font-size:11px;}
</style></head>
<body>
  <h1>Email delivery</h1>
  <p class="sub">${esc(events.length)} events · ${esc(summary.distinct_messages)} messages · generated ${esc(generated_at)}</p>
  <div class="chips">${chips || '<span class="chip">no events yet</span>'}</div>
  <table>
    <thead><tr><th>When (UTC)</th><th>Status</th><th>Kind</th><th>To</th><th>Message ID</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="color:#8a7d72;padding:20px 10px;">No events recorded. Either nothing has sent yet, or LEADS_KV is not bound.</td></tr>'}</tbody>
  </table>
</body></html>`;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await authorize(request, env);
  if (!auth) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const url = new URL(request.url);
  let limit = parseInt(url.searchParams.get('limit') || '100', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 100;
  if (limit > 1000) limit = 1000;

  const events = await listEmailEvents(env, limit);
  const summary = summarize(events);
  const payload = {
    ok: true,
    generated_at: new Date().toISOString(),
    window: `most recent ${events.length} events (max ${limit})`,
    summary,
    events,
  };

  const wantsHtml =
    url.searchParams.get('view') === 'html' ||
    (request.headers.get('Accept') || '').includes('text/html');

  if (wantsHtml) {
    return new Response(htmlPage(payload), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
