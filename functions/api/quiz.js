// Cloudflare Pages Function: POST /api/quiz
//
// Receives quiz completion + email opt-in.
// 1. Emails Liliana a structured lead notification.
// 2. Emails the user a copy of their recommended protocol.
//
// Reuses the same Resend env vars set up for /api/contact:
//   RESEND_API_KEY, CONTACT_TO, CONTACT_FROM
// Optional: ZAPIER_WEBHOOK_URL forwards the lead for downstream automation.

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { email, source, result, _honey } = body;

    if (_honey) return Response.json({ ok: true });
    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Valid email required.' }, { status: 400 });
    }
    if (!result || !result.name) {
      return Response.json({ error: 'Quiz result missing.' }, { status: 400 });
    }

    // ===== Email 1: lead notification to Liliana =====
    const answersText = (result.answers || [])
      .map((a, i) => `  ${i + 1}. ${a.question}\n     → ${a.choice}`)
      .join('\n\n');

    const leadText = [
      'New quiz lead from vivawellnessco.com',
      '',
      `Email:           ${email}`,
      `Recommended:     ${result.name} (${result.price}/mo)`,
      `Category:        ${result.category}`,
      `Score:           ${result.score}`,
      '',
      'ANSWERS:',
      '',
      answersText,
      '',
      `· Submitted ${new Date().toISOString()}`,
    ].join('\n');

    const leadRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: env.CONTACT_TO,
        reply_to: email,
        subject: `Quiz lead: ${result.name} · ${email}`,
        text: leadText,
      }),
    });

    if (!leadRes.ok) {
      const err = await leadRes.text();
      console.error('Lead email failed:', leadRes.status, err);
      return Response.json({ error: 'Could not send. Try again.' }, { status: 502 });
    }

    // ===== Email 2: confirmation to the prospect =====
    const userSubject = `Your Viva Wellness protocol: ${result.name}`;
    const userText = [
      `Thanks for taking the protocol quiz at Viva Wellness Co.`,
      ``,
      `Based on your answers, your match is:`,
      ``,
      `  ${result.name} · ${result.price}/mo`,
      `  Category: ${result.category}`,
      ``,
      `What's typically included:`,
      `(Final protocol details are confirmed by your provider during your first visit.)`,
      ``,
      `Next step: book your first telehealth visit at`,
      `https://vivawellnessco.glossgenius.com/`,
      ``,
      `Liliana will review your goals and labs in detail, and confirm or adjust`,
      `the recommended tier based on her clinical assessment.`,
      ``,
      `Questions before you book? Reply to this email and we'll get back to you.`,
      ``,
      `· Viva Wellness Co.`,
      `   Performance medicine, delivered virtually from Austin, TX`,
    ].join('\n');

    // Don't block on user email; if Liliana got the lead, that's the critical path.
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM,
        to: email,
        reply_to: env.CONTACT_TO,
        subject: userSubject,
        text: userText,
      }),
    }).catch(err => console.error('User confirmation failed:', err));

    // ===== Optional Zapier webhook =====
    if (env.ZAPIER_WEBHOOK_URL) {
      fetch(env.ZAPIER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'quiz', email, result }),
      }).catch(err => console.error('Zapier failed:', err));
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('Quiz function error:', err);
    return Response.json({ error: 'Server error.' }, { status: 500 });
  }
}

export async function onRequest({ request }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
}
