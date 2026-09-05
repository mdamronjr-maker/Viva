import { test, expect } from '@playwright/test';

test('every public page meets WCAG AA rendered text contrast', async ({ page }) => {
  await page.route(/^(?!http:\/\/(?:localhost|127\.0\.0\.1):4173)/, (route) => route.abort());
  const failures = [];
  const routes = [
    '/', '/about/', '/services/', '/weight-management/', '/testosterone/',
    '/menopause/', '/peptide-therapy/', '/recovery/', '/partners/', '/blog/',
    '/blog/concierge-telehealth-explained/', '/blog/glp-1-weight-loss-austin/',
    '/blog/perimenopause-starts-earlier/', '/blog/the-parent-tax/',
    '/blog/tirzepatide-vs-semaglutide/', '/contact/', '/start/', '/privacy/',
    '/terms/', '/notice/', '/accessibility/', '/unsubscribe/',
  ];
  for (const route of routes) {
    await page.goto(route);
    const pageFailures = await page.evaluate(() => {
      const parse = (value) => {
        const match = value.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const parts = match[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
        return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
      };
      const over = (fg, bg) => {
        const a = fg.a + bg.a * (1 - fg.a);
        if (!a) return { r: 255, g: 255, b: 255, a: 1 };
        return {
          r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
          g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
          b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
          a,
        };
      };
      const luminance = ({ r, g, b }) => {
        const f = (v) => {
          const n = v / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a, b) => {
        const l1 = luminance(a);
        const l2 = luminance(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const background = (element) => {
        const chain = [];
        for (let node = element; node; node = node.parentElement) chain.unshift(node);
        let result = { r: 255, g: 255, b: 255, a: 1 };
        for (const node of chain) {
          const color = parse(getComputedStyle(node).backgroundColor);
          if (color && color.a > 0) result = over(color, result);
        }
        return result;
      };

      const found = [];
      for (const element of document.querySelectorAll('body *')) {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)) continue;
        if (!Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) continue;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (style.backgroundImage !== 'none') continue;
        const fgRaw = parse(style.color);
        if (!fgRaw) continue;
        const bg = background(element);
        const fg = over(fgRaw, bg);
        const score = ratio(fg, bg);
        const size = Number.parseFloat(style.fontSize);
        const weight = Number.parseInt(style.fontWeight, 10) || 400;
        const threshold = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
        if (score + 0.05 < threshold) {
          found.push({
            selector: element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`,
            text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 90),
            score: Number(score.toFixed(2)),
            threshold,
            color: style.color,
            background: style.backgroundColor,
            effectiveBackground: bg,
          });
        }
      }
      return found;
    });
    failures.push(...pageFailures.map((failure) => ({ route, ...failure })));
  }
  expect(failures).toEqual([]);
});
