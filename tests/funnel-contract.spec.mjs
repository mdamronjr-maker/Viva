// Production-safety, funnel, SEO, accessibility, and responsive contracts.
// Runs against the built static site through `astro preview` and blocks all
// third-party requests. It never submits a live form or opens the scheduler.
import { test, expect } from '@playwright/test';
import { onRequestPost as handleLead } from '../functions/api/lead.js';
import { onRequestPost as handleUnsubscribe } from '../functions/api/unsubscribe.js';

const PUBLIC_PAGES = [
  '/',
  '/about/',
  '/services/',
  '/weight-management/',
  '/testosterone/',
  '/menopause/',
  '/peptide-therapy/',
  '/recovery/',
  '/partners/',
  '/blog/',
  '/blog/concierge-telehealth-explained/',
  '/blog/glp-1-weight-loss-austin/',
  '/blog/perimenopause-starts-earlier/',
  '/blog/the-parent-tax/',
  '/blog/tirzepatide-vs-semaglutide/',
  '/contact/',
  '/start/',
  '/privacy/',
  '/terms/',
  '/notice/',
  '/accessibility/',
];

const RESPONSIVE_PAGES = [
  '/',
  '/services/',
  '/weight-management/',
  '/menopause/',
  '/peptide-therapy/',
  '/about/',
  '/contact/',
  '/start/',
  '/blog/the-parent-tax/',
];

async function blockExternal(page) {
  await page.route(/^(?!http:\/\/(?:localhost|127\.0\.0\.1):4173)/, (route) => route.abort());
}

function parseJsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks.map((m) => JSON.parse(m[1]));
}

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

