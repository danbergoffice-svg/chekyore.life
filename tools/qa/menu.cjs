// Главный экран (макет A): новый игрок; вернувшийся — с «Дарами», ярлыками на барабане и панелью.
// Чтобы быстро дойти до итогов, защита первых жизней выключена и год — 1 с.
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
(async () => {
  const b = await chromium.launch();
  const theme = process.env.THEME || 'dark';
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ru-RU', reducedMotion: 'reduce', colorScheme: theme });
  await ctx.route(/\/flags\.json/, async (r) => { const f = await (await r.fetch()).json(); r.fulfill({ json: { ...f, protected_lives: 0, year_sec_child: 1, year_sec: 1 } }) });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5174/?ab=a'); await p.waitForSelector('.menu .slot-machine'); await p.waitForTimeout(600);
  await p.screenshot({ path: `${dir}/menu-new.png` });
  console.log('новый игрок | кнопки «Дары» нет:', !(await p.$('.gifts-btn')), '| ссылки:', await text(p, '.menu-nav'));
  await firstLife(p);
  // «Родиться снова» → меню: после жизни панель сама не открывается (дар дня был на итогах), его можно забрать в «Дарах».
  await p.locator('.summary button', { hasText: /Родиться снова/ }).first().click();
  await p.waitForSelector('.menu .slot-machine'); await p.waitForTimeout(600);
  console.log('после жизни панель сама не открылась:', !(await p.$('.sheet')), '| кнопка:', await text(p, '.gifts-btn'));
  await p.click('.gifts-btn'); await p.waitForSelector('.sheet');
  await p.screenshot({ path: `${dir}/menu-sheet.png` });
  await p.click('.sheet .daily-card .primary'); await p.waitForTimeout(300);
  console.log('после «Забрать»:', await text(p, '.sheet .daily-card'));
  await p.click('.sheet-done'); await p.waitForTimeout(300);
  console.log('кнопка «Дары»:', await text(p, '.gifts-btn'));
  // Страна по дару: через панель → выбрать Японию → ярлык на барабане.
  await p.click('.gifts-btn'); await p.waitForSelector('.sheet');
  await p.click('.sheet-pick'); await p.waitForSelector('#country-title');
  await p.click('.modal .option:has-text("Япония")'); await p.waitForTimeout(400);
  console.log('ярлыки на барабане:', await p.$$eval('.reel-tag', (els) => els.map((e) => e.innerText)));
  await p.screenshot({ path: `${dir}/menu-return.png` });
  await p.setViewportSize({ width: 360, height: 640 }); await p.waitForTimeout(300);
  const box = await (await p.$('.spin-button')).boundingBox();
  console.log('«Крути» на 360×640:', box.y + box.height <= 640, Math.round(box.y + box.height));
  await p.screenshot({ path: `${dir}/menu-return-360.png` });
  // Следующий день, новый заход: дар ждёт — панель открывается сама, один раз.
  await p.setViewportSize({ width: 390, height: 844 });
  await p.evaluate(() => {
    const d = new Date(Date.now() - 86400000), pad = (n) => String(n).padStart(2, '0');
    const x = JSON.parse(localStorage.getItem('thousands.prefs') || '{}');
    x.daily = { last: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, day: 1 };
    localStorage.setItem('thousands.prefs', JSON.stringify(x));
  });
  await p.reload(); await p.waitForSelector('.menu .slot-machine'); await p.waitForTimeout(1200);
  console.log('новый день: панель открылась сама:', !!(await p.$('.sheet')));
  await p.click('.sheet-done'); await p.reload(); await p.waitForSelector('.menu .slot-machine'); await p.waitForTimeout(1200);
  console.log('повторный заход в тот же день: панель сама не открылась:', !(await p.$('.sheet')));
  console.log({ errors: errs.slice(0, 3) });
  await b.close();
})();
