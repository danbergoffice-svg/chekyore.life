// Главное меню с барабаном и пробный период «отзыв → выбор страны» на 390×844.
// Чтобы быстро дойти до смерти, защита первых жизней выключена подменой /flags.json.
const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce', deviceScaleFactor: 2 });
  await ctx.route(/fonts\.(googleapis|gstatic)|mc\.yandex/, r => r.abort());
  await ctx.route(/\/flags\.json/, async (r) => {
    const res = await r.fetch(); const f = await res.json();
    r.fulfill({ json: { ...f, protected_lives: 0, year_sec_child: 1, year_sec: 1 } });
  });
  await ctx.route(/\/api\/(feedback|events)/, r => r.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|404/.test(m.text())) errs.push(m.text()) });
  await p.goto('http://localhost:5174/?ab=a'); await p.waitForSelector('.menu .slot-machine');
  await p.screenshot({ path: `${dir}/c-menu-new.png` });
  await p.screenshot({ path: `${dir}/c-menu-new-full.png`, fullPage: true });
  console.log('без «Продолжить» у нового игрока:', !(await p.$('.continue')));
  // Жизнь до смерти.
  await p.click('.spin-button');
  await p.click('.spin-result .primary');
  await p.click('.reveal .primary');
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    if (await p.$('.summary, .early-death')) break;
    if (await p.$('.dream-modal')) {
      // Сон: в числа — 10, в доли — что есть, в выбор — первый вариант, дальше «Готово»/«Дальше».
      for (const inp of await p.$$('.dream-modal input')) await inp.fill('10').catch(() => {});
      const pick = await p.$('.dream-pick button, .dream-order-btns button');
      if (pick) await pick.click({ timeout: 500 }).catch(() => {});
      await p.click('.dream-modal .primary:not([disabled])', { timeout: 800 }).catch(() => {});
      continue;
    }
    if (await p.$('.modal')) {
      if (await p.$('.outcome')) { await p.click('.outcome .primary', { timeout: 1000 }).catch(() => {}); continue; }
      const opts = await p.$$('.choices .choice:not([disabled]), .choices .primary, .modal .primary');
      if (opts.length) await opts[0].click({ timeout: 1000 }).catch(() => {});
      continue;
    }
    if (await p.$('.death, .screen.dead')) await p.click('.screen .primary', { timeout: 500 }).catch(() => {});
    await p.click('.speed .chip:last-child', { timeout: 300 }).catch(() => {});
    await p.waitForTimeout(20);
  }
  for (let i = 0; i < 5 && !(await p.$('.summary')); i++) { await p.click('.screen .primary').catch(() => {}); await p.waitForTimeout(300) }
  if (!(await p.$('.summary'))) {
    await p.screenshot({ path: `${dir}/c-stuck.png` });
    console.log('застряли:', (await p.evaluate(() => document.body.innerText)).slice(0, 400));
  }
  const prompt = await p.$('.feedback-prompt');
  console.log('итоги:', !!(await p.$('.summary')), 'приглашение:', prompt ? await prompt.innerText() : null);
  if (prompt) {
    await prompt.scrollIntoViewIfNeeded(); await prompt.screenshot({ path: `${dir}/c-prompt.png` });
    await p.click('.feedback-prompt .primary');
    await p.click('.stars .star:nth-child(5)');
    await p.fill('.fb-q textarea >> nth=0', 'Барабаны и сны');
    await p.click('.feedback .primary');
    await p.waitForSelector('#country-title');
    await p.screenshot({ path: `${dir}/c-country.png` });
    await p.click('.modal .option:has-text("Япония")');
    await p.waitForSelector('.menu .picked-country');
    await (await p.$('.menu .spin')).screenshot({ path: `${dir}/c-menu-picked.png` });
    console.log('строка выбора:', await p.$eval('.picked-country', e => e.innerText));
    await p.click('.spin-button');
    await p.waitForSelector('.spin-result .primary:not([disabled])');
    console.log('выпало:', await p.$eval('.spin-result p', e => e.innerText));
    // Настройки жизни: выбор страны открыт.
    await p.goto('http://localhost:5174/?ab=a'); await p.waitForSelector('.menu .slot-machine');
    await p.click('text=Настроить жизнь');
    await p.waitForSelector('#setup-title');
    await p.screenshot({ path: `${dir}/c-setup.png` });
  }
  console.log({ errors: errs.slice(0, 5) });
  await b.close();
})();
