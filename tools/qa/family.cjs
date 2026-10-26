// Одна жизнь: снимки сцены дома в разные годы и окна событий; проверка, что семья на картинке совпадает с вкладкой «Люди».
const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 380, height: 760 }, locale: 'ru-RU', reducedMotion: 'reduce', deviceScaleFactor: 2 });
  await ctx.route(/fonts\.(googleapis|gstatic)|mc\.yandex/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4173/'); await p.waitForSelector('.menu');
  await p.click('.menu .stack button:last-child');
  // Полная жизнь, мягкая смертность — чтобы успела вырасти семья.
  await p.click('text=Полная'); await p.click('text=Мягкая');
  await p.click('.screen > .primary');
  await p.waitForSelector('.lever:not([disabled])', { timeout: 15000 });
  await p.click('.lever');
  await p.waitForSelector('.spin-result', { timeout: 10000 });
  console.log(await p.$eval('.spin-result p', e => e.innerText));
  await p.click('.spin-result .primary');
  await p.click('.reveal .primary');
  await p.click('.speed .chip:nth-child(5)').catch(() => {});
  const shotAges = [3, 20, 32, 45, 60]; let next = 0; let events = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    if (await p.$('.summary')) break;
    if (await p.$('.modal')) {
      if (events < 4 && !(await p.$('.outcome'))) { await p.screenshot({ path: `${dir}/fam-ev${events}.png`, clip: { x: 0, y: 380, width: 380, height: 380 } }); events++; }
      if (await p.$('.outcome')) { await p.click('.outcome .primary', { timeout: 1000 }).catch(() => {}); continue; }
      const opts = await p.$$('.choices .choice:not([disabled]), .choices .primary');
      if (opts.length) await opts[0].click({ timeout: 1000 }).catch(() => {});
      continue;
    }
    const ageText = await p.$eval('.hero-bar', e => e.innerText).catch(() => '');
    const age = +((ageText.match(/(\d+)\s+(?:год|лет)/) || [])[1] || 0);
    if (next < shotAges.length && age >= shotAges[next]) {
      await p.click('.speed .chip:nth-child(1)').catch(() => {});
      if (!(await p.$('.modal'))) {
        await p.click('.tabs .tab:nth-child(2)').catch(() => {});
        const home = await p.$$eval('.panel p.small', ps => ps.map(x => x.innerText).join(' | ')).catch(() => '');
        await p.click('.tabs .tab:nth-child(3)').catch(() => {});
        const people = await p.$$eval('.people li', ls => ls.map(l => l.innerText.replace(/\n/g, ' ')).slice(0, 12)).catch(() => []);
        await p.click('.tabs .tab:nth-child(1)').catch(() => {});
        await p.screenshot({ path: `${dir}/fam-age${shotAges[next]}.png`, clip: { x: 0, y: 0, width: 380, height: 330 } });
        console.log(`--- age ${age}:`, home, '\n', people.join('\n '));
        next++;
      }
      await p.click('.speed .chip:nth-child(5)').catch(() => {});
      continue;
    }
    await p.click('.speed .chip:last-child', { timeout: 300 }).catch(() => {});
    await p.waitForTimeout(15);
  }
  console.log({ errors: errs.slice(0, 5), summary: !!(await p.$('.summary')) });
  await b.close();
})();
