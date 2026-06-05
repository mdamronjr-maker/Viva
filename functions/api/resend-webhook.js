/**
 * /api/resend-webhook · Cloudflare Pages Function
 *
 * Two jobs:
 *
 * 1. Delivery audit log · every recognized lifecycle event (sent, delivered,
 *    delivery_delayed, bounced, complained, opened, clicked) is appended to the
 *    KV event log (see _log.js) so the /api/email-status dashboard can show
 *    whether a given send actually landed. Best-effort · never blocks (2).
 *
 * 2. Auto-suppression · leads who should never get another email:
 *      email.complained · marked us as spam
 *      email.bounced    · hard bounce (dead mailbox)
 *    On either we suppress the recipient(s) and cancel any still-queued nurture
 *    sends. Unrecognized event types are acknowledged and ignored.
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
 *   LEADS_KV binding      · required · suppression store + delivery audit log.
 */

import { suppressAndCancel } from './_suppress.js';
import { logEmailEvent } from './_log.js';

const SUPPRESS_EVENTS = new Set(['email.complained', 'email.bounced']);
// Lifecycle events we record on the delivery dashboard. Everything else is
// acknowledged (200) but neither logged nor acted on.
const LOG_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.opened',
  'email.clicked',
]);
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

  if (!LOG_EVENTS.has(event.type)) {
    return new Response('ignored', { status: 200 });
  }

  // Resend puts recipients in data.to (string or array depending on event).
  const data = event.data || {};
  const to = data.to;
  const recipients = Array.isArray(to) ? to : to ? [to] : [];
  const status = event.type.replace('email.', '');
  // Resend uses email_id on webhook payloads; fall back to id for older shapes.
  const messageId = data.email_id || data.id || null;

  // (1) Append a delivery-log row per recipient (best-effort).
  await Promise.allSettled(
    recipients.map((addr) =>
      logEmailEvent(env, {
        id: messageId,
        to: addr,
        status,
        kind: 'webhook',
        subject: data.subject,
      })
    )
  );

  // (2) Suppress + cancel only on hard bounce / spam complaint.
  if (SUPPRESS_EVENTS.has(event.type)) {
    await Promise.allSettled(
      recipients.map((addr) => suppressAndCancel(env, env.RESEND_API_KEY, addr, status))
    );
  }

  return new Response('ok', { status: 200 });
}
