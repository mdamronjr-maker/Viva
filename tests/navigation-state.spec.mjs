import { test, expect } from '@playwright/test';

async function openLocal(page, path = '/') {
  await page.route(/^(?!http:\/\/(?:localhost|127\.0\.0\.1):4173)/, (route) => route.abort());
  await page.goto(path);
}

async function expectClosedMenu(page) {
  await expect(page.locator('.nav-toggle')).toHaveAttribute('aria-label', 'Open menu');
  await expect(page.locator('.nav-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#site-mobile-nav')).toHaveAttribute('inert', '');
  await expect(page.locator('#site-mobile-nav')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await expect(page.locator('.site-footer')).not.toHaveAttribute('inert', '');
  await expect(page.locator('body')).not.toHaveClass(/menu-open/);
}

test.describe('navigation lifecycle and single booking action', () => {
  test('mobile toggle aligns to the content edge and Escape restores focus, name and scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLocal(page, '/services/');
    const geometry = await page.locator('.site-header__inner').evaluate((element) => {
      const parent = element.getBoundingClientRect();
      const toggle = element.querySelector('.nav-toggle').getBoundingClientRect();
      return { rightGap: parent.right - toggle.right, padding: parseFloat(getComputedStyle(element).paddingRight) };
    });
    expect(Math.abs(geometry.rightGap - geometry.padding)).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo({ top: 450, behavior: 'instant' }));
    await page.locator('.nav-toggle').click();
    await expect(page.locator('main')).toHaveAttribute('inert', '');
    await expect(page.locator('body')).toHaveCSS('position', 'fixed');
    await page.keyboard.press('Escape');
    await expectClosedMenu(page);
    await expect(page.locator('.nav-toggle')).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(450);
  });

  test('an open menu cannot leave the desktop or restored page inert', async ({ page }) => {
    await page.setViewportSize({ width: 1120, height: 800 });
    await openLocal(page);
    await page.locator('.nav-toggle').click();
    await page.setViewportSize({ width: 1121, height: 800 });
    await expectClosedMenu(page);
    await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
    await expect(page.locator('.care-nav summary')).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.nav-toggle').click();
    await page.locator('#site-mobile-nav a[href="/about/"]').click();
    await expect(page).toHaveURL(/\/about\/$/);
    await expectClosedMenu(page);
    await page.goBack();
    await expectClosedMenu(page);
  });

  test('Care links expose each distinct destination and keyboard disclosure closes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLocal(page);
    const care = page.locator('.care-nav');
    await care.locator('summary').click();
    for (const path of ['/weight-management/', '/menopause/', '/testosterone/', '/peptide-therapy/', '/recovery/']) {
      await expect(care.locator(`a[href="${path}"]`)).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(care).not.toHaveAttribute('open', '');
    await expect(care.locator('summary')).toBeFocused();
  });

  test('an inline booking button replaces the sticky action while it is usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLocal(page, '/services/');
    const inline = page.locator('.prog-card__action .btn').first();
    await inline.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(inline).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(540);
    await expect(page.locator('.msc')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.msc')).toHaveAttribute('inert', '');
  });

  test('closing section, footer and utilities do not compete with sticky booking', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLocal(page);
    const bar = page.locator('.msc');
    await expect(bar.locator('a')).toHaveCount(1);
    await expect(bar).toHaveAttribute('inert', '');
    await page.locator('main [data-final-cta] a[href^="/start/"]').last().evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(bar).toHaveAttribute('aria-hidden', 'true');
    await expect(bar).toHaveAttribute('inert', '');
    await expect(page.locator('.site-footer .btn, .footer-brand__line')).toHaveCount(0);
    await page.locator('.site-footer').scrollIntoViewIfNeeded();
    await expect(bar).toHaveAttribute('aria-hidden', 'true');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(bar).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#site-mobile-nav')).toHaveCSS('visibility', 'hidden');
    for (const path of ['/notice/', '/accessibility/', '/privacy/', '/terms/', '/contact/', '/contact/received/', '/unsubscribe/', '/404/']) {
      await page.goto(path);
      await expect(page.locator('.msc')).toHaveCount(0);
    }
  });
});

// The optional chooser must remain operable without a pointer.
test('quiz focus mode traps visible controls and restores focus on exit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLocal(page);
  await page.locator('.qx__opt[data-q="goal"][data-v="weight"]').click();
  await expect(page.locator('#quiz')).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#quiz')).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.skip-link')).toHaveAttribute('inert', '');
  await page.locator('#qx-exit').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.qx__step[data-step="2"] .qx__opt').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#quiz')).not.toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.skip-link')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#qx-q2')).toBeFocused();
});

test('essential mobile pages reflow at doubled text size', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLocal(page);
  for (const route of ['/', '/services/', '/start/', '/weight-management/', '/contact/']) {
    await page.goto(route);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(size.scroll, route).toBeLessThanOrEqual(size.client + 1);
    await page.locator('.nav-toggle').click();
    await expect(page.locator('#site-mobile-nav')).toHaveAttribute('aria-hidden', 'false');
    await page.keyboard.press('Escape');
    await expectClosedMenu(page);
  }
});
