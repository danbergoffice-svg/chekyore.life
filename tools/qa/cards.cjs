// Карточки «Поделиться» на настоящих жизнях: снимки стенда tools/cards.html (нужен `npx vite --port 5174`).
const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) });
  const qs = process.argv[2] || 'n=3&seed=100&ages=30';
  await p.goto(`http://localhost:5174/tools/cards.html?${qs}`);
  await p.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  const canvases = await p.$$('canvas');
  let i = 0;
  for (const c of canvases) {
    const data = await c.evaluate((el) => el.toDataURL('image/png'));
    require('fs').writeFileSync(`${dir}/card-${i++}.png`, Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log('карточек:', canvases.length, { errors: errs.slice(0, 5) });
  await b.close();
})();
