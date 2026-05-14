/**
 * /api/lead · Cloudflare Pages Function
 *
 * Handles lead submissions from /contact and /quiz.
 * Sends:
 *   1. eBook delivery email to the lead (with download link)
 *   2. Notification email to Viva (info@vivawellnessco.com) with form data
 *   3. Adds contact to Resend Audience (if RESEND_AUDIENCE_ID is set)
 *
 * Env vars (set in Cloudflare Pages dashboard → Settings → Environment variables):
 *   RESEND_API_KEY         · required. Your Resend API key.
 *   RESEND_FROM_EMAIL      · required. Format: "Display Name <email@verified-domain.com>"
 *                            Default fallback: "Viva Wellness Co. <hello@vivawellnessco.com>"
 *                            The from-domain must be verified in Resend.
 *   RESEND_NOTIFY_EMAIL    · required. Where lead notifications go. Default: info@vivawellnessco.com
 *   RESEND_AUDIENCE_ID     · optional. Audience UUID for newsletter list. Skipped if absent.
 *   SITE_ORIGIN            · optional. Used to build the eBook download link.
 *                            Default: https://vivawellnessco.com
 */

const RESEND_API = 'https://api.resend.com';

// --- helpers ---
const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));

const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// --- main handler ---
export async function onRequestPost(context) {
  const { request, env } = context;

  // Parse body
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const {
    source = 'contact',
    name = '',
    email = '',
    phone = '',
    message = '',
    company = '',   // honeypot
    quiz = null,
    match = null,
    utm = null,
    referrer = '',
  } = payload || {};

  // Honeypot: if filled, silently succeed without sending.
  if (company && String(company).trim().length > 0) {
    return json({ ok: true, skipped: 'honeypot' });
  }

  // Validation
  if (!name || !String(name).trim()) {
    return json({ ok: false, error: 'Name is required.' }, { status: 400 });
  }
  if (!isEmail(email)) {
    return json({ ok: false, error: 'A valid email is required.' }, { status: 400 });
  }

  // Env
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: 'Server is not configured. Please email info@vivawellnessco.com.' }, { status: 500 });
  }
  const fromEmail = env.RESEND_FROM_EMAIL || 'Viva Wellness Co. <hello@vivawellnessco.com>';
  const notifyEmail = env.RESEND_NOTIFY_EMAIL || 'info@vivawellnessco.com';
  const audienceId = env.RESEND_AUDIENCE_ID || null;
  const origin = env.SITE_ORIGIN || 'https://vivawellnessco.com';
  const ebookUrl = `${origin}/viva-ebook.pdf`;

  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPhone = String(phone || '').trim();
  const cleanMsg = String(message || '').trim();

  // --- Build emails ---
  const leadEmail = buildLeadEmail({ name: cleanName, ebookUrl });
  const notifyEmailBody = buildNotifyEmail({
    source,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    message: cleanMsg,
    quiz,
    match,
    utm,
    referrer: String(referrer || '').trim(),
  });

  // Subject suffix from UTM content/source for fast triage in the inbox
  const utmTag =
    utm && (utm.utm_content || utm.utm_source)
      ? ` [${utm.utm_content || utm.utm_source}]`
      : '';

  // --- Send both emails in parallel ---
  const results = await Promise.allSettled([
    sendEmail(apiKey, {
      from: fromEmail,
      to: [cleanEmail],
      bcc: [notifyEmail],
      subject: 'Your Viva Wellness eBook is here',
      html: leadEmail.html,
      text: leadEmail.text,
      reply_to: notifyEmail,
    }),
    sendEmail(apiKey, {
      from: fromEmail,
      to: [notifyEmail],
      subject: `New ${source === 'quiz' ? 'quiz match' : 'contact lead'}: ${cleanName}${utmTag}`,
      html: notifyEmailBody.html,
      text: notifyEmailBody.text,
      reply_to: cleanEmail,
    }),
  ]);

  // If the lead email failed outright, surface an error.
  const leadResult = results[0];
  if (leadResult.status === 'rejected') {
    return json(
      { ok: false, error: 'Email send failed. Please email info@vivawellnessco.com directly.' },
      { status: 502 }
    );
  }

  // --- Add to Audience (best-effort, non-blocking failure) ---
  if (audienceId) {
    try {
      const [firstName, ...rest] = cleanName.split(/\s+/);
      const lastName = rest.join(' ');
      await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          email: cleanEmail,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
          unsubscribed: false,
        }),
      });
    } catch {
      // Swallow · audience add is non-critical
    }
  }

  return json({ ok: true });
}

// --- CORS preflight (in case forms are ever cross-origin) ---
// Locked to the production origin. Same-origin requests (the actual forms
// on vivawellnessco.com and on CF Pages preview URLs) don't trigger CORS,
// so this only matters for cross-origin abuse attempts.
export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://vivawellnessco.com',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    },
  });
}

// --- Resend send helper ---
async function sendEmail(apiKey, body) {
  const res = await fetch(`${RESEND_API}/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${text}`);
  }
  return res.json();
}

