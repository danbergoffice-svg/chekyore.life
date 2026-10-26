const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce', deviceScaleFactor: 2 });
  await ctx.route(/fonts\.(googleapis|gstatic)|mc\.yandex/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()) });
  await p.goto('http://localhost:5174/'); await p.waitForSelector('.menu');
  await p.click('.menu .stack .primary');
  await p.waitForSelector('.lever:not([disabled])', { timeout: 15000 });
  await p.click('.lever'); await p.waitForSelector('.spin-result'); await p.click('.spin-result .primary');
  await p.click('.reveal .primary');
  const t0 = Date.now();
  await p.waitForSelector('.modal .choices', { timeout: 15000 });
  console.log('first choice after', ((Date.now() - t0) / 1000).toFixed(1), 's:', await p.$eval('#ev-title', e => e.innerText));
  await p.screenshot({ path: `${dir}/p2-first.png` });
  await p.click('.choices .choice');
  await p.click('.outcome .primary');
  console.log('speed hint:', await p.$eval('.hint', e => e.innerText).catch(() => 'none'));
  await p.screenshot({ path: `${dir}/p2-hint.png` });
  await p.click('.hint').catch(() => {});
  let chapter = false, focusHint = false, heroHint = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 200000) {
    if (await p.$('.modal.chapter')) {
      const age = await p.$eval('.modal.chapter .eyebrow', e => e.innerText);
      if (!chapter) { await p.screenshot({ path: `${dir}/p2-chapter.png` }); console.log('chapter:', age, await p.$eval('.modal.chapter .modal-body', e => e.innerText.replace(/\n+/g, ' | '))) }
      chapter = true; await p.click('.modal.chapter .primary'); continue;
    }
    if (await p.$('.modal')) {
      if (await p.$('.outcome')) { await p.click('.outcome .primary', { timeout: 1000 }).catch(() => {}); continue; }
      const opts = await p.$$('.choices .choice:not([disabled]), .choices .primary');
      if (opts.length) await opts[0].click({ timeout: 1000 }).catch(() => {});
      continue;
    }
    if (await p.$('.summary, .early-death')) break;
    const h = await p.$$eval('.hint', hs => hs.map(x => x.innerText));
    if (h.some(x => /фокус/.test(x)) && !focusHint) { focusHint = true; console.log('focus hint:', h) }
    if (h.some(x => /Герой/.test(x)) && !heroHint) { heroHint = true; console.log('hero hint:', h); await p.screenshot({ path: `${dir}/p2-herohint.png` }) }
    const age = +(((await p.$eval('.hero-bar', e => e.innerText).catch(() => '')).match(/(\d+)\s+(?:год|лет)/) || [])[1] || 0);
    if (age >= 17 && chapter) break;
    await p.click('.speed .chip:last-child', { timeout: 300 }).catch(() => {});
    await p.waitForTimeout(10);
  }
  console.log({ chapter, focusHint, heroHint, errors: errs.slice(0, 5) });
  await b.close();
})();
