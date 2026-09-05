// Review evidence from the controlled, public-content preview only. These
// captures use CSS pixels and browser emulation; they are not device photos.
export async function attachScreenshot(page, testInfo, name, options = {}) {
  await page.evaluate(() => document.fonts.ready);
  await testInfo.attach(`${name}-${testInfo.project.name}`, {
    body: await page.screenshot({ scale: 'css', animations: 'disabled', ...options }),
    contentType: 'image/png',
  });
}
