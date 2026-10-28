// Испытание: после первой жизни — карточка; во второй — напоминание и «пройдено» после N лет; у барабана — выбор судьбы.
// Для скорости: защита выключена, испытание — 3 года, год — 1 с (подмена /flags.json).
const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
const AGAIN = /Родиться снова/;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce', deviceScaleFactor: 2 });
  await ctx.route(/\/flags\.json/, async (r) => { const f = await (await r.fetch()).json(); r.fulfill({ json: { ...f, protected_lives: 0, challenge_age: 3, year_sec_child: 1, year_sec: 1, ab_buckets: { a: 1 } } }) });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const play = async (until, ms = 300000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await until()) return true;
      if (await p.$('.dream-modal')) {
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
    return false;
  };
  const born = async () => { await p.click('.spin-button'); await p.click('.spin-result .primary'); await p.waitForSelector('.reveal') };
  await p.goto('http://localhost:5174/?ab=a'); await p.waitForSelector('.menu .slot-machine');
  // 1. Первая жизнь до смерти — на итогах карточка испытания.
  await born(); await p.click('.reveal .primary');
  await play(async () => !!(await p.$('.summary, .early-death')));
  for (let i = 0; i < 5 && !(await p.$('.summary')); i++) { await p.click('.screen .primary').catch(() => {}); await p.waitForTimeout(300) }
  const card = await p.$('.challenge-card');
  console.log('1) итоги первой жизни, карточка:', card ? await card.innerText() : 'НЕТ');
  if (card) { await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: `${dir}/ch-card.png` }) }
  // 2. Вторая жизнь: напоминание при рождении, «пройдено» после 3 лет.
  // «Новая жизнь» (не «Продолжить род»): при наследниках она — в нижнем ряду действий.
  await p.locator('.summary button', { hasText: AGAIN }).first().click();
  await p.waitForSelector('.menu .slot-machine');
  await born();
  console.log('2) напоминание при рождении:', await p.$eval('.challenge-note', e => e.innerText).catch(() => 'НЕТ'));
  await p.click('.reveal .primary');
  const done = await play(async () => !!(await p.$('.toast.ach-toast')) && /Испытание/.test(await p.$eval('.toast.ach-toast', e => e.innerText).catch(() => '')), 120000);
  console.log('   тост «пройдено»:', done);
  // 3. В меню у барабана — выбор судьбы; «Знатная семья» → знать или землевладельцы.
  await p.click('text=Меню').catch(() => {});
  await p.waitForSelector('.menu .slot-machine');
  if (!(await p.$('.sheet'))) await p.click('.gifts-btn').catch(() => {});
  await p.waitForSelector('.sheet .fate-picker', { timeout: 10000 }).catch(() => {});
  console.log('3) выбор судьбы в «Дарах»:', !!(await p.$('.sheet .fate-picker')));
  if (await p.$('.sheet .fate-picker')) {
    await (await p.$('.sheet')).screenshot({ path: `${dir}/ch-fate.png` });
    await p.click('.sheet .fate-options .option >> nth=0');
    await p.click('.sheet-done');
    console.log('   ярлык на барабане:', await p.$$eval('.reel-tag', (els) => els.map((e) => e.innerText).join(' ')));
    await p.click('.spin-button');
    await p.waitForSelector('.spin-result .primary:not([disabled])');
    console.log('   выпало:', await p.$eval('.spin-result p', e => e.innerText));
    await p.click('.spin-result .primary'); await p.waitForSelector('.reveal');
    console.log('   сословие на экране семьи:', await p.$$eval('.facts dd', ds => ds[3]?.innerText));
    await p.click('.reveal .primary');
    await p.click('text=Меню').catch(() => {});
    await p.waitForSelector('.menu .slot-machine');
    console.log('4) после рождения награда потрачена:', await p.evaluate(() => JSON.parse(localStorage.getItem('thousands.prefs') || '{}').fate));
  }
  console.log({ errors: errs.slice(0, 5) });
  await b.close();
})();