test.describe('brand and experience contracts', () => {
  test('home responds and uses the aligned brand assets', async ({ page }) => {
    await blockExternal(page);
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon-viva-garden-v2.svg');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/viva-icon-garden-v2.png');
    await expect(page.locator('.brand__logo')).toHaveAttribute('src', '/viva-logo-paper-cropped.png');
    await expect(page.locator('[data-viva-wordmark="viva"] img')).toHaveAttribute('src', '/viva-logo-paper-cropped.png');
    await expect(page.locator('[data-viva-wordmark="full"] img')).toHaveAttribute('src', '/viva-logo-paper-cropped.png');
    await expect(page.locator('[data-viva-monogram]')).toHaveCount(0);
  });

  test('home states care, provider, service area, and primary action', async ({ page }) => {
    await blockExternal(page);
    await page.goto('/');
    await expect(page.locator('.hero__eyebrows .eyebrow')).toHaveAttribute('aria-label', 'Concierge telehealth in Texas, Colorado, Florida, and Iowa');
    await expect(page.locator('.hero__eyebrows')).toContainText('TX · CO · FL · IA');
    await expect(page.locator('.hero__eyebrow-secondary')).toHaveText('Austin-based · Virtual care');
    await expect(page.locator('.hero__title')).toContainText('Medical weight and hormone care.');
    await expect(page.locator('.hero__title .italic-display')).toHaveText('Built around your life.');
    await expect(page.locator('.hero__lead')).toContainText('Liliana Damron, APRN, FNP-BC');
    await expect(page.locator('.hero__ctas a').first()).toHaveText('Book a visit');

    const image = page.locator('.hero__media img');
    await expect(image).toHaveAttribute('src', '/liliana-founder-portrait-v2.webp');
    await expect(image).toHaveAttribute('width', '2048');
    await expect(image).toHaveAttribute('height', '3072');
    await expect(image).toHaveAttribute('srcset', /2048w/);

    const rotation = page.locator('[data-tplaypause]');
    await expect(rotation).toHaveAttribute('aria-label', 'Play automatic review rotation');
    await expect(rotation).toHaveAttribute('aria-pressed', 'false');
    await rotation.click();
    await expect(rotation).toHaveAttribute('aria-label', 'Pause automatic review rotation');
    await expect(rotation).toHaveAttribute('aria-pressed', 'true');
  });

  test('key viewports have no horizontal overflow', async ({ page }) => {
    await blockExternal(page);
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      for (const route of RESPONSIVE_PAGES) {
        await page.goto(route);
        const geometry = await page.evaluate(() => ({
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect(geometry.scroll, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(geometry.client + 1);
      }
    }
  });

  test('mobile navigation exposes its links and restores state', async ({ page }) => {
    await blockExternal(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const toggle = page.locator('.nav-toggle');
    const menu = page.locator('#site-mobile-nav');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toHaveAttribute('inert', '');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).not.toHaveAttribute('inert', '');
    await expect(menu.locator('a[href="/services/"]')).toHaveText('Care & pricing');
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toHaveAttribute('inert', '');
  });

  test('Viva Perks publishes verified destinations with proximate disclosures', async ({ page }) => {
    await blockExternal(page);
    await page.goto('/partners/');

    const cards = page.locator('#viva-perks .perk-card');
    await expect(cards).toHaveCount(4);
    await expect(page.locator('#viva-perks .perk-card__static')).toHaveCount(0);

    const bodySpec = cards.filter({ hasText: 'BodySpec' });
    await expect(bodySpec.locator('.perk-code strong')).toHaveText('VIVA');
    await expect(bodySpec.locator('a')).toHaveCount(2);
    await expect(bodySpec.getByRole('link', { name: /Book a BodySpec scan/ }))
      .toHaveAttribute('href', 'https://www.bodyspec.com/booking');
    await expect(bodySpec.getByRole('link', { name: /View a sample report/ }))
      .toHaveAttribute('href', 'https://www.bodyspec.com/sample-report');
    await expect(bodySpec).toContainText('$10 off a one-time scan');
    await expect(bodySpec).toContainText('$5 off membership options');

    const momentous = cards.filter({ hasText: 'Momentous' });
    await expect(momentous.locator('.perk-code strong')).toHaveText('VIVA');
    await expect(momentous.getByRole('link', { name: /Shop Momentous/ }))
      .toHaveAttribute('href', 'https://crrnt.app/MOME/QMg8PBab');
    await expect(cards.filter({ hasText: 'Noble Origins' }).getByRole('link', { name: /Shop Noble Origins/ }))
      .toHaveAttribute('href', 'https://www.nobleorigins.com/VIVAWELLNESS');
    await expect(cards.filter({ hasText: 'Fullscript' }).getByRole('link', { name: /Fullscript shop/ }))
      .toHaveAttribute('href', 'https://us.fullscript.com/s/vivawellnessco/shop');

    await expect(page.locator('#viva-perks .perk-disclosure')).toHaveCount(4);
    for (const link of await page.locator('#viva-perks a[target="_blank"]').all()) {
      await expect(link).toHaveAttribute('rel', /noopener/);
    }
    for (const link of await page.locator('#viva-perks a[rel~="sponsored"]').all()) {
      await expect(link).toHaveAttribute('target', '_blank');
    }
  });
});

test.describe('privacy-conscious funnels', () => {
  test('lead endpoint rejects retired sources, guide data, and arbitrary messages', async () => {
    const post = (payload) => handleLead({
      request: new Request('https://vivawellnessco.com/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      env: {},
    });

    expect((await post({ source: 'refer' })).status).toBe(400);
    expect((await post({ source: 'contact', quiz: { goal: 'weight' } })).status).toBe(400);
    expect((await post({
      source: 'contact',
      name: 'Test Person',
      email: 'person@example.com',
      message: 'Symptoms and medication details should not reach email',
    })).status).toBe(400);

    const validShape = await post({
      source: 'contact',
      name: 'Test Person',
      email: 'person@example.com',
      message: 'Scheduling or first-visit question',
    });
    expect(validShape.status).toBe(500); // passed validation; no Resend key in test env
  });

  test('public email endpoints reject oversized addresses before processing', async () => {
    const oversizedEmail = `${'a'.repeat(250)}@example.com`;
    const leadResponse = await handleLead({
      request: new Request('https://vivawellnessco.com/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'contact',
          name: 'Test Person',
          email: oversizedEmail,
          message: 'Scheduling or first-visit question',
        }),
      }),
      env: {},
    });
    const unsubscribeResponse = await handleUnsubscribe({
      request: new Request('https://vivawellnessco.com/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: oversizedEmail }),
      }),
      env: {},
    });

    expect(leadResponse.status).toBe(400);
    expect(unsubscribeResponse.status).toBe(400);
  });

  test('contact form is brief, progressive, non-clinical, and opt-in by choice', async ({ page }) => {
    await blockExternal(page);
    await page.goto('/contact/');
    const form = page.locator('form#contact-form');
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form).toHaveAttribute('action', '/api/lead');
    await expect(form.locator('input[name="name"]')).toHaveCount(1);
    await expect(form.locator('input[name="email"]')).toHaveCount(1);
    await expect(form.locator('input[name="phone"]')).toHaveCount(1);
    await expect(form.locator('input[name="name"]')).toHaveAttribute('maxlength', '200');
    await expect(form.locator('input[name="email"]')).toHaveAttribute('maxlength', '254');
    await expect(form.locator('input[name="phone"]')).toHaveAttribute('maxlength', '40');
    await expect(form.locator('select[name="message"]')).toHaveCount(1);
    await expect(form.locator('textarea')).toHaveCount(0);
    await expect(form.locator('input[name="marketing_consent"]')).not.toBeChecked();
    await expect(form.locator('input[name="company"]')).toHaveCount(1);
    await expect(page.locator('.phi-notice')).toContainText(/do not share/i);
  });

  test('email preferences are noindex and progressively enhanced', async ({ page }) => {
    await blockExternal(page);
    await page.goto('/unsubscribe/');
    const form = page.locator('form#unsubscribe-form');
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form).toHaveAttribute('action', '/api/unsubscribe');
    await expect(form.locator('input[name="email"]')).toHaveCount(1);
    await expect(form.locator('input[name="email"]')).toHaveAttribute('maxlength', '254');
    await expect(form.locator('input[name="company"]')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.goto('/');
    await expect(page.locator('.site-footer a[href="/unsubscribe/"]')).toHaveText('Email Preferences');
  });

  test('care-path guide is anonymous, three-step, local-only, and non-diagnostic', async ({ page }) => {
    await blockExternal(page);
    let leadPosts = 0;
    await page.route('**/api/lead', (route) => {
      leadPosts += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' });
    });
    await page.goto('/');
    await expect(page.locator('#quiz')).toHaveCount(1);
    await expect(page.locator('#qx-step-label')).toHaveText('Question 1 of 3');
    await expect(page.locator('#quiz form, #quiz input, #quiz textarea')).toHaveCount(0);

    await page.click('.qx__opt[data-q="goal"][data-v="hormones"]');
    await page.click('.qx__opt[data-q="path"][data-v="menopause"]');
    await page.click('.qx__opt[data-q="budget"][data-v="b99"]');

    await expect(page.locator('.qx__step[data-step="4"]')).toHaveClass(/is-active/);
    await expect(page.locator('#qx-step-label')).toHaveText('Your starting point');
    await expect(page.locator('#qx-r-name')).toHaveText('Viva Concierge Access');
    await expect(page.locator('#qx-r-price')).toHaveText('$99');
    await expect(page.locator('#qx-r-body')).toContainText('clinical');
    await expect(page.locator('.qx__result-note')).toContainText(/eligibility/i);
    expect(leadPosts).toBe(0);
  });

  test('only the contact script posts to the lead endpoint', async ({ request }) => {
    const contactHtml = await (await request.get('/contact/')).text();
    const homeHtml = await (await request.get('/')).text();
    expect(contactHtml).toContain('/api/lead');
    expect(contactHtml).toMatch(/source\s*:\s*['"`]contact['"`]/);
    expect(homeHtml).not.toContain('/api/lead');
  });
});

