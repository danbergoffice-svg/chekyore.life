// «На главный экран»: после первой жизни — карточка. iPhone (Safari) — подсказка; Android — системное окно
// (событие beforeinstallprompt имитируем). Защита выключена и год — 1 с, чтобы быстро дойти до смерти.
// Награда — царская семья: Android — сразу после согласия, iPhone — при запуске с главного экрана (navigator.standalone).
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
/** Следующая жизнь — царская: надпись над барабаном, результат, герой; награда тратится один раз. */
async function royalLife(p, kind) {
  const again = p.locator('.summary button', { hasText: /Родиться снова/ }).first();
  if (await again.count()) await again.click();
  await p.waitForSelector('.menu .slot-machine');
  if (await p.$('.sheet')) await p.click('.sheet-done');
  console.log(kind, '| ярлык на барабане:', await p.$$eval('.reel-tag', (els) => els.map((e) => e.innerText).join(' ')));
  await p.click('.spin-button'); await p.waitForSelector('.spin-result');
  console.log(kind, '| результат:', await p.$eval('.spin-result .lead', (e) => e.innerText));
  await p.screenshot({ path: `${dir}/install-royal-${kind}.png` });
  await p.click('.spin-result .primary'); await p.waitForSelector('.reveal');
  console.log(kind, '| сословие героя:', await p.$eval('.reveal .facts', (e) => e.innerText.split('\n').slice(6, 8).join(': ')));
  console.log(kind, '| награда потрачена:', await p.evaluate(() => JSON.parse(localStorage.getItem('thousands.prefs') || '{}').royal));
}
(async () => {
  const b = await chromium.launch();
  // iPhone, игра открыта с иконки на главном экране: награда сразу (хранилище там своё, жизней ещё нет).
  {
    const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ru-RU', reducedMotion: 'reduce' });
    await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }));
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:5174/?ab=a'); await p.waitForSelector('.menu .slot-machine');
    await p.waitForTimeout(500);
    console.log('ios-home | тост награды:', await p.$eval('.toast', (e) => e.innerText).catch(() => 'НЕТ'));
    console.log('ios-home | карточки установки нет:', !(await p.$('.install-card')));
    await royalLife(p, 'ios-home');
    await p.reload(); await p.waitForSelector('.menu .slot-machine'); await p.waitForTimeout(500);
    console.log('ios-home | после перезапуска награды нет:', !(await p.$('.reel-tag')) && !(await p.$('.toast.ach-toast')));
    console.log('ios-home', { errors: errs.slice(0, 3) });
    await ctx.close();
  }
  for (const kind of ['ios', 'android']) {
    const ctx = await b.newContext(kind === 'ios' ? { ...devices['iPhone 13'], locale: 'ru-RU', reducedMotion: 'reduce' } : { viewport: { width: 412, height: 860 }, locale: 'ru-RU', reducedMotion: 'reduce', isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
    await ctx.route(/\/flags\.json/, async (r) => { const f = await (await r.fetch()).json(); r.fulfill({ json: { ...f, protected_lives: 0, year_sec_child: 1, year_sec: 1 } }) });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:5174/?ab=a'); await p.waitForSelector('.menu .slot-machine');
    console.log(kind, '| до первой жизни карточки нет:', !(await p.$('.install-card')));
    if (kind === 'android') await p.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = async () => { window.__prompted = true };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await firstLife(p);
    await p.waitForTimeout(3500);
    const card = await p.$('.summary .install-card');
    console.log(kind, '| на итогах первой жизни:', card ? (await card.innerText()).replace(/\n+/g, ' / ') : 'НЕТ');
    if (card) {
      await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: `${dir}/install-${kind}.png` });
      await p.click('.summary .install-card .primary');
      await p.waitForTimeout(300);
      if (kind === 'android') console.log(kind, '| системное окно вызвано:', await p.evaluate(() => !!window.__prompted));
      console.log(kind, '| после нажатия карточка скрыта:', !(await p.$('.install-card')));
      if (kind === 'android') {
        console.log(kind, '| тост награды:', (await p.$eval('.toast', (e) => e.innerText).catch(() => 'НЕТ')));
        await royalLife(p, kind);
      }
    }
    console.log(kind, { errors: errs.slice(0, 3) });
    await ctx.close();
  }
  await b.close();
})();
