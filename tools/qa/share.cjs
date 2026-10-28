// Карточка «Поделиться» в самой игре: первая жизнь до итогов, окно «Поделиться», формат «История» по умолчанию.
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
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ru-RU', reducedMotion: 'reduce' });
  await ctx.route(/\/flags\.json/, async (r) => { const f = await (await r.fetch()).json(); r.fulfill({ json: { ...f, protected_lives: 0, year_sec_child: 1, year_sec: 1 } }) });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5174/?ab=a'); await p.waitForSelector('.menu .slot-machine');
  await firstLife(p);
  await p.locator('.summary button', { hasText: /Поделиться/ }).first().click();
  await p.waitForSelector('.modal.share canvas');
  await p.waitForTimeout(1500);
  const active = await p.$eval('.modal.share .filters .chip.active', (e) => e.innerText);
  const label = await p.$eval('.modal.share canvas', (e) => e.getAttribute('aria-label'));
  console.log('формат по умолчанию:', active, '| карточка:', label);
  const data = await p.$eval('.modal.share canvas', (el) => el.toDataURL('image/png'));
  require('fs').writeFileSync(`${dir}/share-story.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log({ errors: errs.slice(0, 3) });
  await b.close();
})();
