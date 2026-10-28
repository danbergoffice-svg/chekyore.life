// Дары за вход: после первой жизни — календарь на итогах, дар дня 1 (страна по выбору) выбирается у барабана;
// следующие дни имитируем, сдвигая дату последнего дара в prefs. Защита выключена и год — 1 с, чтобы быстро дойти до смерти.
const { chromium, devices } = require('playwright');
const dir = process.env.SHOTS || 'shots';
async function firstLife(p) {
  await p.click('.spin-button'); await p.click('.spin-result .primary'); await p.waitForSelector('.reveal'); await p.click('.reveal .primary');
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    if (await p.$('.summary, .early-death')) break;
    if (await p.$('.dream-modal')) {
      for (const inp of await p.$$('.dream-modal input')) await inp.fill('10').catch(() => {});
      const pick = await p.$('.dream-pick button, .dream-order-btns button'); if (pick) await pick.click({ timeout: 500 }).catch(() => {});
      await p.click('.dream-modal .primary:not([disabled])', { timeout: 800 }).catch(() => {}); continue;
    }
    if (await p.$('.modal')) {
      if (await p.$('.outcome')) { await p.click('.outcome .primary', { timeout: 1000 }).catch(() => {}); continue; }
      const opts = await p.$$('.choices .choice:not([disabled]), .choices .primary, .modal .primary');
      if (opts.length) await opts[0].click({ timeout: 1000 }).catch(() => {}); continue;
    }
    if (await p.$('.death, .screen.dead')) await p.click('.screen .primary', { timeout: 500 }).catch(() => {});
    await p.click('.speed .chip:last-child', { timeout: 300 }).catch(() => {});
    await p.waitForTimeout(20);
  }
  for (let i = 0; i < 5 && !(await p.$('.summary')); i++) { await p.click('.screen .primary').catch(() => {}); await p.waitForTimeout(300) }
}
const text = (p, sel) => p.$eval(sel, (e) => e.innerText.replace(/\n+/g, ' / ')).catch(() => 'НЕТ');
const prefs = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('thousands.prefs') || '{}'));
/** Будто вчера был получен дар дня day: перезагрузить меню. */
async function asIfYesterday(p, day, gifts = []) {
  await p.evaluate(([day, gifts]) => {
    const d = new Date(Date.now() - 86400000), pad = (n) => String(n).padStart(2, '0');
    const prefs = JSON.parse(localStorage.getItem('thousands.prefs') || '{}');
    prefs.daily = { last: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, day };
    prefs.gifts = gifts;
    delete prefs.dailyShown; // «новый день»: панель «Дары» снова может открыться сама
    localStorage.setItem('thousands.prefs', JSON.stringify(prefs));
  }, [day, gifts]);
  await p.reload(); await p.waitForSelector('.menu .slot-machine'); await p.waitForTimeout(800);
}
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ru-RU', reducedMotion: 'reduce' });
  await ctx.route(/\/flags\.json/, async (r) => { const f = await (await r.fetch()).json(); r.fulfill({ json: { ...f, protected_lives: 0, year_sec_child: 1, year_sec: 1 } }) });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5174/?ab=a'); await p.waitForSelector('.menu .slot-machine'); await p.waitForTimeout(800);
  console.log('новичок | календаря и «Даров» нет:', !(await p.$('.daily-card')) && !(await p.$('.gifts-btn')));
  await firstLife(p);
  await p.waitForTimeout(1000);
  console.log('итоги 1-й жизни | календарь:', await text(p, '.summary .daily-card'));
  const card = await p.$('.summary .daily-card'); if (card) { await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: `${dir}/daily-card.png` }) }
  await p.click('.summary .daily-card .primary');
  await p.waitForTimeout(300);
  console.log('после «Забрать» | тост:', await text(p, '.toast'), '| карточка:', await text(p, '.summary .daily-card p:last-child'));
  await p.locator('.summary button', { hasText: /Родиться снова/ }).first().click();
  await p.waitForSelector('.menu .slot-machine'); await p.waitForTimeout(300);
  console.log('меню | кнопка «Дары»:', await text(p, '.gifts-btn'));
  await p.click('.gifts-btn'); await p.waitForSelector('.sheet');
  await p.click('.sheet-pick'); await p.waitForSelector('#country-title');
  await p.locator('.modal button', { hasText: /Япония/ }).first().click();
  await p.waitForTimeout(300);
  console.log('меню | ярлык на барабане:', await p.$$eval('.reel-tag', (els) => els.map((e) => e.innerText).join(' ')));
  await p.click('.spin-button'); await p.waitForSelector('.spin-result');
  console.log('результат:', await text(p, '.spin-result .lead'));
  await p.click('.spin-result .primary'); await p.waitForSelector('.reveal');
  console.log('дары потрачены:', JSON.stringify((await prefs(p)).gifts));
  // День 4 — знатная семья: кнопка над барабаном, барабан перезаряжается.
  await p.setViewportSize({ width: 375, height: 667 });
  await asIfYesterday(p, 3);
  console.log('день 4 | панель открылась сама:', !!(await p.$('.sheet')), '|', await text(p, '.sheet .daily-card .primary'));
  const spin = await p.$('.spin-button'); const box = await spin.boundingBox();
  console.log('день 4 | «Крути» на первом экране (iPhone SE):', box.y + box.height <= 667, Math.round(box.y + box.height));
  await p.screenshot({ path: `${dir}/daily-menu.png` });
  await p.setViewportSize({ width: 360, height: 640 }); await p.waitForTimeout(300);
  const box2 = await (await p.$('.spin-button')).boundingBox();
  console.log('день 4 | «Крути» на первом экране (360×640):', box2.y + box2.height <= 640, Math.round(box2.y + box2.height));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.click('.sheet .daily-card .primary'); await p.waitForTimeout(400);
  console.log('день 4 | в панели:', await text(p, '.sheet .daily-card p:last-child'));
  await p.click('.sheet-done'); await p.waitForTimeout(400);
  console.log('день 4 | ярлык на барабане:', await p.$$eval('.reel-tag', (els) => els.map((e) => e.innerText).join(' ')));
  await p.click('.spin-button'); await p.waitForSelector('.spin-result');
  console.log('день 4 | результат:', await text(p, '.spin-result .lead'));
  // День 7 — царская семья, с ним же ждёт здоровье.
  await asIfYesterday(p, 6, ['health']);
  await p.click('.sheet .daily-card .primary'); await p.waitForTimeout(400);
  console.log('день 7 | в панели:', await text(p, '.sheet-sec h3'), '|', await text(p, '.sheet-gifts'));
  await p.click('.sheet-done'); await p.waitForTimeout(400);
  console.log('день 7 | ярлык на барабане:', await p.$$eval('.reel-tag', (els) => els.map((e) => e.innerText).join(' ')));
  await p.click('.spin-button'); await p.waitForSelector('.spin-result');
  console.log('день 7 | результат:', await text(p, '.spin-result .lead'));
  await p.screenshot({ path: `${dir}/daily-royal.png` });
  await p.click('.spin-result .primary'); await p.waitForSelector('.reveal');
  console.log('день 7 | сословие:', await p.$eval('.reveal .facts', (e) => e.innerText.split('\n').slice(6, 8).join(': ')), '| осталось даров:', JSON.stringify((await prefs(p)).gifts));
  // Пропуск дня — серия сначала.
  await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('thousands.prefs')); x.daily = { last: '2026-01-01', day: 5 }; delete x.dailyShown; localStorage.setItem('thousands.prefs', JSON.stringify(x)) });
  await p.reload(); await p.waitForSelector('.menu .slot-machine'); await p.waitForTimeout(800);
  console.log('пропуск | панель:', await text(p, '.sheet .daily-card .primary'), '|', await text(p, '.sheet .daily-card .muted'));
  console.log({ errors: errs.slice(0, 3) });
  await b.close();
})();
