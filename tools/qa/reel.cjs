const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
(async () => {
  const b = await chromium.launch();
  for (const w of [360, 390, 430]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, locale: 'ru-RU', deviceScaleFactor: 2 });
    await ctx.route(/fonts\.(googleapis|gstatic)|mc\.yandex/, r => r.abort());
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()) });
    await p.goto('http://localhost:5174/'); await p.waitForSelector('.menu');
    await p.click('.menu .stack .primary');
    if (await p.$('.screen > .primary')) await p.click('.screen > .primary');
    await p.waitForSelector('.lever:not([disabled])');
    await p.click('.lever');
    await p.waitForTimeout(1500);
    await (await p.$('.slot-machine')).screenshot({ path: `${dir}/reel-${w}-spin.png` });
    await p.waitForSelector('.spin-result', { timeout: 8000 });
    await p.waitForTimeout(400);
    await (await p.$('.slot-machine')).screenshot({ path: `${dir}/reel-${w}-done.png` });
    console.log(w, errs.slice(0, 3));
    await ctx.close();
  }
  await b.close();
})();
