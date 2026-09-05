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
  test('home responds 200', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
  });

  test('site uses the Founder Garden Viva favicon', async ({ page }) => {
    await blockExternal(page);
    await page.goto('/');
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon-viva-garden-v1.svg');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/viva-icon-garden-v1.png');
  });

  test('home renders the #quiz section (public/_redirects 301s /quiz here)', async ({ page }) => {
    await blockExternal(page);
    await page.goto('/');
    await expect(page.locator('#quiz')).toHaveCount(1);
  });

  test('home hero uses the approved copy and clean button treatments', async ({ page }) => {
    await blockExternal(page);
    await page.goto('/');
    await expect(page.locator('.hero__eyebrows')).toContainText('Concierge telehealth · TX · CO · FL · IA');
    await expect(page.locator('.hero__eyebrow-secondary')).toHaveText('100% concierge care');
    await expect(page.locator('.hero__title')).toContainText('You bring the goals.');
    await expect(page.locator('.hero__title .italic-display')).toHaveText("I'll build the protocol.");
    await expect(page.locator('.hero__media img')).toHaveAttribute('src', '/liliana-founder-hero-v3-1920.webp');
    await expect(page.locator('.hero__portrait')).toHaveCount(0);

    const styles = await page.evaluate(() => {
      const title = getComputedStyle(document.querySelector('.hero__title'));
      const primary = getComputedStyle(document.querySelector('.hero__ctas .btn--bronze'));
      const quiet = getComputedStyle(document.querySelector('.hero__btn-quiet'));
      const header = getComputedStyle(document.querySelector('.site-header--home'));
      return {
        titleShadow: title.textShadow,
        primaryBorder: primary.borderTopColor,
        quietBorder: quiet.borderTopColor,
        headerPosition: header.position,
        forestAccent: getComputedStyle(document.documentElement).getPropertyValue('--bronze').trim(),
        gardenGreen: getComputedStyle(document.documentElement).getPropertyValue('--evergreen').trim(),
      };
    });
    expect(styles.titleShadow).toBe('none');
    expect(styles.primaryBorder).toBe('rgba(0, 0, 0, 0)');
    expect(styles.quietBorder).toBe('rgb(255, 253, 248)');
    expect(styles.headerPosition).toBe('absolute');
    expect(styles.forestAccent).toBe('#1d5137');
    expect(styles.gardenGreen).toBe('#174b33');
  });

  test('interior page mastheads carry the Founder Garden green', async ({ page }) => {
    await blockExternal(page);
    for (const [route, selector] of [
      ['/about/', '.about-hero'],
      ['/services/', '.services-hero'],
      ['/menopause/', '.meno-hero'],
      ['/menu/', '.menu-hero'],
      ['/partners/', '.partners-hero'],
      ['/contact/', '.contact-hero'],
      ['/start/', '.start-hero'],
      ['/blog/', '.blog-hero'],
    ]) {
      await page.goto(route);
      await expect(page.locator(selector)).toHaveCSS('background-color', 'rgb(23, 75, 51)');
    }
  });

  test('home hero headline stays on its two intended lines at wide and compact viewports', async ({ page }) => {
    await blockExternal(page);

    for (const viewport of [
      { width: 2048, height: 573 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const geometry = await page.locator('.hero__title').evaluate((title) => {
        const copy = title.closest('.hero__copy');
        const lines = Array.from(title.querySelectorAll('.hero__title-line'));
        return {
          copyWidth: copy?.getBoundingClientRect().width || 0,
          titleScrollWidth: title.scrollWidth,
          lineCount: lines.length,
          lineHeights: lines.map((line) => line.getBoundingClientRect().height),
          expectedLineHeight: Number.parseFloat(getComputedStyle(title).lineHeight),
        };
      });

      expect(geometry.lineCount).toBe(2);
      expect(geometry.titleScrollWidth).toBeLessThanOrEqual(geometry.copyWidth + 1);
      for (const height of geometry.lineHeights) {
        expect(height).toBeLessThanOrEqual(geometry.expectedLineHeight + 1);
      }
    }
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

  test('customers can reach the email-preferences form from the footer', async ({ page }) => {
    await blockExternal(page);
    await page.goto('/unsubscribe/');
    const form = page.locator('form#unsubscribe-form');
    await expect(form).toHaveCount(1);
    await expect(form.locator('input[name="email"]')).toHaveCount(1);
    await expect(form.locator('input[name="company"]')).toHaveCount(1);
    await expect(form.locator('.cf-turnstile')).toHaveCount(1);
    await page.goto('/');
    await expect(page.locator('.site-footer a[href="/unsubscribe"]')).toHaveText('Email Preferences');
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

test.describe('quiz submit resilience', () => {
  test('failed POST keeps the lead, shows retry UI; retry resends and succeeds', async ({ page }) => {
    await blockExternal(page);

    // Mock /api/lead deterministically: first POST fails with a 500, later
    // POSTs succeed. (Registered after blockExternal so it matches first;
    // /api/lead is same-origin anyway.)
    let failNext = true;
    let posts = 0;
    await page.route('**/api/lead', async (route) => {
      posts += 1;
      await route.fulfill({
        status: failNext ? 500 : 200,
        contentType: 'application/json',
        body: JSON.stringify(failNext ? { ok: false } : { ok: true }),
      });
    });

    await page.goto('/');

    // Walk the five questions with realistic answers. Each click advances a
    // step; the selectors are unique per step so auto-waiting handles pacing.
    const answers = [
      ['goal', 'hormones'],
      ['age', '45to54'],
      ['sex', 'f'],
      ['activity', 'moderate'],
      ['budget', 'b199'],
    ];
    for (const [q, v] of answers) {
      await page.click(`.qx__opt[data-q="${q}"][data-v="${v}"]`);
    }

    // Gate step: fill the lead form. The Turnstile script is blocked by
    // blockExternal, so the token is empty — the route is mocked anyway.
    await page.fill('#qx-name', 'Test Lead');
    await page.fill('#qx-email', 'lead@example.com');
    await page.click('#qx-submit');

    // Failure: inline error + retry button appear, the entered email is
    // still in the form, and the submit control is re-enabled (no spinner
    // dead-end, no lost answers).
    const retry = page.locator('#qx-retry');
    await expect(retry).toBeVisible();
    await expect(page.locator('#qx-status')).toContainText('nothing was lost');
    await expect(page.locator('#qx-email')).toHaveValue('lead@example.com');
    await expect(page.locator('#qx-name')).toHaveValue('Test Lead');
    await expect(page.locator('#qx-submit')).toBeEnabled();
    expect(posts, 'exactly one POST so far (no double-post)').toBe(1);

    // Server healthy again: the retry button resends the same payload and
    // the result step renders.
    failNext = false;
    await retry.click();
    await expect(page.locator('.qx__step[data-step="7"]')).toHaveClass(/is-active/);
    await expect(page.locator('#qx-r-name')).toBeVisible();
    await expect(page.locator('#qx-r-name')).toHaveText('Viva Concierge Access');
    await expect(page.locator('#qx-r-price')).toHaveText('$99');
    await expect(page.locator('#qx-r-body')).toContainText('not included in the $99 membership fee');
    await expect(retry).toBeHidden();
    expect(posts, 'retry sent exactly one more POST').toBe(2);
  });
});
