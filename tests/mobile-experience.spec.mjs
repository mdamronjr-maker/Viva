import { test, expect } from '@playwright/test';
import { attachScreenshot } from './helpers/visual-evidence.mjs';

const PUBLIC_PAGES = [
  '/', '/about/', '/services/', '/weight-management/', '/testosterone/',
  '/menopause/', '/peptide-therapy/', '/recovery/', '/partners/', '/blog/',
  '/blog/concierge-telehealth-explained/', '/blog/glp-1-weight-loss-austin/',
  '/blog/perimenopause-starts-earlier/', '/blog/the-parent-tax/',
  '/blog/tirzepatide-vs-semaglutide/', '/contact/', '/start/', '/privacy/',
  '/terms/', '/notice/', '/accessibility/', '/unsubscribe/',
];

async function blockExternal(page) {
  await page.route(/^(?!http:\/\/(?:localhost|127\.0\.0\.1):4173)/, (route) => route.abort());
}

// Choose an actual reading viewport with no usable booking link and no footer.
// Its position comes from settled content geometry, independent of the sticky
// controller, so a broken controller cannot make the test choose an easier pass.
async function scrollToReadingRegion(page, route = '/') {
  await expect(page.locator('.site-header')).toHaveAttribute('data-menu-ready', 'true');
  await expect(page.locator('.msc')).toHaveAttribute('data-sticky-ready', 'true');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const selectors = {
    '/': '.care-paths',
    '/services/': '#plans',
    '/blog/': '.post-list',
    '/start/': '.start-steps',
  };
  const region = page.locator(selectors[route]).first();
  const selection = await region.evaluate((element) => {
    const regionBox = element.getBoundingClientRect();
    const height = window.visualViewport?.height ?? window.innerHeight;
    const headerHeight = document.querySelector('.site-header').getBoundingClientRect().height;
    const footerTop = document.querySelector('.site-footer').getBoundingClientRect().top + window.scrollY;
    const links = [...document.querySelectorAll('main a[href]')].filter((link) => {
      const url = new URL(link.href);
      return (url.origin === location.origin && /^\/start\/?$/.test(url.pathname)) || url.hostname === 'vivawellnessco.glossgenius.com';
    }).flatMap((link) => {
      const box = link.getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(link).visibility === 'hidden' || link.closest('[hidden]')) return [];
      return [{ label: link.textContent.trim(), top: box.top + scrollY, bottom: box.bottom + scrollY }];
    });
    const first = Math.max(600, regionBox.top + scrollY - headerHeight - 24);
    const last = Math.min(regionBox.bottom + scrollY - headerHeight - 80, footerTop - height - 96);
    let target = null;
    for (let candidate = first; candidate <= last; candidate += 80) {
      if (!links.some((link) => link.top >= candidate + headerHeight && link.bottom <= candidate + height)) {
        target = candidate;
        break;
      }
    }
    if (target !== null) window.scrollTo({ top: target, behavior: 'instant' });
    return { target, first, last, footerTop, height, headerHeight, links };
  });
  expect(selection.target, `${route}: no uncontested reading viewport: ${JSON.stringify(selection)}`).not.toBeNull();
  await expect.poll(async () => Math.abs(await page.evaluate(() => window.scrollY) - selection.target), { message: `${route}: selected reading position (≤1 CSS pixel rounding)` }).toBeLessThanOrEqual(1);
  await expect(region).toBeVisible();
  return `${route}: ${JSON.stringify(selection)}`;
}

async function stickyDiagnostics(page) {
  return page.evaluate(() => ({
    url: location.pathname,
    scrollY,
    viewport: { width: innerWidth, height: innerHeight, visualHeight: visualViewport?.height, offsetTop: visualViewport?.offsetTop },
    bodyClass: document.body.className,
    focused: document.activeElement?.tagName,
    modal: document.querySelector('dialog[open], [aria-modal="true"]:not([hidden]):not([aria-hidden="true"])')?.outerHTML.slice(0, 300),
    footer: document.querySelector('.site-footer')?.getBoundingClientRect().toJSON(),
    actions: [...document.querySelectorAll('main a[href]')].filter((link) => link.href.includes('/start/') || link.href.includes('glossgenius.com')).map((link) => ({ text: link.textContent.trim(), rect: link.getBoundingClientRect().toJSON(), visibility: getComputedStyle(link).visibility })),
  }));
}

