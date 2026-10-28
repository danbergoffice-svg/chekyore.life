// «На главный экран»: после первой жизни — карточка. iPhone (Safari) — подсказка; Android — системное окно
// (событие beforeinstallprompt имитируем). Защита выключена и год — 1 с, чтобы быстро дойти до смерти.
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
(async () => {
  const b = await chromium.launch();
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
    }
    console.log(kind, { errors: errs.slice(0, 3) });
    await ctx.close();
  }
  await b.close();
})();
