// Funnel-contract and content-integrity suite.
// Encodes the protected contracts from AGENTS.md against the static build:
// form field names and source values that /api/lead reads, the #quiz anchor,
// GlossGenius booking host, FAQPage JSON-LD, robots directives, sitemap,
// price figures, and the single-use brand line.
//
// Everything runs against `astro preview` serving dist/ (see
// playwright.config.mjs). No external network calls: request-level tests
// never leave localhost, and page-level tests abort any non-localhost URL.
import { test, expect } from '@playwright/test';

const ORIGIN = 'http://localhost:4173';

// Source values /api/lead meaningfully accepts (functions/api/lead.js
// destructures `source` with default 'contact' and special-cases 'quiz'
// and 'refer').
const ACCEPTED_SOURCES = ['contact', 'quiz', 'refer'];

// Abort every request that is not same-origin so a page test can never
// reach a third-party host (Turnstile script, analytics, fonts CDNs).
async function blockExternal(page) {
  await page.route(/^(?!http:\/\/localhost:4173)/, (route) => route.abort());
}

// Pull every JSON-LD block out of raw HTML and parse it. Throws (failing
// the test) if any block is not valid JSON.
function parseJsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks.map((m) => JSON.parse(m[1]));
}

// Find FAQPage nodes anywhere in a parsed JSON-LD document (top level or
// inside an @graph array).
function faqPagesIn(docs) {
  const nodes = [];
  for (const doc of docs) {
    const candidates = Array.isArray(doc['@graph']) ? doc['@graph'] : [doc];
    for (const node of candidates) {
      if (node && node['@type'] === 'FAQPage') nodes.push(node);
    }
  }
  return nodes;
}

test.describe('funnel contracts', () => {
  test('home responds 200 and the brand line appears exactly once', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const html = await res.text();
    const count = html.split('You bring the goals.').length - 1;
    expect(count, 'brand line "You bring the goals." must appear exactly once on home').toBe(1);
  });

  test('home renders the #quiz section (public/_redirects 301s /quiz here)', async ({ page }) => {
    await blockExternal(page);
    await page.goto('/');
    await expect(page.locator('#quiz')).toHaveCount(1);
  });

  test('contact form carries the exact field names /api/lead reads', async ({ page }) => {
    await blockExternal(page);
    await page.goto('/contact/');
    const form = page.locator('form#contact-form');
    await expect(form).toHaveCount(1);
    await expect(form.locator('input[name="name"]')).toHaveCount(1);
    await expect(form.locator('input[name="email"]')).toHaveCount(1);
    await expect(form.locator('input[name="phone"]')).toHaveCount(1);
    await expect(form.locator('textarea[name="message"]')).toHaveCount(1);
    await expect(form.locator('input[name="company"]')).toHaveCount(1); // honeypot
  });

  test('quiz gate form carries the exact field names /api/lead reads', async ({ page }) => {
    await blockExternal(page);
    await page.goto('/');
    const form = page.locator('form#qx-form');
    await expect(form).toHaveCount(1);
    await expect(form.locator('input[name="name"]')).toHaveCount(1);
    await expect(form.locator('input[name="email"]')).toHaveCount(1);
    await expect(form.locator('input[name="phone"]')).toHaveCount(1);
    await expect(form.locator('input[name="company"]')).toHaveCount(1); // honeypot
  });

  test('lead submit scripts post only source values /api/lead accepts', async ({ request }) => {
    // Gather every text that posts to /api/lead: the contact page (inline
    // script) and the home page plus its bundled module scripts (the quiz
    // submit lives in an external _astro chunk).
    const texts = [];
    const contactHtml = await (await request.get('/contact/')).text();
    texts.push(contactHtml);
    const homeHtml = await (await request.get('/')).text();
    texts.push(homeHtml);
    for (const m of homeHtml.matchAll(/src="(\/_astro\/[^"]+\.js)"/g)) {
      texts.push(await (await request.get(m[1])).text());
    }

    const posters = texts.filter((t) => t.includes('/api/lead') || t.includes('api/lead'));
    expect(posters.length, 'expected at least the contact and quiz submit scripts').toBeGreaterThanOrEqual(2);

    const found = new Set();
    for (const t of posters) {
      for (const m of t.matchAll(/\bsource\s*:\s*["']([a-z]+)["']/g)) found.add(m[1]);
    }
    expect(found.has('contact'), 'contact form posts source:"contact"').toBe(true);
    expect(found.has('quiz'), 'quiz form posts source:"quiz"').toBe(true);
    for (const v of found) {
      expect(ACCEPTED_SOURCES, `source "${v}" must be one lead.js accepts`).toContain(v);
    }
  });

  test('every GlossGenius link points at vivawellnessco.glossgenius.com', async ({ request }) => {
    const pages = ['/', '/services/', '/start/', '/contact/', '/menu/', '/menopause/'];
    let total = 0;
    for (const path of pages) {
      const html = await (await request.get(path)).text();
      for (const m of html.matchAll(/href="(https?:\/\/[^"]*glossgenius[^"]*)"/gi)) {
        total += 1;
        const url = new URL(m[1]);
        expect(url.host, `GlossGenius link on ${path}`).toBe('vivawellnessco.glossgenius.com');
      }
    }
    expect(total, 'at least one GlossGenius booking link must exist').toBeGreaterThan(0);
  });
});

test.describe('content integrity', () => {
  test('home JSON-LD parses and contains FAQPage question entries', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const docs = parseJsonLd(html);
    expect(docs.length).toBeGreaterThanOrEqual(2); // sitewide graph + FAQPage
    const faqs = faqPagesIn(docs);
    expect(faqs.length).toBe(1);
    const questions = faqs[0].mainEntity;
    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q['@type']).toBe('Question');
      expect(typeof q.name).toBe('string');
      expect(q.name.length).toBeGreaterThan(0);
    }
  });

  test('/menopause/ JSON-LD parses and contains FAQPage question entries', async ({ request }) => {
    const html = await (await request.get('/menopause/')).text();
    const faqs = faqPagesIn(parseJsonLd(html));
    expect(faqs.length).toBe(1);
    const questions = faqs[0].mainEntity;
    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q['@type']).toBe('Question');
    }
  });

  test('/sitemap-index.xml responds 200 with a sitemap index', async ({ request }) => {
    const res = await request.get('/sitemap-index.xml');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('<sitemapindex');
  });

  test('home has no robots noindex meta', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).not.toMatch(/<meta[^>]+name="robots"[^>]*noindex/i);
  });

  test('404 page is served with status 404 and a robots noindex meta', async ({ request }) => {
    const res = await request.get('/this-page-does-not-exist/');
    expect(res.status()).toBe(404);
    const html = await res.text();
    expect(html).toMatch(/<meta[^>]+name="robots"[^>]+content="[^"]*noindex[^"]*"/i);
  });

  test('/services/ shows the $99 and $199 tiers', async ({ request }) => {
    const res = await request.get('/services/');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('$99');
    expect(html).toContain('$199');
  });

  test('/start/ shows the $199 first visit and the $50 deposit', async ({ request }) => {
    const res = await request.get('/start/');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('$199');
    expect(html).toContain('$50 deposit');
  });

  test('/menu/ and /menopause/ respond 200 at their trailing-slash routes', async ({ request }) => {
    for (const path of ['/menu/', '/menopause/']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
    }
  });
});