// --- Email body builders ---
function buildLeadEmail({ name, ebookUrl }) {
  const first = (name || '').split(/\s+/)[0] || 'there';
  const text = [
    `Hi ${first},`,
    ``,
    `Thanks for reaching out to Viva Wellness Co.`,
    ``,
    `Your copy of the Precision Hormone & Peptide Therapy eBook is ready:`,
    ebookUrl,
    ``,
    `Liliana will follow up personally within one business day if you asked a`,
    `question or want to talk through your protocol. If you didn't, no pressure ·`,
    `the eBook is yours to keep.`,
    ``,
    `Talk soon,`,
    `Liliana Damron, APRN, FNP-BC`,
    `Founder, Viva Wellness Co.`,
    `vivawellnessco.com · (737) 210-7283 · @vivawellnessatx`,
  ].join('\n');

  const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0c0a09;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr><td style="background:#0c0a09;padding:28px 32px;">
          <div style="font-family:'Anton','Impact',Arial Narrow,sans-serif;font-size:28px;color:#f5f1ea;letter-spacing:0.02em;text-transform:uppercase;">
            Viva Wellness Co.
          </div>
          <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#c9783a;margin-top:6px;">
            Peptides &nbsp;·&nbsp; Hormone Optimization &nbsp;·&nbsp; Weight Loss
          </div>
        </td></tr>

        <tr><td style="padding:36px 32px 8px 32px;">
          <h1 style="font-family:Georgia,serif;font-weight:400;font-size:32px;line-height:1.15;letter-spacing:-0.01em;color:#0c0a09;margin:0 0 12px 0;">
            Hi ${esc(first)}, your eBook is ready.
          </h1>
          <p style="font-size:16px;line-height:1.6;color:#2a2420;margin:0 0 20px 0;">
            Thanks for reaching out to Viva Wellness Co. The Precision Hormone &amp;
            Peptide Therapy guide is below. It is plain-language, honest, and built
            to make your consult faster.
          </p>
        </td></tr>

        <tr><td style="padding:8px 32px 28px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td style="background:#c9783a;border-radius:2px;">
              <a href="${esc(ebookUrl)}"
                 style="display:inline-block;padding:14px 26px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#0c0a09;text-decoration:none;">
                Download the eBook &nbsp;→
              </a>
            </td></tr>
          </table>
          <p style="font-size:13px;color:#8a7d72;margin:14px 0 0 0;">
            Or copy and paste: <a href="${esc(ebookUrl)}" style="color:#8a4d22;">${esc(ebookUrl)}</a>
          </p>
        </td></tr>

        <tr><td style="padding:0 32px 28px 32px;border-top:1px solid #ebe5db;padding-top:24px;">
          <p style="font-size:15px;line-height:1.6;color:#2a2420;margin:0 0 12px 0;">
            Liliana will follow up personally within one business day if you asked
            a question or want to talk through your protocol. If you didn't, no
            pressure. The eBook is yours to keep.
          </p>
          <p style="font-size:15px;line-height:1.6;color:#2a2420;margin:18px 0 4px 0;">Talk soon,</p>
          <p style="font-family:Georgia,serif;font-style:italic;font-size:18px;color:#0c0a09;margin:0 0 2px 0;">Liliana Damron, APRN, FNP-BC</p>
          <p style="font-size:13px;color:#8a7d72;margin:0;">Founder &amp; Provider, Viva Wellness Co.</p>
        </td></tr>

        <tr><td style="background:#f5f1ea;padding:20px 32px;font-size:11px;color:#8a7d72;line-height:1.6;border-top:1px solid #ebe5db;">
          <strong>Viva Wellness Co.</strong> &nbsp;·&nbsp; Austin, TX &nbsp;·&nbsp; 100% Telehealth &nbsp;·&nbsp; TX, CO, FL<br/>
          <a href="https://vivawellnessco.com" style="color:#8a4d22;text-decoration:none;">vivawellnessco.com</a> &nbsp;·&nbsp;
          <a href="tel:+17372107283" style="color:#8a4d22;text-decoration:none;">(737) 210-7283</a> &nbsp;·&nbsp;
          <a href="https://instagram.com/vivawellnessatx" style="color:#8a4d22;text-decoration:none;">@vivawellnessatx</a>
          <br/><br/>
          This message was sent because you submitted a form on vivawellnessco.com.
          Not medical advice. All therapies require provider review and approval.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  return { html, text };
}

function buildNotifyEmail({ source, name, email, phone, message, quiz, match, utm, referrer }) {
  const rows = [
    ['Source', source],
    ['Name', name],
    ['Email', email],
    ['Phone', phone || '(not provided)'],
  ];
  if (match) {
    rows.push(['Matched protocol', `${match.name} · ${match.price}/mo`]);
  }
  if (quiz) {
    const labels = {
      goal: 'Primary goal',
      age: 'Age range',
      sex: 'Sex',
      activity: 'Activity level',
      budget: 'Budget',
    };
    for (const [k, v] of Object.entries(quiz)) {
      rows.push([labels[k] || k, String(v)]);
    }
  }
  if (message) {
    rows.push(['Message', message]);
  }
  if (utm && typeof utm === 'object') {
    const order = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    for (const k of order) {
      if (utm[k]) rows.push([k, String(utm[k])]);
    }
  }
  if (referrer) {
    rows.push(['Referrer', referrer]);
  }
  rows.push(['Submitted', new Date().toISOString()]);

  const text =
    `New ${source} lead\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  const html = `
<!doctype html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0c0a09;background:#f5f1ea;margin:0;padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;padding:24px;border-radius:4px;">
        <tr><td>
          <h2 style="font-family:Georgia,serif;margin:0 0 16px 0;font-size:22px;">New ${esc(source)} lead</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${rows
              .map(
                ([k, v]) =>
                  `<tr>
                    <td style="padding:8px 12px 8px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#8a7d72;width:140px;vertical-align:top;border-bottom:1px solid #ebe5db;">${esc(k)}</td>
                    <td style="padding:8px 0;font-size:14px;color:#0c0a09;vertical-align:top;border-bottom:1px solid #ebe5db;">${esc(v)}</td>
                  </tr>`
              )
              .join('')}
          </table>
          <p style="font-size:12px;color:#8a7d72;margin:20px 0 0 0;">Reply directly to this email to respond to the lead.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  return { html, text };
}
