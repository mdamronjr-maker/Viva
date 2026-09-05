// Synthetic fixtures only. External browser traffic is blocked and every
// server-side vendor call is intercepted; this suite sends no real request.
import { test, expect } from '@playwright/test';
import { onRequestPost as handleLead } from '../functions/api/lead.js';

const fixture = {
  source: 'contact',
  name: 'Synthetic Visitor',
  email: 'visitor@example.test',
  phone: '',
  message: 'Scheduling or first-visit question',
};

async function submitToMockVendor(payload, { native = false, failAt = 0, env = {} } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (!url.startsWith('https://api.resend.com/')) throw new Error('Unexpected vendor destination');
    calls.push({ url, payload: JSON.parse(options.body) });
    return new Response(JSON.stringify({ id: `synthetic-${calls.length}` }), {
      status: calls.length === failAt ? 502 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const response = await handleLead({
      request: new Request('https://example.test/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': native ? 'application/x-www-form-urlencoded' : 'application/json' },
        body: native ? new URLSearchParams(payload) : JSON.stringify(payload),
      }),
      env: { RESEND_API_KEY: 'synthetic-test-key', RESEND_AUDIENCE_ID: 'synthetic-audience', ...env },
    });
    return { response, calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function blockExternal(page) {
  await page.route(/^(?!http:\/\/(?:localhost|127\.0\.0\.1):4173)/, (route) => route.abort());
}

test('untrusted attribution never reaches vendor email, audience, or nurture payloads', async () => {
  for (const marketingConsent of [false, true]) {
    const { response, calls } = await submitToMockVendor({
      ...fixture,
      marketingConsent,
      utm: {
        utm_source: 'synthetic-sensitive-source',
        utm_medium: 'synthetic-sensitive-medium',
        utm_campaign: 'synthetic-sensitive-campaign',
        utm_content: 'synthetic-sensitive-content',
        utm_term: 'synthetic-sensitive-term',
      },
      campaign: 'synthetic-sensitive-extra',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(calls.length).toBe(marketingConsent ? 7 : 2);
    expect(JSON.stringify(calls)).not.toContain('synthetic-sensitive');
    expect(JSON.stringify(calls)).not.toContain('utm_');
    expect(calls[0].payload.subject).toBe('New non-clinical contact request');
    expect(calls[0].payload.subject).not.toContain(fixture.name);
    expect(calls[0].payload.text).toContain('Source: contact');
  }
});

test('native success redirects to a static confirmation without contact data', async () => {
  const { response } = await submitToMockVendor(fixture, { native: true });
  expect(response.status).toBe(303);
  expect(response.headers.get('Location')).toBe('https://example.test/contact/received/');
});

test('a failed practice notification cannot send a false receipt or marketing sequence', async () => {
  const { response, calls } = await submitToMockVendor({ ...fixture, marketingConsent: true }, { failAt: 1 });
  expect(response.status).toBe(502);
  expect((await response.json()).ok).toBe(false);
  expect(calls).toHaveLength(1);
});

test('a failed acknowledgment does not ask visitors to repeat a delivered request', async () => {
  const { response, calls } = await submitToMockVendor(fixture, { failAt: 2 });
  expect(response.status).toBe(200);
  expect((await response.json()).ok).toBe(true);
  expect(calls).toHaveLength(2);
});

test('suppression-store failure skips optional marketing without losing receipt', async () => {
  for (const marketingConsent of [false, true]) {
    let suppressionReads = 0;
    const { response, calls } = await submitToMockVendor({ ...fixture, marketingConsent }, {
      env: {
        LEADS_KV: {
          get: async (key) => {
            if (key.startsWith('supp:')) suppressionReads += 1;
            throw new Error('Synthetic KV outage');
          },
          put: async () => { throw new Error('Synthetic KV outage'); },
        },
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(suppressionReads).toBe(marketingConsent ? 1 : 0);
    expect(calls).toHaveLength(2);
    expect(calls.every(({ url }) => url.endsWith('/emails'))).toBe(true);
    expect(calls.some(({ payload }) => payload.scheduled_at)).toBe(false);
  }
});

test('booking handoff keeps only its fixed neutral identifier despite incoming queries', async ({ page }) => {
  await blockExternal(page);
  await page.goto('/start/?utm_source=synthetic-sensitive-source&utm_campaign=synthetic-sensitive-campaign&utm_content=synthetic-sensitive-content');
  const links = page.locator('main a[href*="glossgenius.com/services"]');
  expect(await links.count()).toBeGreaterThan(0);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('href', 'https://vivawellnessco.glossgenius.com/services?utm_source=vivawellnessco&utm_medium=cta&utm_content=start_page');
    await expect(link).toHaveAttribute('rel', /noreferrer/);
  }
});

test('contact enhancement links validation, focuses feedback, and drops attribution', async ({ page }) => {
  await blockExternal(page);
  const sent = [];
  await page.route('**/api/lead', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto('/contact/?utm_campaign=synthetic-sensitive-campaign&utm_content=synthetic-sensitive-content');
  await expect(page.locator('#contact-form')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Send contact request', exact: true }).click();
  await expect(page.locator('#c-name')).toBeFocused();
  await expect(page.locator('#c-name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#c-name-error')).toHaveText('Enter your name.');
  expect(sent).toHaveLength(0);
  await page.getByLabel('Your name', { exact: true }).fill(fixture.name);
  await page.getByLabel('Email', { exact: true }).fill(fixture.email);
  await page.getByLabel('What can we help with?', { exact: true }).selectOption(fixture.message);
  await page.getByRole('button', { name: 'Send contact request', exact: true }).click();
  await expect(page.locator('#c-status')).toContainText('Viva received your contact request.');
  await expect(page.locator('#c-status')).toBeFocused();
  expect(sent).toHaveLength(1);
  expect(sent[0]).not.toHaveProperty('utm');
  expect(JSON.stringify(sent[0])).not.toContain('synthetic-sensitive');
  expect(sent[0].marketingConsent).toBe(false);
});

test('contact failure preserves inputs and moves focus to actionable feedback', async ({ page }) => {
  await blockExternal(page);
  await page.route('**/api/lead', (route) => route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: '{"ok":false,"error":"Request could not be sent. Please try again."}',
  }));
  await page.goto('/contact/');
  await expect(page.locator('#contact-form')).toHaveAttribute('data-ready', 'true');
  await page.getByLabel('Your name', { exact: true }).fill(fixture.name);
  await page.getByLabel('Email', { exact: true }).fill(fixture.email);
  await page.getByLabel('What can we help with?', { exact: true }).selectOption(fixture.message);
  await page.getByRole('button', { name: 'Send contact request', exact: true }).click();
  await expect(page.locator('#c-status')).toHaveText('Request could not be sent. Please try again.');
  await expect(page.locator('#c-status')).toBeFocused();
  await expect(page.locator('#c-name')).toHaveValue(fixture.name);
  await expect(page.getByRole('button', { name: 'Send contact request', exact: true })).toBeEnabled();
});

test('native confirmation is readable without JavaScript and excluded from indexing', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await blockExternal(page);
  await page.goto('http://127.0.0.1:4173/contact/received/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your request has been sent.');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('.phi-notice')).toContainText(/do not share/i);
  await context.close();
});
