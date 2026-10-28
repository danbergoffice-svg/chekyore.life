// Этап 1 ТЗ: путь до начала жизни, справки, фокус года, итоги с липкой панелью — на 390×844.
const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce', deviceScaleFactor: 2 });
  await ctx.route(/fonts\.(googleapis|gstatic)|mc\.yandex/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()) });
  await p.goto('http://localhost:5174/?ab=a'); await p.waitForSelector('.menu');
  let taps = 0;
  await p.waitForSelector('.lever:not([disabled])', { timeout: 15000 });
  console.log('setup link in first life:', !!(await p.$('text=Настроить жизнь')));
  await p.click('.lever'); taps++;
  await p.waitForSelector('.spin-result', { timeout: 10000 });
  await p.click('.spin-result .primary'); taps++;
  await p.waitForSelector('.reveal');
  console.log('taps to «Начать жизнь»:', taps, await p.$eval('.reveal .primary', e => e.innerText));
  await p.click('.reveal .primary');
  await p.click('.speed .chip:nth-child(4)').catch(() => {});
  const t0 = Date.now(); let shot = 0;
  while (Date.now() - t0 < 240000) {
    if (await p.$('.summary')) break;
    if (await p.$('.modal')) {
      if (await p.$('.outcome')) { await p.click('.outcome .primary', { timeout: 1000 }).catch(() => {}); continue; }
      const opts = await p.$$('.choices .choice:not([disabled]), .choices .primary');
      if (opts.length) await opts[0].click({ timeout: 1000 }).catch(() => {});
      continue;
    }
    const ageText = await p.$eval('.hero-bar', e => e.innerText).catch(() => '');
    const age = +((ageText.match(/(\d+)\s+(?:год|лет)/) || [])[1] || 0);
    if (shot === 0 && age >= 2) {
      await p.click('.speed .chip:nth-child(1)').catch(() => {});
      await p.screenshot({ path: `${dir}/u-age2.png`, fullPage: true });
      console.log('page height at age 2:', await p.evaluate(() => document.documentElement.scrollHeight));
      shot = 1
    }
    if (shot === 1 && age >= 8 && !(await p.$('.modal'))) {
      await p.click('.speed .chip:nth-child(1)').catch(() => {});
      await p.click('.focus-panel .help', { timeout: 2000 }).catch(() => {});
      const fp = await p.$('.focus-panel');
      if (fp) await fp.screenshot({ path: `${dir}/u-focus.png` });
      shot = 2
    }
    await p.click('.speed .chip:last-child', { timeout: 300 }).catch(() => {});
    await p.waitForTimeout(15);
  }
  if (await p.$('.death, .screen .primary')) {
    // Экран смерти → итоги
    for (let i = 0; i < 5 && !(await p.$('.summary')); i++) { await p.click('.screen .primary').catch(() => {}); await p.waitForTimeout(300) }
  }
  if (await p.$('.summary')) {
    await p.screenshot({ path: `${dir}/u-summary-top.png` });
    await p.mouse.wheel(0, 2500); await p.waitForTimeout(300);
    await p.screenshot({ path: `${dir}/u-summary-mid.png` });
    console.log('folds open:', await p.$$eval('details.fold', ds => ds.map(d => d.open)));
    console.log('sticky:', await p.$eval('.sticky-actions', e => e.innerText));
  }
  console.log({ errors: errs.slice(0, 5) });
  await b.close();
})();
