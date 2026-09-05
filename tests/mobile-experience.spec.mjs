import { test, expect } from '@playwright/test';

const PUBLIC_PAGES = [
  '/', '/about/', '/services/', '/weight-management/', '/testosterone/',
  '/menopause/', '/recovery/', '/partners/', '/blog/',
  '/blog/concierge-telehealth-explained/', '/blog/glp-1-weight-loss-austin/',
  '/blog/perimenopause-starts-earlier/', '/blog/the-parent-tax/',
  '/blog/tirzepatide-vs-semaglutide/', '/contact/', '/start/', '/privacy/',
  '/terms/', '/notice/', '/accessibility/', '/unsubscribe/',
];

async function blockExternal(page) {
  await page.route(/^(?!http:\/\/(?:localhost|127\.0\.0\.1):4173)/, (route) => route.abort());
}

test.describe('mobile experience contracts', () => {
  test('every public page fits the narrowest supported phone', async ({ page }) => {
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

      await page.evaluate(() => window.scrollTo(0, 650));
      await expect(bar).toHaveClass(/is-visible/);
      await expect(bar).toHaveAttribute('aria-hidden', 'false');
      await expect(bar).not.toHaveAttribute('inert', '');

      for (const link of await bar.locator('a').all()) {
        const box = await link.boundingBox();
        expect(box?.height, `${route} sticky target height`).toBeGreaterThanOrEqual(48);
      }

      await page.locator('.site-footer').scrollIntoViewIfNeeded();
      await expect(bar).not.toHaveClass(/is-visible/);
      await expect(bar).toHaveAttribute('inert', '');
    }

    await page.goto('/');
    const bar = page.locator('.msc');
    await page.evaluate(() => window.scrollTo(0, 650));
    await expect(bar).toHaveClass(/is-visible/);
    await page.locator('.nav-toggle').click();
    await expect(bar).toHaveAttribute('aria-hidden', 'true');
    await expect(bar).toHaveAttribute('inert', '');
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
  });
});
