/**
 * _suppress.js · shared helpers for the nurture-email suppression system.
 *
 * Underscore-prefixed, so the Pages router does NOT expose it as an endpoint.
 * It is imported by lead.js (records scheduled sends, checks suppression),
 * unsubscribe.js (one-click + link unsubscribe), and resend-webhook.js
 * (spam-complaint / hard-bounce auto-suppression).
 *
 * Persistence is Cloudflare KV, bound as `LEADS_KV` in the Pages project
 * (Settings → Functions → KV namespace bindings). Every function degrades to
 * a no-op when the binding is absent, so the lead flow never breaks just
 * because suppression hasn't been provisioned yet.
 *
 * KV keys:
 *   sched:<email>  → JSON array of Resend email IDs queued for that lead.
 *                    31-day TTL (the furthest scheduled send is 14 days out).
 *   supp:<email>   → JSON { reason, at }. No TTL · permanent suppression.
 */

const RESEND_API = 'https://api.resend.com';
const SCHED_TTL_SECONDS = 31 * 24 * 60 * 60;

export const emailKey = (e) => String(e || '').trim().toLowerCase();

// --- suppression state ---

export async function isSuppressed(env, email) {
  if (!env || !env.LEADS_KV) return false;
  const v = await env.LEADS_KV.get(`supp:${emailKey(email)}`);
  return v != null;
}

export async function suppress(env, email, reason) {
  if (!env || !env.LEADS_KV) return;
  await env.LEADS_KV.put(
    `supp:${emailKey(email)}`,
    JSON.stringify({ reason: reason || 'unsubscribe', at: new Date().toISOString() })
  );
}

// --- scheduled-send bookkeeping ---

export async function recordScheduled(env, email, ids) {
  if (!env || !env.LEADS_KV || !ids || !ids.length) return;
  const key = `sched:${emailKey(email)}`;
  let existing = [];
  try {
    existing = JSON.parse((await env.LEADS_KV.get(key)) || '[]');
  } catch {
    existing = [];
  }
  const merged = [...new Set([...existing, ...ids])];
  await env.LEADS_KV.put(key, JSON.stringify(merged), { expirationTtl: SCHED_TTL_SECONDS });
}

/**
 * Cancel every still-queued nurture email for a lead via Resend's cancel
 * endpoint, then clear the bookkeeping. Sends that already went out return a
 * non-2xx from Resend and are simply skipped. Returns the count cancelled.
 */
export async function cancelScheduled(env, apiKey, email) {
  if (!env || !env.LEADS_KV) return 0;
  const key = `sched:${emailKey(email)}`;
  let ids = [];
  try {
    ids = JSON.parse((await env.LEADS_KV.get(key)) || '[]');
  } catch {
    ids = [];
  }
  let cancelled = 0;
  await Promise.allSettled(
    ids.map(async (id) => {
      try {
        const res = await fetch(`${RESEND_API}/emails/${id}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) cancelled++;
      } catch {
        /* network blip · leave the ID for a later retry is moot since we
           delete the key below; acceptable, cancellation is best-effort */
      }
    })
  );
  await env.LEADS_KV.delete(key);
  return cancelled;
}

/**
 * Suppress + cancel in one call. Used by both the unsubscribe endpoint and
 * the Resend complaint/bounce webhook.
 */
export async function suppressAndCancel(env, apiKey, email, reason) {
  await suppress(env, email, reason);
  return cancelScheduled(env, apiKey, email);
}

// --- signed unsubscribe tokens (HMAC-SHA256 over the lowercased email) ---

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s) {
  const b64 = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Build the one-click unsubscribe URL for an email. Returns null when no
 * secret is configured, so callers can fall back to a mailto-only flow.
 */
export async function makeUnsubscribeUrl(origin, secret, email) {
  if (!secret) return null;
  const e = b64url(emailKey(email));
  const t = await hmacHex(secret, emailKey(email));
  return `${origin}/api/unsubscribe?e=${e}&t=${t}`;
}

/**
 * Verify an unsubscribe token. Returns the email on success, null on failure.
 */
export async function verifyUnsubscribe(secret, eParam, tParam) {
  if (!secret || !eParam || !tParam) return null;
  let email;
  try {
    email = emailKey(unb64url(eParam));
  } catch {
    return null;
  }
  const expected = await hmacHex(secret, email);
  return safeEqual(expected, String(tParam)) ? email : null;
}
