const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5174/?ab=a'); await p.waitForSelector('.menu .slot-machine');
  await p.click('.spin-button'); await p.click('.spin-result .primary'); await p.waitForSelector('.reveal'); await p.click('.reveal .primary');
  await p.waitForSelector('.speed-bar');
  for (const tab of ['Герой', 'Люди', 'Дневник']) {
    await p.locator('.tabs .tab', { hasText: tab }).click(); await p.waitForTimeout(200);
    const bar = await p.$('.speed-bar');
    console.log(tab, '| панель скорости видна:', !!bar && await bar.isVisible());
  }
  // Пауза на вкладке «Дневник»: год не движется.
  await p.click('.speed .chip:first-child'); await p.waitForTimeout(300);
  const w1 = await p.$eval('.year-fill', e => e.style.width); await p.waitForTimeout(2500);
  const w2 = await p.$eval('.year-fill', e => e.style.width);
  console.log('пауза на «Дневнике»: год стоит:', w1 === w2, w1, w2, '| надпись:', await p.$eval('.paused-note', e => e.innerText).catch(() => 'НЕТ'));
  await p.screenshot({ path: 'shots/tabs-diary.png' });
  console.log({ errors: errs.slice(0, 3) });
  await b.close();
})();
