/**
 * /api/resend-webhook · Cloudflare Pages Function
 *
 * Receives Resend webhook events and auto-suppresses leads who should never
 * get another email:
 *   email.complained · marked us as spam
 *   email.bounced    · hard bounce (dead mailbox)
 *
 * On either, we suppress the recipient(s) and cancel any still-queued nurture
 * sends. Other event types are acknowledged and ignored.
 *
 * Security: Resend signs webhooks with Svix. We verify the
 * svix-id / svix-timestamp / svix-signature headers against
 * RESEND_WEBHOOK_SECRET (format `whsec_<base64>`). If the secret is unset the
 * endpoint fails closed (401) so it can't be abused as an open suppression
 * trigger.
 *
 * Env vars:
 *   RESEND_WEBHOOK_SECRET · required · the signing secret from the Resend
 *                           webhook settings (starts with `whsec_`).
 *   RESEND_API_KEY        · required · to cancel queued sends.
 *   LEADS_KV binding      · required · suppression store.
 */

import { suppressAndCancel } from './_suppress.js';

const SUPPRESS_EVENTS = new Set(['email.complained', 'email.bounced']);
const TOLERANCE_SECONDS = 5 * 60;

function b64ToBytes(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function hmacB64(secretBytes, msg) {
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  let bin = '';
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Svix signature scheme: sign `${id}.${timestamp}.${body}` with the raw
// (base64-decoded) secret; the header is a space-separated list of
// `v1,<base64sig>` entries (a key can have multiple active secrets).
async function verifySvix(secret, headers, body) {
  if (!secret) return false;
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!id || !timestamp || !sigHeader) return false;

  // Reject stale deliveries (replay protection).
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const expected = await hmacB64(b64ToBytes(rawSecret), `${id}.${timestamp}.${body}`);

  return sigHeader
    .split(' ')
    .map((part) => part.split(',')[1])
    .some((sig) => sig && safeEqual(sig, expected));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Read the raw body once · signature is computed over the exact bytes.
  const body = await request.text();

  const valid = await verifySvix(env.RESEND_WEBHOOK_SECRET, request.headers, body);
  if (!valid) {
    return new Response('invalid signature', { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('bad json', { status: 400 });
  }

  if (!SUPPRESS_EVENTS.has(event.type)) {
    return new Response('ignored', { status: 200 });
  }

  // Resend puts recipients in data.to (string or array depending on event).
  const to = event.data && event.data.to;
  const recipients = Array.isArray(to) ? to : to ? [to] : [];

  await Promise.allSettled(
    recipients.map((addr) =>
      suppressAndCancel(env, env.RESEND_API_KEY, addr, event.type.replace('email.', ''))
    )
  );

  return new Response('ok', { status: 200 });
}