test.describe('mobile experience contracts', () => {
  test('every public page fits the narrowest supported phone', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await blockExternal(page);

    for (const viewport of [
      { width: 320, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const route of PUBLIC_PAGES) {
        await page.goto(route);
        const geometry = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          h1Right: document.querySelector('h1')?.getBoundingClientRect().right ?? 0,
          overflow: [...document.body.querySelectorAll('*')].flatMap((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || rect.right <= document.documentElement.clientWidth + 1) return [];
            return [`${element.tagName.toLowerCase()}.${[...element.classList].join('.')}: ${Math.round(rect.left)}..${Math.round(rect.right)}`];
          }).slice(0, 8),
        }));
        expect(geometry.scrollWidth, `${route} at ${viewport.width}px; ${geometry.overflow.join(', ')}`).toBeLessThanOrEqual(geometry.clientWidth + 1);
        expect(geometry.h1Right, `${route} h1 at ${viewport.width}px`).toBeLessThanOrEqual(geometry.clientWidth + 1);
        if (['/', '/services/', '/weight-management/', '/start/', '/blog/the-parent-tax/'].includes(route)) {
          const label = route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replaceAll('/', '-');
          await attachScreenshot(page, testInfo, `${label}-${viewport.width}x${viewport.height}-full`, { fullPage: true });
          await page.locator('.site-footer').evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
          if (await page.locator('.msc').count()) await expect(page.locator('.msc')).toHaveAttribute('aria-hidden', 'true');
          await attachScreenshot(page, testInfo, `${label}-${viewport.width}x${viewport.height}-footer`);
        }
      }
    }
  });

  test('sticky actions wait for intent and clear navigation and footer content', async ({ page }) => {
    await blockExternal(page);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ['/', '/services/', '/blog/', '/start/']) {
      await page.goto(route);
      const bar = page.locator('.msc');
      await expect(bar).toHaveAttribute('aria-hidden', 'true');
      await expect(bar).toHaveAttribute('inert', '');

      const readingPosition = await scrollToReadingRegion(page, route);
      await expect(bar, `${readingPosition}; actual=${JSON.stringify(await stickyDiagnostics(page))}`).toHaveClass(/is-visible/);
      await expect(bar).toHaveAttribute('aria-hidden', 'false');
      await expect(bar).not.toHaveAttribute('inert', '');

      for (const link of await bar.locator('a').all()) {
        const box = await link.boundingBox();
        expect(box?.height, `${route} sticky target height`).toBeGreaterThanOrEqual(48);
      }
      const barBox = await bar.boundingBox();
      expect(barBox?.y, `${route} sticky bar remains bottom anchored`).toBeGreaterThan(844 * 0.75);
      await expect.poll(async () => {
        const settledBox = await bar.boundingBox();
        return Math.round((settledBox?.y ?? 0) + (settledBox?.height ?? 0));
      }, { message: `${route} sticky bar settles against the viewport bottom` }).toBeLessThanOrEqual(845);

      await page.locator('.site-footer').scrollIntoViewIfNeeded();
      await expect(bar).not.toHaveClass(/is-visible/);
      await expect(bar).toHaveAttribute('inert', '');
    }

    await page.goto('/');
    const bar = page.locator('.msc');
    await scrollToReadingRegion(page);
    await expect(bar).toHaveClass(/is-visible/);
    await page.locator('.nav-toggle').click();
    await expect(bar).toHaveAttribute('aria-hidden', 'true');
    await expect(bar).toHaveAttribute('inert', '');
  });

  test('returning from the page bottom never leaks a booking action above the header', async ({ page }) => {
    await blockExternal(page);

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 667 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');

      const drawer = page.locator('.site-mobile-nav');
      const sticky = page.locator('.msc');

      await expect(drawer).toHaveAttribute('inert', '');
      await expect(drawer).toHaveCSS('visibility', 'hidden');

      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await expect(sticky).toHaveAttribute('aria-hidden', 'true');

      // Leave the footer so the legitimate bottom action can return, then
      // continue to the top exactly as reported on iOS Safari.
      await scrollToReadingRegion(page);
      await expect(sticky).toHaveClass(/is-visible/);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await expect(sticky).not.toHaveClass(/is-visible/);
      await expect(sticky).toHaveAttribute('aria-hidden', 'true');

      // Simulate Safari expanding its toolbar near the top, which shortens
      // the visual viewport and exposed the old translated drawer.
      await page.setViewportSize({ width: viewport.width, height: Math.max(500, viewport.height - 120) });
      await expect(drawer).toHaveCSS('visibility', 'hidden');

      const leaked = await page.evaluate(() => {
        const selectors = ['.nav__cta', '.site-mobile-nav', '.mobile-cta', '.msc'];
        const topBand = [1, 8, 16, 32, 48];
        return topBand.flatMap((y) => document.elementsFromPoint(window.innerWidth / 2, y))
          .filter((element, index, all) => all.indexOf(element) === index)
          .filter((element) => selectors.some((selector) => element.matches(selector)))
          .map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`);
      });
      expect(leaked, `${viewport.width}x${viewport.height} controls in top safe area`).toEqual([]);
    }
  });

  test('homepage hero stays compact and the collapsed header never leaks its desktop CTA', async ({ page }, testInfo) => {
    await blockExternal(page);

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 600, height: 900 },
      { width: 900, height: 700 },
      { width: 844, height: 390 },
      { width: 1120, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');

      const toggleDisplay = await page.locator('.nav-toggle').evaluate((el) => getComputedStyle(el).display);
      const desktopCtaDisplay = await page.locator('.nav__cta').evaluate((el) => getComputedStyle(el).display);
      expect(toggleDisplay, `${viewport.width}px menu toggle`).not.toBe('none');
      expect(desktopCtaDisplay, `${viewport.width}px desktop header CTA`).toBe('none');
      if (viewport.width === 844 || viewport.width === 1120) {
        const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        expect(width.scroll, `${viewport.width}x${viewport.height} page width`).toBeLessThanOrEqual(width.client + 1);
        await attachScreenshot(page, testInfo, `home-${viewport.width}x${viewport.height}-header`);
      }

      // The compact hero contract applies to phone layouts. Wider collapsed
      // headers are included above solely to enforce the CTA/hamburger
      // invariant without turning this into a tablet hero redesign test.
      if (viewport.width <= 600) {
        const heroCta = await page.locator('.hero__ctas').boundingBox();
        const heroMedia = await page.locator('.hero__media').boundingBox();
        expect(heroCta?.y, `${viewport.width}px primary action position`).toBeLessThan(viewport.height * 0.75);
        expect(heroMedia?.y, `${viewport.width}px founder portrait position`).toBeLessThan(viewport.height);
      }
    }
  });

  test('compact interactive controls retain comfortable touch targets', async ({ page }) => {
    await blockExternal(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/');
    const dots = page.locator('.t-dot');
    await expect(dots).toHaveCount(6);
    for (const dot of await dots.all()) {
      const box = await dot.boundingBox();
      expect(box?.height, 'testimonial selector height').toBeGreaterThanOrEqual(44);
    }

    await page.goto('/contact/');
    const consentBox = await page.locator('.contact-consent').boundingBox();
    expect(consentBox?.height, 'marketing consent label height').toBeGreaterThanOrEqual(44);

    await page.goto('/partners/');
    for (const link of await page.locator('#viva-perks .perk-link').all()) {
      const box = await link.boundingBox();
      expect(box?.height, 'partner perk link height').toBeGreaterThanOrEqual(48);
    }
  });
});
