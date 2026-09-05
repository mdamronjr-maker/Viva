import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

const routes = [
  '/', '/about/', '/services/', '/weight-management/', '/testosterone/',
  '/menopause/', '/peptide-therapy/', '/recovery/', '/partners/', '/blog/',
  '/blog/concierge-telehealth-explained/', '/blog/glp-1-weight-loss-austin/',
  '/blog/perimenopause-starts-earlier/', '/blog/the-parent-tax/',
  '/blog/tirzepatide-vs-semaglutide/', '/contact/', '/start/', '/privacy/',
  '/terms/', '/notice/', '/accessibility/', '/unsubscribe/', '/contact/received/',
];

test('every public page passes automated WCAG 2.2 AA checks', async ({ page }) => {
  await page.route(/^(?!http:\/\/(?:localhost|127\.0\.0\.1):4173)/, (route) => route.abort());
  const failures = [];

  for (const route of routes) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    for (const violation of results.violations) {
      const nodes = [];
      for (const node of violation.nodes) {
        const selector = node.target.join(' ');
        nodes.push({
          target: node.target,
          box: await page.locator(selector).boundingBox(),
          computed: await page.locator(selector).evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              display: style.display,
              width: style.width,
              minWidth: style.minWidth,
              height: style.height,
              flex: style.flex,
              className: element.className,
              outerHTML: element.outerHTML,
            };
          }),
          summary: node.failureSummary,
        });
      }
      failures.push({
        route,
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes,
      });
    }
  }

  expect(failures).toEqual([]);
});