test.describe('SEO, content, and accessibility contracts', () => {
  test('every public page has one h1, a title, description, and trailing-slash canonical', async ({ page }) => {
    await blockExternal(page);
    for (const route of PUBLIC_PAGES) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator('h1'), `${route} h1`).toHaveCount(1);
      expect((await page.title()).trim(), `${route} title`).not.toBe('');
      await expect(page.locator('meta[name="description"]'), `${route} description`).toHaveAttribute('content', /\S/);
      await expect(page.locator('link[rel="canonical"]'), `${route} canonical`).toHaveAttribute(
        'href',
        route === '/' ? 'https://vivawellnessco.com/' : `https://vivawellnessco.com${route}`
      );
    }
  });

  test('content images expose alt text and intrinsic dimensions', async ({ page }) => {
    await blockExternal(page);
    for (const route of ['/', '/about/', '/services/', '/blog/', '/blog/the-parent-tax/']) {
      await page.goto(route);
      const images = page.locator('main img');
      for (let i = 0; i < await images.count(); i += 1) {
        const image = images.nth(i);
        await expect(image, `${route} image ${i} alt`).toHaveAttribute('alt');
        await expect(image, `${route} image ${i} width`).toHaveAttribute('width', /\d+/);
        await expect(image, `${route} image ${i} height`).toHaveAttribute('height', /\d+/);
      }
    }
  });

  test('home, menopause, and peptide FAQ structured data parse', async ({ request }) => {
    for (const route of ['/', '/menopause/', '/peptide-therapy/']) {
      const docs = parseJsonLd(await (await request.get(route)).text());
      const faqs = faqPagesIn(docs);
      expect(faqs.length, route).toBe(1);
      expect(faqs[0].mainEntity.length, route).toBeGreaterThan(0);
      for (const question of faqs[0].mainEntity) {
        expect(question['@type']).toBe('Question');
        expect(question.acceptedAnswer?.['@type']).toBe('Answer');
      }
    }
  });

  test('peptide search destination is specific, internally linked, and claim-safe', async ({ page, request }) => {
    await blockExternal(page);
    await page.goto('/peptide-therapy/');

    await expect(page).toHaveTitle(/Peptide Therapy in Austin, TX/);
    await expect(page.locator('h1')).toContainText(/Peptide therapy/i);
    await expect(page.locator('main')).toContainText('Compounded drugs are not FDA-approved');
    await expect(page.locator('main')).toContainText('Texas, Colorado, Florida, or Iowa');
    await expect(page.locator('main')).toContainText('$199');
    await expect(page.locator('main')).toContainText('$50 deposit');

    const html = await (await request.get('/peptide-therapy/')).text();
    const docs = parseJsonLd(html);
    const service = docs
      .flatMap((doc) => Array.isArray(doc['@graph']) ? doc['@graph'] : [doc])
      .find((node) => node?.['@type'] === 'Service' && node.name === 'Peptide therapy consultation');
    expect(service).toBeTruthy();
    expect(service.areaServed?.map((area) => area.name)).toEqual(['Texas', 'Colorado', 'Florida', 'Iowa']);

    // A category-level destination must not silently become a compound menu
    // or imply that any requested product is automatically available.
    expect(html).not.toMatch(/BPC-157|TB-500|CJC-1295|ipamorelin|GHK-Cu|MOTS-c/i);
    expect(html).toMatch(/no automatic prescription/i);

    for (const route of ['/', '/services/']) {
      await page.goto(route);
      await expect(page.locator('a[href="/peptide-therapy/"]')).toHaveCount(2);
    }
  });

  test('sitemap is indexable and excludes utility or retired routes', async ({ request }) => {
    const index = await request.get('/sitemap-index.xml');
    expect(index.status()).toBe(200);
    const indexXml = await index.text();
    expect(indexXml).toContain('<sitemapindex');
    const sitemapPath = indexXml.match(/https:\/\/vivawellnessco\.com(\/sitemap-[^<]+\.xml)/)?.[1];
    expect(sitemapPath).toBeTruthy();
    const sitemap = await (await request.get(sitemapPath)).text();
    expect(sitemap).toContain('https://vivawellnessco.com/weight-management/');
    expect(sitemap).toContain('https://vivawellnessco.com/testosterone/');
    expect(sitemap).toContain('https://vivawellnessco.com/peptide-therapy/');
    expect(sitemap).toContain('https://vivawellnessco.com/recovery/');
    expect(sitemap).not.toContain('/quiz/');
    expect(sitemap).not.toContain('/menu/');
    expect(sitemap).not.toContain('/unsubscribe/');
  });

  test('404 is noindex and retired routes are absent from the build', async ({ request }) => {
    for (const route of ['/this-page-does-not-exist/', '/menu/', '/_refer/']) {
      const response = await request.get(route);
      expect(response.status(), route).toBe(404);
      expect(await response.text()).toMatch(/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i);
    }
  });

  test('published prices and booking host remain visible and consistent', async ({ request }) => {
    const services = await (await request.get('/services/')).text();
    for (const price of ['$99', '$199', '$249', '$349', '$499']) expect(services).toContain(price);
    const start = await (await request.get('/start/')).text();
    expect(start).toContain('$199');
    expect(start).toContain('$50 deposit');

    let total = 0;
    for (const route of ['/', '/services/', '/start/', '/contact/', '/menopause/']) {
      const html = await (await request.get(route)).text();
      for (const match of html.matchAll(/href="(https?:\/\/[^"]*glossgenius[^"]*)"/gi)) {
        total += 1;
        expect(new URL(match[1]).host, route).toBe('vivawellnessco.glossgenius.com');
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  test('internal links on every public page resolve', async ({ request }) => {
    const internalTargets = new Set();
    for (const route of PUBLIC_PAGES) {
      const html = await (await request.get(route)).text();
      for (const match of html.matchAll(/<a\b[^>]*\bhref=(["'])(.*?)\1/gi)) {
        const href = match[2];
        if (!href || href.startsWith('#') || /^(?:mailto:|tel:)/i.test(href)) continue;
        const target = new URL(href, 'https://vivawellnessco.com');
        if (target.origin !== 'https://vivawellnessco.com') continue;
        internalTargets.add(`${target.pathname}${target.search}`);
      }
    }

    for (const target of internalTargets) {
      const response = await request.get(target);
      expect(response.status(), target).toBeLessThan(400);
    }
  });
});
