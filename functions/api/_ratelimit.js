// Shared, fail-OPEN rate limiter backed by LEADS_KV.
//
// Purpose: blunt abuse / cost-amplification (unbounded Resend sends on /api/lead,
// billed model calls on /api/chat). It is NOT a precise quota.
//
// Design rule — fail OPEN: any infrastructure problem (no KV binding, no client
// IP, or a KV read/write error) ALLOWS the request. A limiter bug must never
// drop a real lead or block a real conversation; the worst case is "no limit",
// which is exactly today's behavior. Limits are generous so legitimate users
// never hit them.
//
// Mechanism: a fixed-window counter. The key holds a hit count whose TTL is the
// window length, so sustained floods keep the key (and the block) alive while a
// normal user's count expires after a quiet window.

export async function rateLimit(env, { bucket, ip, limit, windowSec }) {
  const kv = env && env.LEADS_KV;
  if (!kv || !ip) return { ok: true, skipped: true };
  const key = `rl:${bucket}:${ip}`;
  try {
    const count = parseInt((await kv.get(key)) || '0', 10) || 0;
    if (count >= limit) return { ok: false, count, limit };
    await kv.put(key, String(count + 1), { expirationTtl: windowSec });
    return { ok: true, count: count + 1, limit };
  } catch {
    return { ok: true, error: true };
  }
}
