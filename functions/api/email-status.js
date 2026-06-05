/**
 * /api/email-status · Cloudflare Pages Function
 *
 * Read-only delivery dashboard over the KV email audit log (see _log.js).
 * Answers "did our emails actually go out / land?" without opening the Resend
 * console: a status rollup plus the most recent events.
 *
 * The log holds lead email addresses (PII), so this endpoint is GATED. It
 * fails closed: with no EMAIL_STATUS_TOKEN configured, or a bad/absent token,
 * it returns 401 and reveals nothing.
 *
 * Auth (either form):
 *   Authorization: Bearer <EMAIL_STATUS_TOKEN>
 *   ?token=<EMAIL_STATUS_TOKEN>        · convenient for the browser view; note
 *                                        the token then sits in browser history
 *                                        and any intermediary logs. Prefer the
 *                                        header for anything automated.
 *
 * Output:
 *   default            · JSON { ok, generated_at, window, summary, events }
 *   ?view=html         · a small branded HTML table for eyeballing
 *   ?limit=N           · cap recent events (default 100, max 1000)
 *
 * Env vars:
 *   EMAIL_STATUS_TOKEN · required. Long random string. Unset = endpoint off.
 *   LEADS_KV binding   · required. The audit-log store. Unset = empty results.
 */

import { listEmailEvents } from './_log.js';

// Constant-time string compare · avoids leaking the token via timing.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function authorized(request, env) {
  const expected = env && env.EMAIL_STATUS_TOKEN;
  if (!expected) return false; // fail closed when unconfigured
  const url = new URL(request.url);
  const header = request.headers.get('Authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const supplied = bearer || url.searchParams.get('token') || '';
  return safeEqual(supplied, expected);
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
    .map(
      ([k, v]) =>
        `<span class="chip chip-${esc(k)}">${esc(k)} <b>${v}</b></span>`
    )
    .join('');

  const rows = events
    .map(
      (e) => `<tr>
        <td class="t">${esc(e.at)}</td>
        <td><span class="chip chip-${esc(e.status)}">${esc(e.status)}</span></td>
        <td>${esc(e.kind)}</td>
        <td>${esc(e.to)}</td>
        <td class="s">${esc(e.subject)}</td>
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
  td.s{color:#b8aea1;max-width:280px;}
  td.id{color:#6b6055;font-family:ui-monospace,Menlo,monospace;font-size:11px;}
</style></head>
<body>
  <h1>Email delivery</h1>
  <p class="sub">${esc(events.length)} events · ${esc(summary.distinct_messages)} messages · generated ${esc(generated_at)}</p>
  <div class="chips">${chips || '<span class="chip">no events yet</span>'}</div>
  <table>
    <thead><tr><th>When (UTC)</th><th>Status</th><th>Kind</th><th>To</th><th>Subject</th><th>Message ID</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="color:#8a7d72;padding:20px 10px;">No events recorded. Either nothing has sent yet, or LEADS_KV is not bound.</td></tr>'}</tbody>
  </table>
</body></html>`;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!authorized(request, env)) {
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
