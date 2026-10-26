const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  for (const lang of ['ru', 'en']) {
    await p.goto(`http://localhost:5174/tools/og.html?lang=${lang}`);
    await p.waitForSelector('body[data-ready]', { timeout: 20000 });
    await (await p.$('#c')).screenshot({ path: `public/og-${lang}.png` });
  }
  await b.close();
})();
