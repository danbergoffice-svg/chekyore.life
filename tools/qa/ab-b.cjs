// Вариант b первого экрана: «Новая жизнь» в меню → экран лотереи → рывок → результат → семья. Плюс событие spin.
const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, locale: 'ru-RU', reducedMotion: 'reduce', deviceScaleFactor: 2 });
  const sent = [];
  await ctx.route(/\/api\/events/, async (r) => { sent.push(r.request().postData() || ''); r.fulfill({ status: 204, body: '' }) });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.BASE || 'http://localhost:5174') + '/?ab=b'); await p.waitForSelector('.menu .title-block');
  console.log('барабана в меню нет:', !(await p.$('.menu .slot-machine')), '| кнопка:', await p.$eval('.menu .stack .primary', e => e.innerText));
  await p.click('.menu .stack .primary');
  await p.waitForSelector('.spin-screen .slot-machine');
  console.log('экран лотереи:', await p.$eval('.spin-screen h1', e => e.innerText));
  await p.screenshot({ path: `${dir}/ab-b-spin.png` });
  await p.click('.spin-button');
  await p.waitForSelector('.spin-result .primary:not([disabled])', { timeout: 15000 });
  await p.click('.spin-result .primary');
  await p.waitForSelector('.reveal');
  // Очередь событий уходит на приёмник раз в 10 секунд.
  await p.waitForTimeout(11000);
  const all = sent.join('\n');
  console.log('событие spin ушло:', /"name":"spin"/.test(all), '| ab=b в событиях:', /"ab":"b"/.test(all), '| life_start:', /"name":"life_start"/.test(all));
  console.log({ errors: errs.slice(0, 5) });
  await b.close();
})();
