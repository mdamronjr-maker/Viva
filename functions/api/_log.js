/**
 * _log.js · shared helpers for the email delivery audit log.
 *
 * Underscore-prefixed, so the Pages router does NOT expose it as an endpoint.
 * Imported by lead.js / contact.js (record outbound sends) and
 * resend-webhook.js (record delivery lifecycle events). Read back by
 * email-status.js for the dashboard.
 *
 * This is an APPEND-ONLY event log, not a mutable per-message row. Every send
 * writes one event (`sent` / `scheduled`); every Resend webhook writes another
 * (`delivered`, `bounced`, `complained`, ...). The dashboard groups by message
 * id and shows the latest status. Append-only means no read-modify-write race
 * and no secondary index to keep the message id discoverable.
 *
 * Persistence is the same Cloudflare KV namespace the suppression list uses
 * (`LEADS_KV`). Every function degrades to a no-op when the binding is absent,
 * so the lead flow never breaks just because logging isn't provisioned.
 *
 * KV layout:
 *   elog:<rev>:<rand>  → value: JSON of the event (redundant, for direct get).
 *                        metadata: the same event, used for cheap listing
 *                        (KV list returns key names + metadata in one call, so
 *                        the dashboard never does N gets).
 *   <rev> is (REV_BASE - epoch_ms) zero-padded to 13 digits, so the default
 *   ascending lexicographic list order returns NEWEST events first.
 *   90-day TTL · this is operational telemetry, not a permanent record, and it
 *   holds lead email addresses (PII) we don't want to keep indefinitely.
 */

const PREFIX = 'elog:';
// 9999999999999 ms ≈ year 2286, comfortably past any real timestamp, so
// REV_BASE - now stays positive and 13 digits wide for the lifetime of this code.
const REV_BASE = 9999999999999;
const LOG_TTL_SECONDS = 90 * 24 * 60 * 60;

// KV metadata is capped at 1024 bytes. Subjects are the only unbounded field;
// cap them well short so the JSON envelope always fits.
const MAX_SUBJECT_LEN = 160;

const clip = (s, n) => {
  const str = String(s == null ? '' : s);
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
};

function revKey(ms) {
  const rev = Math.max(0, REV_BASE - ms);
  return String(rev).padStart(13, '0');
}

// Best-effort short random suffix so two events in the same millisecond don't
// collide on the key. crypto.getRandomValues is always available in Workers.
function rand() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Record one email lifecycle event. Never throws · logging must never take
 * down a send. Fields:
 *   id      · Resend message id (when known; webhook + send responses have it)
 *   to      · recipient address
 *   status  · sent | scheduled | delivered | delivery_delayed | bounced |
 *             complained | opened | clicked
 *   kind    · what the message is: lead | notify | nurture | contact |
 *             referrer-confirm | webhook
 *   subject · message subject (clipped)
 */
export async function logEmailEvent(env, { id, to, status, kind, subject } = {}) {
  if (!env || !env.LEADS_KV) return;
  const at = new Date().toISOString();
  const entry = {
    id: id ? String(id) : null,
    to: clip(to, 200),
    status: String(status || 'unknown'),
    kind: String(kind || 'email'),
    subject: clip(subject, MAX_SUBJECT_LEN),
    at,
  };
  const key = `${PREFIX}${revKey(Date.now())}:${rand()}`;
  try {
    await env.LEADS_KV.put(key, JSON.stringify(entry), {
      expirationTtl: LOG_TTL_SECONDS,
      metadata: entry,
    });
  } catch {
    // Swallow · audit logging is strictly best-effort.
  }
}

/**
 * List the most recent events, newest first. Reads straight from list
 * metadata, so it's one KV operation per 1000 keys with no value gets.
 * Returns [] when the binding is absent.
 */
export async function listEmailEvents(env, limit = 100) {
  if (!env || !env.LEADS_KV) return [];
  const out = [];
  let cursor;
  // Key order is already newest-first (reverse-timestamp prefix), so we can
  // stop as soon as we have `limit`.
  do {
    const page = await env.LEADS_KV.list({ prefix: PREFIX, cursor, limit: 1000 });
    for (const k of page.keys) {
      if (k.metadata) out.push(k.metadata);
      if (out.length >= limit) return out;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}
