// Cloudflare Pages Function: POST /api/contact
//
// Reads JSON form data from the contact page, validates it,
// emails Liliana via Resend, and optionally fires a Zapier webhook.
//
// Required env vars (set in Cloudflare dashboard):
//   RESEND_API_KEY      · from resend.com (free tier: 3000/mo)
//   CONTACT_TO          · recipient (e.g. info@vivawellnessco.com)
//   CONTACT_FROM        · sender on a verified domain (e.g. noreply@vivawellnessco.com)
//
// Optional:
//   ZAPIER_WEBHOOK_URL  · if set, fires this webhook with the form data as JSON
//   LEADS_KV (binding)  · if bound, the send is recorded in the delivery audit
//                         log (see _log.js). Degrades to a no-op without it.

import { logEmailEvent } from './_log.js';

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();
    const { name, email, state, goal, message, _honey } = data;

    // Honeypot trap. Real users never fill the hidden field.
    // Silently respond OK so bots don't know we caught them.
    if (_honey) {
      return Response.json({ ok: true });
    }

    // Basic validation.
    if (!name || !email || !email.includes('@')) {
      return Response.json(
        { error: 'Name and a valid email are required.' },
        { status: 400 }
      );
    }
    if (name.length > 200 || (message && message.length > 5000)) {
      return Response.json({ error: 'Submission too long.' }, { status: 400 });
    }

    // Build email body (plain text, predictable formatting).
    const subject = `New inquiry from ${name}${goal ? `: ${goal}` : ''}`;
    const text = [
      'New contact form submission from vivawellnessco.com',
      '',
      `Name:    ${name}`,
      `Email:   ${email}`,
      `State:   ${state || 'Not specified'}`,
      `Goal:    ${goal || 'Not specified'}`,
      '',
      'Message:',
      message || '(no message)',
      '',
      `· Submitted ${new Date().toISOString()}`,
    ].join('\n');

    // Send via Resend.
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: env.CONTACT_TO,
        reply_to: email,
        subject,
        text,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error('Resend failed:', resendRes.status, err);
      await logEmailEvent(env, {
        to: env.CONTACT_TO,
        status: 'send_failed',
        kind: 'contact',
        subject,
      });
      return Response.json(
        { error: 'Failed to send. Please email us directly.' },
        { status: 502 }
      );
    }

    // Audit log: record the send (best-effort). The id lets the dashboard
    // correlate this row with later Resend delivery webhooks.
    const sent = await resendRes.json().catch(() => null);
    await logEmailEvent(env, {
      id: sent && sent.id,
      to: env.CONTACT_TO,
      status: 'sent',
      kind: 'contact',
      subject,
    });

    // Optional: forward to a Zapier webhook if one is configured.
    if (env.ZAPIER_WEBHOOK_URL) {
      try {
        await fetch(env.ZAPIER_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, state, goal, message }),
        });
      } catch (zapErr) {
        // Non-fatal. Email already sent.
        console.error('Zapier webhook failed:', zapErr);
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('Contact function error:', err);
    return Response.json({ error: 'Server error.' }, { status: 500 });
  }
}

// Reject anything that isn't POST.
export async function onRequest({ request }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
}
