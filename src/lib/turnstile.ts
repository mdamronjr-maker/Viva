// Cloudflare Turnstile site key.
//
// The production key is hostname-locked to the live domain. On the
// feedback/staging host (feedback.damfam.xyz) it throws Turnstile error
// 110200 ("domain not allowed"), which refuses to render the widget and
// breaks every lead form. So feedback builds (PUBLIC_DEPLOY_TARGET=feedback)
// use Cloudflare's always-pass TEST key, which renders on any hostname and
// keeps the forms working for review. Production builds use the real key.
//
// To use the real key on feedback instead, add feedback.damfam.xyz to the
// widget's allowed hostnames in the Cloudflare Turnstile dashboard.
//
// Server-side verification lives in functions/api/lead.js and only enforces
// when TURNSTILE_SECRET_KEY is set on the deployment (the matching test secret
// is 1x0000000000000000000000000000000AA).
const PROD_SITEKEY = '0x4AAAAAADe2cYOJKVo5GA0L';
const TEST_SITEKEY = '1x00000000000000000000AA'; // Cloudflare "always passes", any host

export const TURNSTILE_SITEKEY =
  import.meta.env.PUBLIC_DEPLOY_TARGET === 'feedback' ? TEST_SITEKEY : PROD_SITEKEY;
