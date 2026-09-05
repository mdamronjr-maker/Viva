// Deterministic release budgets for the local production build. These are
// regression guards, not substitutes for CrUX/RUM field Core Web Vitals.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from '@playwright/test';

const DIST = resolve(process.cwd(), 'dist');

function localAssetRefs(html, extension) {
  const pattern = new RegExp(`/_astro/[^"'\\s>]+\\.${extension}`, 'g');
  return [...new Set(html.match(pattern) ?? [])];
}

function byteTotal(refs) {
  return refs.reduce((total, ref) => total + statSync(resolve(DIST, ref.slice(1))).size, 0);
}

test('home production assets remain inside first-party release budgets', () => {
  const html = readFileSync(resolve(DIST, 'index.html'), 'utf8');
  const cssBytes = byteTotal(localAssetRefs(html, 'css'));
  const jsBytes = byteTotal(localAssetRefs(html, 'js'));

  // Raw transfer-independent ceilings leave measured headroom while still
  // catching an accidental framework, animation, or stylesheet payload jump.
  expect(cssBytes, `home CSS: ${cssBytes} bytes`).toBeLessThanOrEqual(64 * 1024);
  expect(jsBytes, `home JavaScript: ${jsBytes} bytes`).toBeLessThanOrEqual(32 * 1024);

  expect(statSync(resolve(process.cwd(), 'public/liliana-founder-portrait-sm.webp')).size)
    .toBeLessThanOrEqual(80 * 1024);
  expect(statSync(resolve(process.cwd(), 'public/liliana-founder-portrait.webp')).size)
    .toBeLessThanOrEqual(120 * 1024);
});

test('home has no material local-preview layout shift', async ({ page }) => {
  await page.addInitScript(() => {
    window.__vivaCls = 0;
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        if (!entry.hadRecentInput) window.__vivaCls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.route(/^(?!http:\/\/(?:localhost|127\.0\.0\.1):4173)/, (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);

  const cls = await page.evaluate(() => window.__vivaCls);
  expect(cls, `local CLS smoke value: ${cls}`).toBeLessThan(0.1);
});
